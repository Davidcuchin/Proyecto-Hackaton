import { Prisma } from "@prisma/client";
import { db } from "./db.js";
import { zone } from "./rules.js";

export const periods = ["day", "week", "month", "year"] as const;
type Period = typeof periods[number];
const windows = {
  day: ["day", "hour", "1 day", "1 hour", "HH24:MI"],
  week: ["week", "day", "1 week", "1 day", "DD/MM"],
  month: ["month", "day", "1 month", "1 day", "DD/MM"],
  year: ["year", "month", "1 year", "1 month", "MM/YYYY"],
} as const;
type Bucket = { bucket: string; label: string; units: bigint; revenue: bigint; orders: bigint };
type RankedProduct = { id: string; name: string; sku: string; stock: number; units: bigint; revenue: bigint };
type CategoryRevenue = { category: string | null; revenue: bigint };

export async function sales(businessId: string, period: Period) {
  const [window, group, length, step, format] = windows[period];
  const buckets = await db.$queryRaw<Bucket[]>`
    WITH bounds AS (
      SELECT date_trunc(${window}, now() AT TIME ZONE ${zone}) AS start
    ), series AS (
      SELECT generate_series(start, start + ${length}::interval - ${step}::interval, ${step}::interval) AS slot
      FROM bounds
    ), totals AS (
      SELECT date_trunc(${group}, o."approvedAt" AT TIME ZONE ${zone}) AS slot,
             SUM(i.quantity)::bigint AS units, COUNT(DISTINCT o.id) AS orders,
             SUM(i.quantity::bigint * i."unitPrice" - i."discountShare")::bigint AS revenue
      FROM "Order" o
      JOIN "OrderItem" i ON i."businessId" = o."businessId" AND i."orderId" = o.id
      CROSS JOIN bounds b
      WHERE o."businessId" = ${businessId} AND o.status = 'APPROVED'
        AND o."approvedAt" >= (b.start AT TIME ZONE ${zone})
        AND o."approvedAt" < ((b.start + ${length}::interval) AT TIME ZONE ${zone})
      GROUP BY 1
    )
    SELECT to_char(series.slot, 'YYYY-MM-DD"T"HH24:MI:SS') AS bucket,
           to_char(series.slot, ${format}) AS label,
           COALESCE(totals.units, 0) AS units, COALESCE(totals.revenue, 0) AS revenue,
           COALESCE(totals.orders, 0) AS orders
    FROM series LEFT JOIN totals USING (slot)
    ORDER BY series.slot
  `;
  const totals = buckets.reduce((sum, row) => ({
    units: sum.units + row.units, revenue: sum.revenue + row.revenue, orders: sum.orders + row.orders,
  }), { units: 0n, revenue: 0n, orders: 0n });
  return { period, timezone: zone, buckets, totals };
}

export function salesByCategory(businessId: string) {
  return db.$queryRaw<CategoryRevenue[]>`
    SELECT p.category, SUM(i.quantity::bigint * i."unitPrice" - i."discountShare")::bigint AS revenue
    FROM "Order" o
    JOIN "OrderItem" i ON i."businessId" = o."businessId" AND i."orderId" = o.id
    JOIN "Product" p ON p."businessId" = i."businessId" AND p.id = i."productId"
    WHERE o."businessId" = ${businessId} AND o.status = 'APPROVED'
      AND o."approvedAt" >= now() - INTERVAL '30 days'
    GROUP BY p.category
    ORDER BY revenue DESC, p.category ASC NULLS LAST
  `;
}

export async function rankings(businessId: string) {
  const orderByUnits = Prisma.sql`ORDER BY units DESC, revenue DESC, id LIMIT 10`;
  const orderByRevenue = Prisma.sql`ORDER BY revenue DESC, units DESC, id LIMIT 10`;
  const base = Prisma.sql`
    WITH sold AS (
      SELECT i."productId", SUM(i.quantity)::bigint AS units,
             SUM(i.quantity::bigint * i."unitPrice" - i."discountShare")::bigint AS revenue
      FROM "Order" o JOIN "OrderItem" i ON i."businessId" = o."businessId" AND i."orderId" = o.id
      WHERE o."businessId" = ${businessId} AND o.status = 'APPROVED'
        AND o."approvedAt" >= now() - INTERVAL '30 days'
      GROUP BY i."productId"
    ), ranked AS (
      SELECT p.id, p.name, p.sku, p.stock, p."archivedAt",
             COALESCE(s.units, 0) AS units, COALESCE(s.revenue, 0) AS revenue
      FROM "Product" p LEFT JOIN sold s ON s."productId" = p.id
      WHERE p."businessId" = ${businessId}
    )
    SELECT id, name, sku, stock, units, revenue FROM ranked
  `;
  const [byUnits, byRevenue, stagnant] = await db.$transaction([
    db.$queryRaw<RankedProduct[]>(Prisma.sql`${base} WHERE units > 0 ${orderByUnits}`),
    db.$queryRaw<RankedProduct[]>(Prisma.sql`${base} WHERE units > 0 ${orderByRevenue}`),
    db.$queryRaw<RankedProduct[]>(Prisma.sql`${base} WHERE units = 0 AND stock > 0 AND "archivedAt" IS NULL ORDER BY stock DESC, id LIMIT 10`),
  ]);
  return { days: 30, byUnits, byRevenue, stagnant };
}
