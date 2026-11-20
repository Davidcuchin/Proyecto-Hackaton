import { settings } from "./config.js";
import { db } from "./db.js";
import { createProduct, freezeProduct } from "./inventory.js";
import { ensureCustomer, placeOrder, resolveOrder } from "./orders.js";
import { dayMs, localDate, productOffer } from "./rules.js";
import { demoAccounts } from "./demo-accounts.js";
import { hashPassword } from "./passwords.js";

type DemoProduct = {
  sku: string; name: string; category: string; price: number; stock: number;
  description?: string; expiresInDays?: number; frozen?: boolean;
};
type DemoShop = {
  ownerId: (typeof demoAccounts)[number]["id"];
  id: string; slug: string; name: string; logoPath?: string;
  products: DemoProduct[];
  orders: [sku: string, quantity: number, approve: boolean][];
};

const shops: DemoShop[] = [
  {
    ownerId: "demo-owner", id: "demo-business", slug: "mercado-demo", name: "Mercado del Valle",
    products: [
      { sku: "MIEL-01", name: "Miel de quillay", category: "Miel y conservas", price: 6400, stock: 26, description: "Miel de origen local, frasco de 450 g." },
      { sku: "GRAN-02", name: "Granola artesanal", category: "Despensa", price: 3900, stock: 14, expiresInDays: 3, description: "Avena, semillas y frutos secos, 350 g." },
      { sku: "MERM-03", name: "Mermelada de frutilla", category: "Miel y conservas", price: 4300, stock: 4, description: "Elaborada en pequeños lotes, frasco de 250 g." },
      { sku: "TE-04", name: "Té de hierbas", category: "Infusiones", price: 2900, stock: 18, frozen: true, description: "Mezcla de hierbas en hojas, 80 g." },
    ],
    orders: [["MIEL-01", 1, true], ["MIEL-01", 2, true], ["MIEL-01", 3, false], ["GRAN-02", 2, true], ["MERM-03", 1, true]],
  },
  {
    ownerId: "demo-hardware-owner", id: "demo-hardware", slug: "ferreteria-demo", name: "Ferretería El Martillo",
    logoPath: "/comercios/ferreteria.webp",
    products: [
      { sku: "FER-01", name: "Martillo carpintero", category: "Herramientas", price: 8990, stock: 24, description: "Cabeza de acero y mango antideslizante." },
      { sku: "FER-02", name: "Caja de tornillos para madera", category: "Fijaciones", price: 3290, stock: 42, description: "Caja de 50 unidades." },
      { sku: "FER-03", name: "Guantes de trabajo", category: "Protección", price: 4490, stock: 30, description: "Palma reforzada para trabajos de taller." },
      { sku: "FER-04", name: "Juego de destornilladores", category: "Herramientas", price: 11990, stock: 18, description: "Set de seis piezas con puntas planas y Phillips." },
    ],
    orders: [["FER-01", 2, true], ["FER-02", 4, true], ["FER-03", 3, true], ["FER-04", 1, true], ["FER-01", 1, false]],
  },
  {
    ownerId: "demo-salon-owner", id: "demo-salon", slug: "peluqueria-demo", name: "Peluquería Estilo Dorado",
    logoPath: "/comercios/peluqueria.webp",
    products: [
      { sku: "PEL-01", name: "Shampoo hidratante", category: "Cuidado capilar", price: 9990, stock: 22, description: "Shampoo de uso diario, 300 ml." },
      { sku: "PEL-02", name: "Mascarilla reparadora", category: "Tratamientos", price: 13990, stock: 20, description: "Tratamiento intensivo para puntas secas, 250 ml." },
      { sku: "PEL-03", name: "Cepillo desenredante", category: "Accesorios", price: 6990, stock: 25, description: "Cerdas flexibles para cabello húmedo o seco." },
      { sku: "PEL-04", name: "Acondicionador nutritivo", category: "Cuidado capilar", price: 10990, stock: 19, description: "Acondicionador para cabello seco, 300 ml." },
    ],
    orders: [["PEL-01", 3, true], ["PEL-02", 2, true], ["PEL-03", 2, true], ["PEL-04", 1, true], ["PEL-02", 1, false]],
  },
];

async function seedShop({ ownerId, products, orders, ...shop }: DemoShop, guestId: string) {
  const business = await db.business.upsert({
    where: { id: shop.id }, update: { logoPath: shop.logoPath }, create: shop,
  });
  await db.membership.upsert({
    where: { userId_businessId: { userId: ownerId, businessId: business.id } }, update: {},
    create: { userId: ownerId, businessId: business.id },
  });
  await db.subscription.upsert({ where: { businessId: business.id }, update: {}, create: { businessId: business.id } });
  const customer = await ensureCustomer(business.id, "demo-buyer");
  await db.customer.upsert({
    where: { businessId_userId: { businessId: business.id, userId: guestId } }, update: {},
    create: { businessId: business.id, userId: guestId, marketingOptIn: true, createdAt: new Date(Date.now() - 70 * dayMs) },
  });

  for (const { description = "", expiresInDays, frozen, ...data } of products) {
    const where = { businessId_sku: { businessId: business.id, sku: data.sku } };
    const existing = await db.product.findUnique({ where });
    if (existing) {
      if (existing.category === null) {
        await db.product.updateMany({ where: { id: existing.id, category: null }, data: { category: data.category } });
      }
      continue;
    }
    const expiresAt = expiresInDays ? new Date(localDate().getTime() + expiresInDays * dayMs) : null;
    const product = await createProduct(business.id, { ...data, description, expiresAt, lowStockThreshold: 5 });
    if (frozen) await freezeProduct(business.id, product.id, true);
  }

  for (const [index, [sku, quantity, approve]] of orders.entries()) {
    const checkoutKey = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    let order = await db.order.findUnique({
      where: { businessId_customerId_checkoutKey: { businessId: business.id, customerId: customer.id, checkoutKey } },
    });
    if (!order) {
      const product = await db.product.findUniqueOrThrow({ where: { businessId_sku: { businessId: business.id, sku } } });
      if (product.archivedAt || !productOffer(product).available || product.stock < quantity) continue;
      order = await placeOrder(business.id, customer.id, { checkoutKey, items: [{ productId: product.id, quantity }] });
    }
    if (approve && order.status === "PENDING") await resolveOrder(business.id, order.id, "APPROVED");
  }
}

async function seed() {
  if (!settings.demoMode) throw new Error("Activa DEMO_MODE=true en api/.env para cargar datos ficticios.");
  await Promise.all(demoAccounts.map(async ({ password, ...account }) => {
    const passwordHash = await hashPassword(password);
    await db.user.upsert({ where: { id: account.id }, update: { passwordHash }, create: { ...account, passwordHash } });
  }));
  const guest = await db.user.upsert({ where: { id: "demo-guest" }, update: {},
    create: { id: "demo-guest", name: "Antonia", email: "antonia@impulso.test" } });

  for (const shop of shops) await seedShop(shop, guest.id);
  console.log("Datos de demostración disponibles.");
}

try {
  await seed();
} finally {
  await db.$disconnect();
}
