import { z } from "zod";

export const id = z.string().min(1).max(64);
export const slug = z.string().min(3).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usa letras minúsculas, números y guiones.");
const text = (max: number) => z.string().trim().min(1).max(max);
export const date = z.iso.date().transform(value => new Date(`${value}T00:00:00.000Z`));
const stock = z.number().int().min(0).max(1_000_000);
const amount = z.number().int().min(0).max(100_000_000);
export const businessInput = z.object({ name: text(80), slug }).strict();
export const productInput = z.object({
  name: text(120), sku: text(40).transform(value => value.toUpperCase()),
  description: z.string().trim().max(500),
  category: text(60).nullable().optional(),
  price: amount.min(1), lowStockThreshold: stock, expiresAt: date.nullable(),
}).strict();
export const createProductInput = productInput.extend({
  description: productInput.shape.description.default(""), stock: stock.default(0),
  lowStockThreshold: stock.default(5), expiresAt: date.nullable().default(null),
});
export const patchProductInput = productInput.partial().refine(value => Object.keys(value).length > 0, "Incluye un campo para actualizar.");
export const stockInput = z.object({
  quantity: z.number().int().min(-1_000_000).max(1_000_000).refine(value => value !== 0, "Usa una cantidad distinta de cero."),
  reason: text(140),
}).strict();

const distinct = (lines: { productId: string }[]) => new Set(lines.map(line => line.productId)).size === lines.length;
const baseLine = z.object({ productId: id, quantity: z.number().int().min(1).max(1_000_000) }).strict();
export const invoiceInput = z.object({
  supplier: text(100), number: text(40), issuedOn: date,
  items: z.array(baseLine.extend({ unitCost: amount })).min(1).max(50).refine(distinct, "No repitas productos."),
}).strict();
export const checkoutInput = z.object({
  items: z.array(baseLine.extend({ quantity: z.number().int().min(1).max(1_000) })).min(1).max(50).refine(distinct, "No repitas productos."),
  checkoutKey: z.uuid(), couponCode: z.string().trim().min(1).max(40).transform(value => value.toUpperCase()).optional(),
}).strict();
export const paging = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
