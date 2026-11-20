import type { Prisma, Product } from "@prisma/client";
import type { z } from "zod";
import { db, HttpError, transaction } from "./db.js";
import { localDate, productOffer } from "./rules.js";
import type { createProductInput, invoiceInput, patchProductInput, stockInput } from "./validation.js";

type Tx = Prisma.TransactionClient;
type InvoiceData = z.output<typeof invoiceInput>;
const productInclude = { items: { include: { product: { select: { id: true, name: true, sku: true } } } } } as const;

export function presentProduct(product: Product) {
  return { ...product, ...productOffer(product) };
}

export async function catalog(businessId: string, search: string, skip: number, take: number, publicOnly = false) {
  const where: Prisma.ProductWhereInput = {
    businessId, archivedAt: null,
    ...(publicOnly && { isFrozen: false, stock: { gt: 0 }, AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: localDate() } }] }] }),
    ...(search && { OR: [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
    ] }),
  };
  const [items, total] = await db.$transaction([
    db.product.findMany({ where, skip, take, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    db.product.count({ where }),
  ]);
  return { items: items.map(product => {
    const view = presentProduct(product);
    if (!publicOnly) return view;
    const { id, name, sku, description, price, salePrice, discountPercent, stock, expiresAt } = view;
    return { id, name, sku, description, price, salePrice, discountPercent, stock, expiresAt };
  }), total };
}

async function getProduct(tx: Tx, businessId: string, id: string, active = true) {
  const product = await tx.product.findUnique({ where: { businessId_id: { businessId, id } } });
  if (!product || (active && product.archivedAt)) throw new HttpError(404, "Producto no encontrado.");
  return product;
}

export async function productDetails(businessId: string, id: string) {
  const product = await getProduct(db, businessId, id);
  const movements = await db.stockMovement.findMany({
    where: { businessId, productId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30,
  });
  return { ...presentProduct(product), movements };
}

export async function changeStock(tx: Tx, businessId: string, productId: string, quantity: number, reason: string, referenceId?: string) {
  if (!quantity) return;
  const where: Prisma.ProductWhereInput = { businessId, id: productId, stock: { gte: Math.max(0, -quantity), lte: 2_000_000_000 - quantity } };
  const result = await tx.product.updateMany({ where, data: { stock: { increment: quantity } } });
  if (!result.count) throw new HttpError(409, "El ajuste deja un stock inválido. Revisa las existencias.");
  await tx.stockMovement.create({ data: { businessId, productId, quantity, reason, referenceId } });
}

export async function createProduct(businessId: string, data: z.output<typeof createProductInput>) {
  return transaction(async tx => {
    const product = await tx.product.create({ data: { ...data, businessId } });
    if (data.stock) {
      await tx.stockMovement.create({ data: { businessId, productId: product.id, quantity: data.stock, reason: "Stock inicial" } });
    }
    return presentProduct(product);
  });
}

export async function updateProduct(businessId: string, id: string, data: z.output<typeof patchProductInput>) {
  return transaction(async tx => {
    await getProduct(tx, businessId, id);
    return presentProduct(await tx.product.update({ where: { id }, data }));
  });
}

export async function archiveProduct(businessId: string, id: string) {
  return transaction(async tx => {
    await getProduct(tx, businessId, id);
    await tx.product.update({ where: { id }, data: { archivedAt: new Date() } });
  });
}

export async function freezeProduct(businessId: string, id: string, target?: boolean) {
  return transaction(async tx => {
    const product = await getProduct(tx, businessId, id);
    return presentProduct(await tx.product.update({ where: { id }, data: { isFrozen: target ?? !product.isFrozen } }));
  });
}

export async function adjustProduct(businessId: string, id: string, data: z.output<typeof stockInput>) {
  return transaction(async tx => {
    await getProduct(tx, businessId, id);
    await changeStock(tx, businessId, id, data.quantity, data.reason);
    return presentProduct(await getProduct(tx, businessId, id));
  });
}

export async function listInvoices(businessId: string, skip: number, take: number) {
  const where = { businessId };
  const [items, total] = await db.$transaction([
    db.invoice.findMany({ where, skip, take, orderBy: [{ issuedOn: "desc" }, { id: "desc" }], include: productInclude }),
    db.invoice.count({ where }),
  ]);
  return { items, total };
}

async function getInvoice(tx: Tx, businessId: string, id: string) {
  const invoice = await tx.invoice.findUnique({ where: { businessId_id: { businessId, id } }, include: productInclude });
  if (!invoice) throw new HttpError(404, "Factura no encontrada.");
  return invoice;
}

export const invoiceDetails = (businessId: string, id: string) => getInvoice(db, businessId, id);

async function applyInvoiceDelta(tx: Tx, businessId: string, invoiceId: string,
  before: { productId: string; quantity: number }[], after: { productId: string; quantity: number }[], reason: string) {
  const previous = new Map(before.map(item => [item.productId, item.quantity]));
  const next = new Map(after.map(item => [item.productId, item.quantity]));
  const ids = [...new Set([...previous.keys(), ...next.keys()])].sort();
  for (const productId of ids) {
    const delta = (next.get(productId) ?? 0) - (previous.get(productId) ?? 0);
    await getProduct(tx, businessId, productId, delta > 0);
    await changeStock(tx, businessId, productId, delta, reason, invoiceId);
  }
}

export async function saveInvoice(businessId: string, data: InvoiceData, id?: string) {
  return transaction(async tx => {
    const { items, ...header } = data;
    const total = items.reduce((sum, line) => sum + BigInt(line.quantity) * BigInt(line.unitCost), 0n);
    const previous = id ? await getInvoice(tx, businessId, id) : null;
    if (previous?.cancelledAt) throw new HttpError(409, "La factura fue anulada.");
    const invoice = previous
      ? await tx.invoice.update({ where: { id: previous.id }, data: { ...header, total } })
      : await tx.invoice.create({ data: { ...header, total, businessId } });
    await applyInvoiceDelta(tx, businessId, invoice.id, previous?.items ?? [], items,
      previous ? "Corrección de factura" : "Ingreso por factura");
    if (previous) await tx.invoiceItem.deleteMany({ where: { businessId, invoiceId: invoice.id } });
    await tx.invoiceItem.createMany({ data: items.map(item => ({ ...item, businessId, invoiceId: invoice.id })) });
    return getInvoice(tx, businessId, invoice.id);
  });
}

export async function cancelInvoice(businessId: string, id: string) {
  return transaction(async tx => {
    const invoice = await getInvoice(tx, businessId, id);
    if (invoice.cancelledAt) return invoice;
    await applyInvoiceDelta(tx, businessId, id, invoice.items, [], "Anulación de factura");
    await tx.invoice.update({ where: { id }, data: { cancelledAt: new Date() } });
    return getInvoice(tx, businessId, id);
  });
}
