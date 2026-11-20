import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Duplex } from "node:stream";

type Request = { method?: string; token?: string; business?: string; body?: unknown; origin?: string; form?: URLSearchParams };
type Response = { status: number; data: any; cookies: string[] };
const databaseUrl = process.env.TEST_DATABASE_URL;

test("API y PostgreSQL: pedidos, facturas, descuentos, analítica y aislamiento por comercio", { timeout: 60_000 }, async () => {
  assert.ok(databaseUrl, "Define TEST_DATABASE_URL con una base de prueba migrada.");
  process.env.DATABASE_URL = databaseUrl;
  process.env.LLM_BASE_URL = "";
  process.env.AUTH_SECRET = randomUUID() + randomUUID();
  process.env.APP_ORIGIN = "http://localhost:4317";
  const [{ db }, { createApp }, { sessionCookie }, { localDate, dayMs }, { settings }, { hashPassword }] = await Promise.all([
    import("../src/db.js"), import("../src/http.js"), import("../src/auth.js"), import("../src/rules.js"), import("../src/config.js"),
    import("../src/passwords.js"),
  ]);
  const server = createServer(createApp());

  // Envía HTTP real al servidor de Node usando un flujo en memoria.
  function send(path: string, options: Request = {}): Promise<Response> {
    return new Promise((resolve, reject) => {
      const body = options.form?.toString() ?? (options.body === undefined ? "" : JSON.stringify(options.body));
      const chunks: Buffer[] = [];
      const transport = new Duplex({
        read() {},
        write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); },
      });
      const socket = Object.assign(transport, { setTimeout() { return this; }, destroySoon() { transport.end(); } });
      socket.once("error", reject);
      socket.once("finish", () => {
        const raw = Buffer.concat(chunks).toString();
        const partition = raw.indexOf("\r\n\r\n");
        const payload = raw.slice(partition + 4);
        socket.destroy();
        const cookies = raw.slice(0, partition).split("\r\n")
          .filter(line => /^set-cookie:/i.test(line)).map(line => line.slice(11).trimStart().split(";")[0]);
        try { resolve({ status: Number(raw.split(" ")[1]), data: payload ? JSON.parse(payload) : null, cookies }); }
        catch (error) { reject(error); }
      });
      server.emit("connection", socket);
      socket.push([
        `${options.method ?? "GET"} ${path.startsWith("/api/auth/") ? path : `/api/v1${path}`} HTTP/1.1`, "Host: localhost", "Connection: close",
        ...(options.token ? [`Cookie: ${options.token}`] : []),
        ...(options.business ? [`X-Business-Id: ${options.business}`] : []),
        ...(options.origin ? [`Origin: ${options.origin}`] : []),
        ...(options.form ? ["Content-Type: application/x-www-form-urlencoded", "X-Auth-Return-Redirect: 1"]
          : body ? ["Content-Type: application/json"] : []),
        ...(body ? [`Content-Length: ${Buffer.byteLength(body)}`] : []),
        "", body,
      ].join("\r\n"));
    });
  }

  const stamp = randomUUID().slice(0, 8);
  const ids = [`owner-a-${stamp}`, `owner-b-${stamp}`, `buyer-${stamp}`];
  const slugA = `tienda-a-${stamp}`;
  const slugB = `tienda-b-${stamp}`;
  const store = `/store/${slugA}`;
  const otherStore = `/store/${slugB}`;
  const date = localDate();
  const yyyyMmDd = date.toISOString().slice(0, 10);

  try {
    const password = "ImpulsoIntegration2026!";
    const passwordHash = await hashPassword(password);
    await db.user.createMany({ data: ids.map(id => ({ id, name: id, email: `${id}@example.test`, passwordHash })) });
    async function login(id: string, candidate = password) {
      const csrf = await send("/api/auth/csrf");
      assert.equal(csrf.status, 200);
      assert.ok(csrf.data.csrfToken && csrf.cookies.some(cookie => cookie.startsWith("authjs.csrf-token=")));
      const result = await send("/api/auth/callback/credentials", {
        method: "POST", token: csrf.cookies.join("; "),
        form: new URLSearchParams({ csrfToken: csrf.data.csrfToken, email: `${id}@example.test`,
          password: candidate, callbackUrl: `${settings.appOrigin}/panel` }),
      });
      return { result, cookie: result.cookies.find(cookie => cookie.startsWith(`${sessionCookie}=`)) };
    }
    const incorrect = await login(ids[0], "ContraseñaIncorrecta");
    assert.match(incorrect.result.data.url, /CredentialsSignin/);
    assert.equal(incorrect.cookie, undefined);
    const logins = await Promise.all(ids.map(id => login(id)));
    for (const { result, cookie } of logins) {
      assert.equal(result.data.url, `${settings.appOrigin}/panel`);
      assert.ok(cookie);
    }
    const [tokenA, tokenB, buyerToken] = logins.map(result => result.cookie as string);
    const buy = { token: buyerToken };
    const createBusiness = async (token: string, slug: string) => {
      const result = await send("/businesses", { token, method: "POST", body: { name: slug, slug } });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      return String(result.data.id);
    };
    const a = await createBusiness(tokenA, slugA);
    const b = await createBusiness(tokenB, slugB);
    const admin = { token: tokenA, business: a };
    const other = { token: tokenB, business: b };
    assert.equal((await send("/subscription", admin)).data.status, "INACTIVE");
    assert.equal((await send("/products", { token: tokenB, business: a })).status, 403);
    assert.equal((await send("/products", { ...admin, method: "POST", origin: "https://otro.example", body: {} })).status, 403);
    assert.equal((await send("/products", { business: a })).status, 401);
    assert.equal((await send("/auth/google", admin)).status, 404);

    const newEmail = `nuevo-${stamp}@example.test`;
    const registered = await send("/auth/register", { method: "POST", body: { name: "Nueva cuenta", email: newEmail.toUpperCase(), password } });
    assert.equal(registered.status, 201);
    ids.push(registered.data.id);
    assert.equal(registered.data.email, newEmail);
    assert.equal(registered.data.passwordHash, undefined);
    assert.equal((await send("/auth/register", { method: "POST", body: { name: "Otra cuenta", email: newEmail, password } })).status, 409);

    const createProduct = async (options: Request, body: Record<string, unknown>) => {
      const result = await send("/products", { ...options, method: "POST", origin: settings.appOrigin, body });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      return result.data;
    };
    const product = await createProduct(admin, { name: "Miel", sku: "abc", price: 6000, stock: 5, lowStockThreshold: 1 });
    const outsider = await createProduct(other, { name: "Té", sku: "abc", price: 6000, stock: 8 });
    const pendingProduct = await createProduct(admin, { name: "Granola", sku: "x", price: 5000, stock: 3,
      expiresAt: new Date(+date + 5 * dayMs).toISOString().slice(0, 10) });
    assert.equal(pendingProduct.discountPercent, 20);
    assert.equal((await send(`/products/${product.id}`, other)).status, 404);

    const invoice = { supplier: "Proveedor", number: "562", issuedOn: yyyyMmDd, items: [{ productId: product.id, quantity: 2, unitCost: 1000 }] };
    const register = await send("/invoices", { ...admin, method: "POST", body: invoice });
    assert.equal(register.status, 201, JSON.stringify(register.data));
    assert.equal(register.data.total, "2000");
    const invoicePath = `/invoices/${register.data.id}`;
    const stock = async () => (await send(`/products/${product.id}`, admin)).data.stock;
    assert.equal(await stock(), 7);
    const update = await send(invoicePath, { ...admin, method: "PUT", body: { ...invoice, items: [{ ...invoice.items[0], quantity: 4 }] } });
    assert.equal(update.status, 200);
    assert.equal(await stock(), 9);
    const invalidInvoice = await send("/invoices", { ...admin, method: "POST", body: { ...invoice, number: "no",
      items: [...invoice.items, { productId: outsider.id, quantity: 1, unitCost: 1000 }] } });
    assert.equal(invalidInvoice.status, 404);
    assert.equal(await stock(), 9);
    assert.equal((await send(invoicePath, { ...admin, method: "DELETE" })).status, 200);
    assert.equal(await stock(), 5);
    assert.equal((await send(`/products/${product.id}/stock`, { ...admin, method: "POST", body: { quantity: 2, reason: "Conteo" } })).status, 200);
    assert.equal(await stock(), 7);

    assert.equal((await send(`${store}/join`, { ...buy, method: "POST", body: {} })).status, 201);
    assert.equal((await send(`${otherStore}/join`, { ...buy, method: "POST", body: {} })).status, 201);
    const order = (quantity = 1, checkoutKey = randomUUID(), couponCode?: string) => send(`${store}/orders`, {
      ...buy, method: "POST", body: { checkoutKey, couponCode, items: [{ productId: product.id, quantity }] },
    });
    const resolve = (id: string, status = "APPROVED") => send(`/orders/${id}/status`, { ...admin, method: "PATCH", body: { status } });
    const freeze = (target?: boolean) => send(`/products/${product.id}/freeze`, { ...admin, method: "PATCH",
      body: target === undefined ? {} : { isFrozen: target } });
    const retryKey = randomUUID();
    const first = await order(1, retryKey);
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.equal((await order(1, retryKey)).data.id, first.data.id);
    assert.equal(await stock(), 7);
    assert.equal((await freeze()).data.isFrozen, true);
    assert.ok(!(await send(`${store}/products`)).data.items.some((item: { id: string }) => item.id === product.id));
    assert.equal((await order()).status, 409);
    assert.equal((await resolve(first.data.id)).status, 409);
    assert.equal((await freeze(false)).data.isFrozen, false);
    assert.equal((await resolve(first.data.id)).status, 200);
    assert.equal((await resolve(first.data.id)).status, 200);
    assert.equal(await stock(), 6);
    assert.equal((await send(`${store}/coupons`, buy)).data.total, 0);

    const second = await order();
    assert.equal((await resolve(second.data.id)).status, 200);
    const coupon = (await send(`${store}/coupons`, buy)).data.items[0];
    assert.match(coupon.qrBase64, /^data:image\/png;base64,/);
    assert.equal((await send("/mail", admin)).data.items[0].status, "QUEUED");
    const cross = await send(`${otherStore}/orders`, { ...buy, method: "POST", body: {
      checkoutKey: randomUUID(), couponCode: coupon.code, items: [{ productId: outsider.id, quantity: 1 }],
    } });
    assert.equal(cross.status, 409);
    const third = await order(1, randomUUID(), coupon.code);
    const competing = await order(1, randomUUID(), coupon.code);
    assert.equal(third.data.total, "5100");
    assert.equal((await resolve(third.data.id)).status, 200);
    assert.equal((await resolve(competing.data.id)).status, 409);
    assert.equal(await stock(), 4);
    assert.equal((await resolve(competing.data.id, "FAILED")).status, 200);
    assert.equal((await order(1, randomUUID(), coupon.code)).status, 409);
    assert.equal((await send(`${store}/coupons`, buy)).data.total, 2);

    for (const [period, length] of [["day", 24], ["week", 7], ["month", null], ["year", 12]] as const) {
      const sales = await send(`/analytics/sales?period=${period}`, admin);
      assert.equal(sales.status, 200, JSON.stringify(sales.data));
      assert.deepEqual(sales.data.totals, { units: "3", revenue: "17100", orders: "3" });
      if (length) assert.equal(sales.data.buckets.length, length);
    }
    const ranking = (await send("/analytics/products", admin)).data;
    assert.equal(ranking.byRevenue[0].revenue, "17100");
    assert.equal(ranking.stagnant[0].id, pendingProduct.id);
    const customer = (await send("/customers", admin)).data.items[0];
    assert.equal(customer.segment, "REGULAR");
    assert.equal(customer.approvedOrdersCount, 3);
    await db.customer.update({ where: { id: customer.id }, data: { lastPurchaseAt: new Date(Date.now() - 70 * dayMs) } });
    assert.equal((await send(`/customers/${customer.id}/remind`, { ...admin, method: "POST", body: {} })).status, 409);
    assert.equal((await send(`${store}/profile`, { ...buy, method: "PATCH", body: { marketingOptIn: true } })).status, 200);
    const reminder = () => send(`/customers/${customer.id}/remind`, { ...admin, method: "POST", body: {} });
    const queued = await reminder();
    assert.equal(queued.status, 202);
    assert.equal((await reminder()).data.id, queued.data.id);

    const assistant = await send("/ai/analyze", { ...admin, method: "POST", body: {} });
    assert.equal(assistant.status, 200, JSON.stringify(assistant.data));
    assert.equal(assistant.data.context.inactiveCustomers, 1);
    assert.equal(assistant.data.context.expiringCount, 1);

    const lastUnit = await createProduct(admin, { name: "Última unidad", sku: "RACE", price: 4500, stock: 1 });
    const raceOrders = await Promise.all([1, 2].map(() => send(`${store}/orders`, { ...buy, method: "POST", body: {
      checkoutKey: randomUUID(), items: [{ productId: lastUnit.id, quantity: 1 }],
    } })));
    assert.ok(raceOrders.every(result => result.status === 201));
    const resolved = await Promise.all(raceOrders.map(result => resolve(result.data.id)));
    assert.deepEqual(resolved.map(result => result.status).sort(), [200, 409]);
    assert.equal((await send(`/products/${lastUnit.id}`, admin)).data.stock, 0);

    assert.equal((await send(`/products/${pendingProduct.id}`, { ...admin, method: "DELETE" })).status, 204);
    assert.equal((await send(`/products/${pendingProduct.id}`, admin)).status, 404);

    const csrf = await send("/api/auth/csrf", { token: buyerToken });
    const logout = await send("/api/auth/signout", { method: "POST", token: [buyerToken, ...csrf.cookies].join("; "),
      form: new URLSearchParams({ csrfToken: csrf.data.csrfToken, callbackUrl: `${settings.appOrigin}/` }) });
    assert.equal(logout.data.url, `${settings.appOrigin}/`);
    assert.ok(logout.cookies.includes(`${sessionCookie}=`));
    assert.equal((await send("/auth/me", buy)).status, 401);
  } finally {
    const businesses = await db.business.findMany({ where: { slug: { in: [slugA, slugB] } }, select: { id: true } });
    const where = { businessId: { in: businesses.map(item => item.id) } };
    await db.$transaction([
      db.mailJob.deleteMany({ where }),
      db.order.updateMany({ where, data: { requestedCouponId: null } }),
      db.coupon.deleteMany({ where }),
      db.orderItem.deleteMany({ where }),
      db.order.deleteMany({ where }),
      db.stockMovement.deleteMany({ where }),
      db.invoice.deleteMany({ where }),
      db.product.deleteMany({ where }),
      db.customer.deleteMany({ where }),
      db.business.deleteMany({ where: { id: where.businessId } }),
      db.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    await db.$disconnect();
  }
});
