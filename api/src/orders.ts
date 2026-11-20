import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { settings } from "./config.js";
import { db, HttpError, transaction } from "./db.js";
import { changeStock } from "./inventory.js";
import { dayMs, discountFor, localDate, productOffer } from "./rules.js";
import type { checkoutInput } from "./validation.js";

type Checkout = z.output<typeof checkoutInput>;
const orderRelations = {
  items: true,
  customer: { select: { id: true, user: { select: { name: true, email: true } } } },
  earnedCoupon: { select: { code: true, expiresAt: true } },
} as const;

export async function ensureCustomer(businessId: string, userId: string) {
  return db.customer.upsert({
    where: { businessId_userId: { businessId, userId } }, create: { businessId, userId }, update: {},
  });
}

export async function getCustomer(businessId: string, userId: string) {
  return db.customer.findUnique({ where: { businessId_userId: { businessId, userId } } });
}

export async function listOrders(businessId: string, skip: number, take: number, customerId?: string, status?: "PENDING" | "APPROVED" | "FAILED") {
  const where = { businessId, customerId, status };
  const [items, total] = await db.$transaction([
    db.order.findMany({ where, skip, take, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: orderRelations }),
    db.order.count({ where }),
  ]);
  return { items, total };
}

export async function placeOrder(businessId: string, customerId: string, data: Checkout) {
  try {
    return await transaction(async tx => {
      const key = { businessId, customerId, checkoutKey: data.checkoutKey };
      const previous = await tx.order.findUnique({ where: { businessId_customerId_checkoutKey: key }, include: orderRelations });
      if (previous) return previous;
      const now = new Date();
      const today = localDate(now);
      const products = await tx.product.findMany({
        where: { businessId, id: { in: data.items.map(item => item.productId) } },
      });
      const byId = new Map(products.map(product => [product.id, product]));
      const items = data.items.map(({ productId, quantity }) => {
        const product = byId.get(productId);
        const offer = product && productOffer(product, today);
        if (!product || !offer?.available || product.stock < quantity) {
          throw new HttpError(409, product ? `Stock insuficiente o producto no disponible: ${product.name}.` : "Producto no disponible.");
        }
        return { productId, quantity, productName: product.name, unitPrice: offer.salePrice, discountPercent: offer.discountPercent };
      });
      const subtotal = items.reduce((sum, item) => sum + BigInt(item.unitPrice) * BigInt(item.quantity), 0n);
      const coupon = data.couponCode ? await tx.coupon.findFirst({ where: { code: data.couponCode, businessId, customerId } }) : null;
      const discount = coupon ? discountFor(coupon, subtotal, now) : data.couponCode ? null : 0n;
      if (discount === null) throw new HttpError(409, "Cupón inválido, vencido, usado o bajo el mínimo de compra.");
      const order = await tx.order.create({ data: {
        ...key, requestedCouponId: coupon?.id, subtotal, discountAmount: discount, total: subtotal - discount,
      } });
      let runningSubtotal = 0n;
      let allocated = 0n;
      await tx.orderItem.createMany({ data: items.map(item => {
        runningSubtotal += BigInt(item.unitPrice) * BigInt(item.quantity);
        const cumulativeDiscount = subtotal ? discount * runningSubtotal / subtotal : 0n;
        const share = cumulativeDiscount - allocated;
        allocated = cumulativeDiscount;
        return { ...item, businessId, orderId: order.id, discountShare: share };
      }) });
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderRelations });
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      const previous = await db.order.findUnique({
        where: { businessId_customerId_checkoutKey: { businessId, customerId, checkoutKey: data.checkoutKey } }, include: orderRelations,
      });
      if (previous) return previous;
    }
    throw error;
  }
}

export async function resolveOrder(businessId: string, id: string, status: "APPROVED" | "FAILED") {
  return transaction(async tx => {
    const order = await tx.order.findUnique({
      where: { businessId_id: { businessId, id } },
      include: { items: { orderBy: { productId: "asc" } }, requestedCoupon: true, business: true },
    });
    if (!order) throw new HttpError(404, "Pedido no encontrado.");
    const readOrder = () => tx.order.findUniqueOrThrow({ where: { id }, include: orderRelations });
    if (order.status === status) return readOrder();
    if (order.status !== "PENDING") throw new HttpError(409, "El pedido ya fue resuelto.");
    if (status === "FAILED") {
      await tx.order.update({ where: { id }, data: { status } });
      return readOrder();
    }

    const now = new Date();
    const today = localDate(now);
    for (const item of order.items) {
      const product = await tx.product.findUnique({ where: { businessId_id: { businessId, id: item.productId } } });
      if (!product || !productOffer(product, today).available || product.stock < item.quantity) {
        throw new HttpError(409, `No se puede aprobar. Producto sin stock o no disponible: ${item.productName}.`);
      }
      await changeStock(tx, businessId, item.productId, -item.quantity, "Venta aprobada", id);
    }
    if (order.requestedCoupon) {
      const discount = discountFor(order.requestedCoupon, order.subtotal, now);
      if (discount === null || discount !== order.discountAmount) throw new HttpError(409, "El cupón dejó de estar disponible.");
      await tx.coupon.update({ where: { id: order.requestedCoupon.id }, data: { usedAt: now } });
    }
    await tx.order.update({ where: { id }, data: { status, approvedAt: now } });
    const customer = await tx.customer.update({
      where: { businessId_id: { businessId, id: order.customerId } },
      data: { approvedOrdersCount: { increment: 1 }, lastPurchaseAt: now },
      include: { user: true },
    });
    if (customer.approvedOrdersCount >= 2) await rewardCustomer(tx, order.business, customer, id, now);
    return readOrder();
  });
}

async function rewardCustomer(tx: Prisma.TransactionClient, business: { id: string; name: string; slug: string },
  customer: { id: string; user: { email: string; name: string } }, orderId: string, now: Date) {
  const code = `IMP-${randomBytes(10).toString("hex").toUpperCase()}`;
  const coupon = await tx.coupon.create({ data: {
    code, businessId: business.id, customerId: customer.id, earnedFromOrderId: orderId,
    expiresAt: new Date(now.getTime() + 14 * dayMs), minPurchaseAmount: 5_000, maxDiscountAmount: 3_000, percent: 15,
  } });
  await tx.mailJob.create({ data: {
    businessId: business.id, dedupeKey: `coupon:${coupon.id}`, recipient: customer.user.email,
    subject: `Tu cupón de ${business.name}`,
    body: `Hola ${customer.user.name}. Gracias por comprar en ${business.name}. Usa el código ${code} para un 15 % de descuento en compras desde $5.000, con tope de $3.000. Válido por 14 días en esta tienda.\n\n${settings.appOrigin}/tienda/${business.slug}`,
    couponCode: code,
  } });
}
