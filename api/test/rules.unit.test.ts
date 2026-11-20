import { test } from "node:test";
import assert from "node:assert/strict";
import { date, patchProductInput } from "../src/validation.js";
import { dayMs, discountFor, frequency, localDate, productOffer } from "../src/rules.js";
import { qrPng } from "../src/qr.js";

const now = new Date("2026-11-20T02:30:00Z");
const today = localDate(now);
const product = { stock: 7, lowStockThreshold: 5, isFrozen: false, archivedAt: null, expiresAt: null, price: 5000 };

test("calcula el día comercial con la fecha de Santiago", () => {
  assert.equal(today.toISOString(), "2026-11-19T00:00:00.000Z");
});

test("ofrece 10 % por stock bajo y prioriza 20 % hasta cinco días del vencimiento", () => {
  assert.equal(productOffer({ ...product, stock: 5 }, today).discountPercent, 10);
  const sale = productOffer({ ...product, stock: 5, expiresAt: new Date(+today + 5 * dayMs) }, today);
  assert.equal(sale.discountPercent, 20);
  assert.equal(sale.salePrice, 4000);
  assert.equal(productOffer({ ...product, expiresAt: new Date(+today + 6 * dayMs) }, today).discountPercent, 0);
});

test("bloquea productos congelados, archivados, vencidos y agotados", () => {
  for (const change of [{ isFrozen: true }, { archivedAt: today }, { expiresAt: new Date(+today - dayMs) }, { stock: 0 }]) {
    const result = productOffer({ ...product, ...change }, today);
    assert.equal(result.available, false);
    assert.equal(result.discountPercent, 0);
  }
  assert.equal(productOffer({ ...product, expiresAt: today }, today).available, true);
});

test("el cupón exige mínimo, aplica tope y deja de servir al vencer o canjearse", () => {
  const coupon = { expiresAt: new Date(+now + dayMs), usedAt: null, minPurchaseAmount: 5000, maxDiscountAmount: 3000, percent: 15 };
  assert.equal(discountFor(coupon, 4_999n, now), null);
  assert.equal(discountFor(coupon, 5_000n, now), 750n);
  assert.equal(discountFor(coupon, 30_000n, now), 3_000n);
  assert.equal(discountFor({ ...coupon, usedAt: now }, 30_000n, now), null);
  assert.equal(discountFor(coupon, 30_000n, coupon.expiresAt), null);
});

test("clasifica por compras aprobadas y días desde la última compra", () => {
  assert.equal(frequency(5, now, now, now).segment, "VIP");
  assert.equal(frequency(2, now, now, now).segment, "REGULAR");
  assert.equal(frequency(1, now, now, now).segment, "INFREQUENT");
  assert.deepEqual(frequency(0, null, new Date(+now - 60 * dayMs), now), { segment: "AT_RISK", daysSinceLastPurchase: null });
});

test("actualizar un campo del producto preserva el resto", () => {
  assert.deepEqual(patchProductInput.parse({ price: 3500 }), { price: 3500 });
  assert.equal(patchProductInput.safeParse({}).success, false);
  assert.equal(date.safeParse("2026-02-30").success, false);
});

test("el cupón produce un PNG de QR con margen y dimensiones fijas", () => {
  const png = qrPng("IMP-0123456789ABCDEF0123");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 165);
  assert.equal(png.readUInt32BE(20), 165);
  assert.notDeepEqual(png, qrPng("IMP-FEDCBA9876543210FEDC"));
});
