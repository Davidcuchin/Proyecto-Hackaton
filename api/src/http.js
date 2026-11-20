import express from "express";
import { ZodError, z } from "zod";
import { Prisma } from "@prisma/client";
import { db, HttpError, transaction } from "./db.js";
import { settings } from "./config.js";
import { findSession, handleAuth, memberships, registerUser } from "./auth.js";
import { registrationInput } from "./passwords.js";
import {
  archiveProduct, adjustProduct, cancelInvoice, catalog, createProduct, freezeProduct,
  invoiceDetails, listInvoices, productDetails, saveInvoice, updateProduct,
} from "./inventory.js";
import { ensureCustomer, getCustomer, listOrders, placeOrder, resolveOrder } from "./orders.js";
import { rankings, sales, salesByCategory, periods } from "./analytics.js";
import { customerCoupons, customerRanking, queueReminder, segments } from "./customers.js";
import { analyzeBusiness } from "./ai.js";
import { mailEnabled } from "./mail.js";
import {
  businessInput, checkoutInput, createProductInput, id, invoiceInput, paging,
  patchProductInput, slug, stockInput,
} from "./validation.js";

const route = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res, next)).catch(next);

const authenticate = route(async (req, _res, next) => {
  req.user = await findSession(req.get("cookie") ?? "");
  if (!req.user) throw new HttpError(401, "Inicia sesión para continuar.");
  next();
});

const administrate = route(async (req, _res, next) => {
  const businessId = id.safeParse(req.get("x-business-id"));
  if (!businessId.success) throw new HttpError(400, "Selecciona un comercio.");
  req.membership = await db.membership.findUnique({
    where: { userId_businessId: { userId: req.user.id, businessId: businessId.data } },
    include: { business: true },
  });
  if (!req.membership) throw new HttpError(403, "No tienes acceso al comercio.");
  next();
});

const storefront = route(async (req, _res, next) => {
  req.store = await db.business.findUnique({
    where: { slug: slug.parse(req.params.slug) }, select: { id: true, name: true, slug: true, logoPath: true },
  });
  if (!req.store) throw new HttpError(404, "Tienda no encontrada.");
  next();
});

const shopCustomer = route(async (req, _res, next) => {
  req.customer = await getCustomer(req.store.id, req.user.id);
  if (!req.customer) throw new HttpError(403, "Primero únete a esta tienda.");
  next();
});

const pageOf = req => {
  const { page, limit } = paging.parse(req.query);
  return { skip: (page - 1) * limit, limit };
};
const term = req => z.string().trim().max(120).default("").parse(req.query.search);
const paramId = req => id.parse(req.params.id);
const businessOf = req => req.membership.businessId;
const statusFilter = z.enum(["PENDING", "APPROVED", "FAILED"]).optional();
const formBody = express.text({ type: "application/x-www-form-urlencoded", limit: "16kb" });

