import { settings } from "./config.js";
import { db } from "./db.js";
import { createProduct, freezeProduct } from "./inventory.js";
import { ensureCustomer, placeOrder, resolveOrder } from "./orders.js";
import { dayMs, localDate } from "./rules.js";
import { demoAccounts } from "./demo-accounts.js";
import { hashPassword } from "./passwords.js";

async function seed() {
  if (!settings.demoMode) throw new Error("Activa DEMO_MODE=true en api/.env para cargar datos ficticios.");
  const [owner, buyer] = await Promise.all(demoAccounts.map(async ({ password, ...account }) => {
    const passwordHash = await hashPassword(password);
    return db.user.upsert({ where: { id: account.id }, update: { passwordHash },
      create: { ...account, passwordHash } });
  }));
  const guest = await db.user.upsert({ where: { id: "demo-guest" }, update: {},
    create: { id: "demo-guest", name: "Antonia", email: "antonia@impulso.test" } });
  const business = await db.business.upsert({
    where: { id: "demo-business" }, update: {},
    create: { id: "demo-business", slug: "mercado-demo", name: "Mercado del Valle" },
  });
  await db.membership.upsert({
    where: { userId_businessId: { userId: owner.id, businessId: business.id } }, update: {},
    create: { userId: owner.id, businessId: business.id },
  });
  await db.subscription.upsert({ where: { businessId: business.id }, update: {}, create: { businessId: business.id } });
  const customer = await ensureCustomer(business.id, buyer.id);
  await db.customer.upsert({
    where: { businessId_userId: { businessId: business.id, userId: guest.id } }, update: {},
    create: { businessId: business.id, userId: guest.id, marketingOptIn: true, createdAt: new Date(Date.now() - 70 * dayMs) },
  });

  const example = [
    { name: "Miel de quillay", sku: "MIEL-01", price: 6400, stock: 26, lowStockThreshold: 5, expiresAt: null, description: "Miel de origen local, frasco de 450 g." },
    { name: "Granola artesanal", sku: "GRAN-02", price: 3900, stock: 14, lowStockThreshold: 5, expiresAt: new Date(localDate().getTime() + 3 * dayMs), description: "Avena, semillas y frutos secos, 350 g." },
    { name: "Mermelada de frutilla", sku: "MERM-03", price: 4300, stock: 4, lowStockThreshold: 5, expiresAt: null, description: "Elaborada en pequeños lotes, frasco de 250 g." },
    { name: "Té de hierbas", sku: "TE-04", price: 2900, stock: 18, lowStockThreshold: 5, expiresAt: null, description: "Mezcla de hierbas en hojas, 80 g." },
  ];
  for (const data of example) {
    const existing = await db.product.findUnique({ where: { businessId_sku: { businessId: business.id, sku: data.sku } } });
    if (!existing) {
      const product = await createProduct(business.id, data);
      if (data.sku === "TE-04") await freezeProduct(business.id, product.id, true);
    }
  }
  const honey = await db.product.findUniqueOrThrow({ where: { businessId_sku: { businessId: business.id, sku: "MIEL-01" } } });
  for (let i = 1; i <= 3; i++) {
    const checkoutKey = `00000000-0000-4000-8000-00000000000${i}`;
    const previous = await db.order.findUnique({
      where: { businessId_customerId_checkoutKey: { businessId: business.id, customerId: customer.id, checkoutKey } },
    });
    const order = previous ?? await placeOrder(business.id, customer.id, { checkoutKey, items: [{ productId: honey.id, quantity: i }] });
    if (i < 3 && order.status === "PENDING") await resolveOrder(business.id, order.id, "APPROVED");
  }
  console.log("Datos de demostración disponibles.");
}
try {
  await seed();
} finally {
  await db.$disconnect();
}
