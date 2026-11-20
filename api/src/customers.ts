import { Prisma } from "@prisma/client";
import { settings } from "./config.js";
import { db, HttpError } from "./db.js";
import { frequency, localDate, zone } from "./rules.js";
import { qrPng } from "./qr.js";

export const segments = ["VIP", "REGULAR", "INFREQUENT", "AT_RISK"] as const;
type Segment = typeof segments[number];
type CustomerRow = {
  id: string; name: string; email: string; segment: Segment; approvedOrdersCount: number;
  daysSinceLastPurchase: number | null; lastPurchaseAt: Date | null; marketingOptIn: boolean;
};

const classified = (businessId: string) => Prisma.sql`
  WITH customers AS (
    SELECT c.id, u.name, u.email, c."approvedOrdersCount", c."lastPurchaseAt", c."marketingOptIn",
           (now() AT TIME ZONE ${zone})::date - (COALESCE(c."lastPurchaseAt", c."createdAt") AT TIME ZONE ${zone})::date AS elapsed
    FROM "Customer" c JOIN "User" u ON c."userId" = u.id
    WHERE c."businessId" = ${businessId}
  ), classified AS (
    SELECT id, name, email, "approvedOrdersCount", "lastPurchaseAt", "marketingOptIn",
           CASE WHEN "lastPurchaseAt" IS NOT NULL THEN elapsed END AS "daysSinceLastPurchase",
           CASE WHEN elapsed >= 60 THEN 'AT_RISK'
                WHEN "approvedOrdersCount" >= 5 AND elapsed <= 30 THEN 'VIP'
                WHEN "approvedOrdersCount" >= 2 AND elapsed <= 45 THEN 'REGULAR'
                ELSE 'INFREQUENT' END AS segment
    FROM customers
  )
`;

export async function customerRanking(businessId: string, skip: number, take: number, segment?: Segment) {
  const base = classified(businessId);
  const filter = segment ? Prisma.sql`WHERE segment = ${segment}` : Prisma.empty;
  const [items, counts] = await db.$transaction([
    db.$queryRaw<CustomerRow[]>`
      ${base} SELECT * FROM classified ${filter}
      ORDER BY "approvedOrdersCount" DESC, "lastPurchaseAt" DESC NULLS LAST, id
      OFFSET ${skip} LIMIT ${take}
    `,
    db.$queryRaw<{ segment: Segment; count: bigint }[]>`
      ${base} SELECT segment, count(*) AS count FROM classified GROUP BY segment
    `,
  ]);
  const summary = Object.fromEntries(segments.map(key => [key, Number(counts.find(entry => entry.segment === key)?.count ?? 0)]));
  return { items, counts: summary, total: segment ? summary[segment] : Object.values(summary).reduce((a, b) => a + b, 0) };
}

export async function customerCounts(businessId: string) {
  return db.$queryRaw<{ segment: Segment; count: bigint }[]>`
    ${classified(businessId)} SELECT segment, count(*) AS count FROM classified GROUP BY segment
  `;
}

export async function customerCoupons(businessId: string, customerId: string, skip: number, take: number) {
  const where = { businessId, customerId };
  const [coupons, total] = await db.$transaction([
    db.coupon.findMany({ where, skip, take, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, code: true, expiresAt: true, usedAt: true, minPurchaseAmount: true, maxDiscountAmount: true, percent: true } }),
    db.coupon.count({ where }),
  ]);
  return { items: coupons.map(coupon => ({
    ...coupon, qrBase64: `data:image/png;base64,${qrPng(coupon.code).toString("base64")}`,
  })), total };
}

export async function queueReminder(businessId: string, id: string) {
  const customer = await db.customer.findUnique({ where: { businessId_id: { businessId, id } }, include: { user: true, business: true } });
  if (!customer) throw new HttpError(404, "Cliente no encontrado.");
  const { segment } = frequency(customer.approvedOrdersCount, customer.lastPurchaseAt, customer.createdAt);
  if (!customer.marketingOptIn || (segment !== "INFREQUENT" && segment !== "AT_RISK")) {
    throw new HttpError(409, "El cliente debe pertenecer a un segmento inactivo y aceptar novedades.");
  }
  const dedupeKey = `reminder:${id}:${localDate().toISOString().slice(0, 10)}`;
  const result = await db.mailJob.upsert({
    where: { dedupeKey }, update: {},
    create: {
      businessId, dedupeKey, marketingCustomerId: id, recipient: customer.user.email,
      subject: `Te esperamos en ${customer.business.name}`,
      body: `Hola ${customer.user.name}. Nos gustaría verte de nuevo en ${customer.business.name}. Revisa las novedades y ofertas disponibles en ${settings.appOrigin}/tienda/${customer.business.slug}.\n\nPuedes cambiar tus preferencias en ${settings.appOrigin}/tienda/${customer.business.slug}#preferencias.`,
    },
    select: { id: true, status: true },
  });
  return result;
}