const authEndpoint = route(async (req, res) => {
  if (!["GET", "POST"].includes(req.method)) {
    res.set("Allow", "GET, POST");
    throw new HttpError(405, "Método no permitido.");
  }
  if (req.method === "POST" && typeof req.body !== "string") {
    throw new HttpError(415, "Usa el formato application/x-www-form-urlencoded.");
  }
  const headers = new Headers();
  for (const name of ["cookie", "content-type", "x-auth-return-redirect"]) {
    const value = req.get(name);
    if (value) headers.set(name, value);
  }
  const response = await handleAuth(new Request(new URL(req.originalUrl, settings.appOrigin), {
    method: req.method, headers, body: req.method === "POST" ? req.body : undefined,
  }));
  res.set("Cache-Control", "no-store");
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") res.set(name, value);
  }
  for (const cookie of response.headers.getSetCookie()) res.append("Set-Cookie", cookie);
  res.status(response.status).end(Buffer.from(await response.arrayBuffer()));
});

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("json replacer", (_key, value) => typeof value === "bigint" ? String(value) : value);
  app.use("/api/v1", (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      const fetchSite = req.get("sec-fetch-site");
      const forwardedHost = req.get("x-forwarded-host");
      // Next supplies the original Host. Only local development can use loopback aliases.
      const localOrigin = settings.localAppHosts.includes(forwardedHost) &&
        (origin === `http://${forwardedHost}` || (origin === "null" && fetchSite === "same-origin"));
      const crossSite = fetchSite === "cross-site";
      if (crossSite || (origin && origin !== settings.appOrigin && !localOrigin)) {
        const message = "Origen de solicitud no permitido.";
        const reason = crossSite ? "solicitud desde otro sitio"
          : origin === "null" ? "el navegador ocultó el origen" : "origen distinto al configurado";
        const debug = ` Debug: ${reason}. Abre ${settings.appOrigin}.`;
        return next(new HttpError(403, process.env.NODE_ENV === "production" ? message : message + debug));
      }
      if (!req.is("application/json") && Number(req.get("content-length") ?? 0) > 0) {
        return next(new HttpError(415, "Usa el formato application/json."));
      }
    }
    next();
  });
  app.all("/api/auth/:action/:provider?", formBody, authEndpoint);
  app.use(express.json({ limit: "128kb" }));

  const api = express.Router();
  app.use("/api/v1", api);
  api.get("/health", route(async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ error: "PostgreSQL no está disponible." });
    }
  }));

  api.get("/auth/config", (_req, res) => res.json({ demo: settings.demoMode }));
  api.post("/auth/register", route(async (req, res) => {
    res.status(201).json(await registerUser(registrationInput.parse(req.body)));
  }));
  api.get("/auth/me", authenticate, route(async (req, res) => {
    res.json({ user: req.user, businesses: await memberships(req.user.id) });
  }));

  api.post("/businesses", authenticate, route(async (req, res) => {
    const data = businessInput.parse(req.body);
    const business = await transaction(async tx => {
      const created = await tx.business.create({ data });
      await tx.membership.create({ data: { userId: req.user.id, businessId: created.id, role: "OWNER" } });
      await tx.subscription.create({ data: { businessId: created.id } });
      return created;
    });
    res.status(201).json(business);
  }));

  const admin = express.Router();
  api.use(["/products", "/invoices", "/orders", "/analytics", "/customers", "/ai", "/subscription", "/mail"], authenticate, administrate);
  api.use(admin);

  admin.get("/products", route(async (req, res) => {
    const { skip, limit } = pageOf(req);
    res.json(await catalog(businessOf(req), term(req), skip, limit));
  }));
  admin.post("/products", route(async (req, res) => {
    res.status(201).json(await createProduct(businessOf(req), createProductInput.parse(req.body)));
  }));
  admin.get("/products/:id", route(async (req, res) => {
    res.json(await productDetails(businessOf(req), paramId(req)));
  }));
  admin.patch("/products/:id", route(async (req, res) => {
    res.json(await updateProduct(businessOf(req), paramId(req), patchProductInput.parse(req.body)));
  }));
  admin.delete("/products/:id", route(async (req, res) => {
    await archiveProduct(businessOf(req), paramId(req));
    res.status(204).end();
  }));
  admin.patch("/products/:id/freeze", route(async (req, res) => {
    const { isFrozen } = z.object({ isFrozen: z.boolean().optional() }).strict().parse(req.body ?? {});
    res.json(await freezeProduct(businessOf(req), paramId(req), isFrozen));
  }));
  admin.post("/products/:id/stock", route(async (req, res) => {
    res.json(await adjustProduct(businessOf(req), paramId(req), stockInput.parse(req.body)));
  }));

  admin.get("/invoices", route(async (req, res) => {
    const { skip, limit } = pageOf(req);
    res.json(await listInvoices(businessOf(req), skip, limit));
  }));
  admin.get("/invoices/:id", route(async (req, res) => {
    res.json(await invoiceDetails(businessOf(req), paramId(req)));
  }));
  admin.post("/invoices", route(async (req, res) => {
    res.status(201).json(await saveInvoice(businessOf(req), invoiceInput.parse(req.body)));
  }));
  admin.put("/invoices/:id", route(async (req, res) => {
    res.json(await saveInvoice(businessOf(req), invoiceInput.parse(req.body), paramId(req)));
  }));
  admin.delete("/invoices/:id", route(async (req, res) => {
    res.json(await cancelInvoice(businessOf(req), paramId(req)));
  }));

  admin.get("/orders", route(async (req, res) => {
    const { skip, limit } = pageOf(req);
    res.json(await listOrders(businessOf(req), skip, limit, undefined, statusFilter.parse(req.query.status)));
  }));
  admin.patch("/orders/:id/status", route(async (req, res) => {
    const { status } = z.object({ status: z.enum(["APPROVED", "FAILED"]) }).strict().parse(req.body);
    res.json(await resolveOrder(businessOf(req), paramId(req), status));
  }));
  admin.get("/analytics/sales", route(async (req, res) => {
    res.json(await sales(businessOf(req), z.enum(periods).default("day").parse(req.query.period)));
  }));
  admin.get("/analytics/products", route(async (req, res) => {
    res.json(await rankings(businessOf(req)));
  }));
  admin.get("/analytics/overview", route(async (req, res) => {
    const businessId = businessOf(req);
    const [today, recent, summary, categories] = await Promise.all([
      sales(businessId, "day"),
      listOrders(businessId, 0, 6),
      db.order.groupBy({ by: ["status"], where: { businessId }, _count: { _all: true } }),
      salesByCategory(businessId),
    ]);
    res.json({ today: today.totals, recent: recent.items, categories,
      counts: Object.fromEntries(summary.map(row => [row.status, row._count._all])) });
  }));

  admin.get("/customers", route(async (req, res) => {
    const { skip, limit } = pageOf(req);
    res.json(await customerRanking(businessOf(req), skip, limit, z.enum(segments).optional().parse(req.query.segment)));
  }));
  admin.post("/customers/:id/remind", route(async (req, res) => {
    res.status(202).json(await queueReminder(businessOf(req), paramId(req)));
  }));
  admin.get("/mail", route(async (req, res) => {
    const { skip, limit } = pageOf(req);
    const where = { businessId: businessOf(req) };
    const [items, total] = await db.$transaction([
      db.mailJob.findMany({ where, skip, take: limit, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, recipient: true, subject: true, status: true, createdAt: true, sentAt: true } }),
      db.mailJob.count({ where }),
    ]);
    res.json({ enabled: mailEnabled(), items, total });
  }));
  admin.post("/ai/analyze", route(async (req, res) => {
    res.json(await analyzeBusiness(businessOf(req)));
  }));
  admin.get("/subscription", route(async (req, res) => {
    const subscription = await db.subscription.findUnique({ where: { businessId: businessOf(req) } });
    res.json({ status: subscription?.status ?? "INACTIVE", plan: subscription?.plan ?? "SIN_PLAN" });
  }));

  api.get("/store/:slug", storefront, (req, res) => res.json(req.store));
  api.get("/store/:slug/products", storefront, route(async (req, res) => {
    const { skip, limit } = pageOf(req);
    res.json(await catalog(req.store.id, term(req), skip, limit, true));
  }));
  api.get("/store/:slug/profile", storefront, authenticate, route(async (req, res) => {
    const customer = await getCustomer(req.store.id, req.user.id);
    res.json(customer && { id: customer.id, marketingOptIn: customer.marketingOptIn, approvedOrdersCount: customer.approvedOrdersCount });
  }));
  api.post("/store/:slug/join", storefront, authenticate, route(async (req, res) => {
    const customer = await ensureCustomer(req.store.id, req.user.id);
    res.status(201).json({ id: customer.id, marketingOptIn: customer.marketingOptIn, approvedOrdersCount: customer.approvedOrdersCount });
  }));
  api.patch("/store/:slug/profile", storefront, authenticate, shopCustomer, route(async (req, res) => {
    const data = z.object({ marketingOptIn: z.boolean() }).strict().parse(req.body);
    const customer = await db.customer.update({
      where: { businessId_id: { businessId: req.store.id, id: req.customer.id } }, data,
    });
    res.json({ id: customer.id, marketingOptIn: customer.marketingOptIn, approvedOrdersCount: customer.approvedOrdersCount });
  }));
  api.get("/store/:slug/coupons", storefront, authenticate, shopCustomer, route(async (req, res) => {
    const { skip, limit } = pageOf(req);
    res.json(await customerCoupons(req.store.id, req.customer.id, skip, limit));
  }));
  api.get("/store/:slug/orders", storefront, authenticate, shopCustomer, route(async (req, res) => {
    const { skip, limit } = pageOf(req);
    res.json(await listOrders(req.store.id, skip, limit, req.customer.id));
  }));
  api.post("/store/:slug/orders", storefront, authenticate, shopCustomer, route(async (req, res) => {
    res.status(201).json(await placeOrder(req.store.id, req.customer.id, checkoutInput.parse(req.body)));
  }));

  api.use((_req, _res, next) => next(new HttpError(404, "Ruta no encontrada.")));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof ZodError) {
      return res.status(400).json({ error: "Revisa los datos ingresados.", fields: error.issues.map(issue => ({
        field: issue.path.join("."), message: issue.message,
      })) });
    }
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido." });
    if (error.type === "entity.too.large") return res.status(413).json({ error: "La solicitud es demasiado grande." });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un registro con esos datos. Revisa el código, el número o la URL." });
    }
    console.error("Error de API", error.code ?? error.name ?? "INTERNAL_ERROR");
    return res.status(500).json({ error: "No se pudo completar la operación." });
  });
  return app;
}
