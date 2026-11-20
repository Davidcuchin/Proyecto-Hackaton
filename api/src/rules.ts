export const zone = "America/Santiago";
export const dayMs = 86_400_000;
export const promotionDays = 5;

const calendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
});

export function localDate(now = new Date()) {
  const parts = calendar.formatToParts(now);
  const get = (part: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === part)?.value;
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00.000Z`);
}

type ProductState = {
  stock: number; lowStockThreshold: number; isFrozen: boolean; expiresAt: Date | null;
  archivedAt: Date | null; price: number;
};

export function productOffer(product: ProductState, today = localDate()) {
  const daysUntilExpiry = product.expiresAt ? (product.expiresAt.getTime() - today.getTime()) / dayMs : null;
  const expired = daysUntilExpiry !== null && daysUntilExpiry < 0;
  const expiring = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= promotionDays;
  const lowStock = product.stock <= product.lowStockThreshold;
  const available = !product.archivedAt && !product.isFrozen && !expired && product.stock > 0;
  const discountPercent = available ? Math.max(expiring ? 20 : 0, lowStock ? 10 : 0) : 0;
  return {
    daysUntilExpiry, expired, expiring, lowStock, available, discountPercent,
    salePrice: Math.round(product.price * (100 - discountPercent) / 100),
  };
}

type CouponTerms = { expiresAt: Date; usedAt: Date | null; minPurchaseAmount: number; maxDiscountAmount: number; percent: number };

export function discountFor(coupon: CouponTerms, subtotal: bigint, now: Date) {
  if (coupon.usedAt || coupon.expiresAt <= now || subtotal < BigInt(coupon.minPurchaseAmount)) return null;
  const percentDiscount = subtotal * BigInt(coupon.percent) / 100n;
  const cap = BigInt(coupon.maxDiscountAmount);
  return percentDiscount < cap ? percentDiscount : cap;
}

export function frequency(orders: number, lastPurchase: Date | null, createdAt: Date, now = new Date()) {
  const elapsed = Math.max(0, Math.floor((localDate(now).getTime() - localDate(lastPurchase ?? createdAt).getTime()) / dayMs));
  const segment = elapsed >= 60 ? "AT_RISK" : orders >= 5 && elapsed <= 30 ? "VIP"
    : orders >= 2 && elapsed <= 45 ? "REGULAR" : "INFREQUENT";
  return { segment, daysSinceLastPurchase: lastPurchase ? elapsed : null };
}
