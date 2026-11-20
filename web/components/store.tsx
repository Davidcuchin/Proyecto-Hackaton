"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ArrowUpRight, Check, LogOut, Minus, Package, Plus, Search, ShoppingBag, Store as StoreIcon, Ticket, Trash2 } from "lucide-react";
import { api, ApiError, useAction, useResource } from "@/lib/api";
import {
  displayDate, money, type Business, type CatalogItem, type Coupon,
  type Me, type Order, type Page, type Profile,
} from "@/lib/domain";
import { OrderHistory } from "./sales";
import { Badge, Brand, Empty, Failure, Field, Loading, Notice, Pagination } from "./ui";

type CartItem = Pick<CatalogItem, "id" | "name" | "salePrice" | "stock"> & { quantity: number };
const size = 12;

function Coupons({ coupons, onUse }: { coupons: Coupon[]; onUse: (code: string) => void }) {
  if (!coupons.length) return <Empty>Desde tu segunda compra aprobada recibirás cupones de esta tienda.</Empty>;
  return <div className="coupons">{coupons.map(coupon => {
    const expired = new Date(coupon.expiresAt).getTime() <= Date.now();
    return <article className="coupon" key={coupon.id}>
      <img width={105} height={105} src={coupon.qrBase64} alt={`QR del cupón ${coupon.code}`} />
      <div className="stack tight">
        <strong>{coupon.percent}% de descuento</strong>
        <span className="muted">Desde {money(coupon.minPurchaseAmount)} · Tope {money(coupon.maxDiscountAmount)}</span>
        <small className="muted">Vence el {displayDate(coupon.expiresAt)}</small>
        <code>{coupon.code}</code>
        {coupon.usedAt || expired ? <div><Badge tone={expired && !coupon.usedAt ? "amber" : "neutral"}>{coupon.usedAt ? "Usado" : "Vencido"}</Badge></div>
          : <div><button className="button secondary small" onClick={() => onUse(coupon.code)}><Ticket size={15} />Usar cupón</button></div>}
      </div>
    </article>;
  })}</div>;
}

export function Store({ slug }: { slug: string }) {
  const root = `/store/${encodeURIComponent(slug)}`;
  const [page, setPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [couponPage, setCouponPage] = useState(1);
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const checkoutKey = useRef<string | null>(null);
  const store = useResource<Business>(root);
  const session = useResource<Me>("/auth/me");
  const catalog = useResource<Page<CatalogItem>>(store.data ? `${root}/products?page=${page}&limit=${size}&search=${encodeURIComponent(search)}` : null);
  const profile = useResource<Profile | null>(session.data && store.data ? `${root}/profile` : null);
  const orders = useResource<Page<Order>>(profile.data ? `${root}/orders?page=${orderPage}&limit=${size}` : null);
  const coupons = useResource<Page<Coupon>>(profile.data ? `${root}/coupons?page=${couponPage}&limit=${size}` : null);
  const action = useAction();
  const cartAction = useAction();
  const login = `/?tienda=${encodeURIComponent(slug)}`;
  const key = `impulso.cart:${slug}`;

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "[]");
      if (Array.isArray(saved)) setCart(saved.filter(item => typeof item?.id === "string" && typeof item.name === "string"
        && Number.isSafeInteger(item.salePrice) && item.salePrice >= 0 && Number.isSafeInteger(item.stock) && item.stock > 0
        && Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 1000).slice(0, 50));
    } catch { /* El carrito funciona aunque el navegador bloquee el almacenamiento. */ }
    setCartReady(true);
  }, [key]);
  useEffect(() => {
    if (cartReady) {
      try { window.sessionStorage.setItem(key, JSON.stringify(cart)); } catch { /* Estado temporal en memoria. */ }
    }
  }, [cart, cartReady, key]);

  const total = cart.reduce((sum, item) => sum + item.salePrice * item.quantity, 0);
  const quantities = cart.reduce((sum, item) => sum + item.quantity, 0);
  const memberLoading = session.loading || profile.loading;
  const sessionFailed = session.error !== undefined && !(session.error instanceof ApiError && session.error.status === 401);

  function add(item: CatalogItem) {
    if (cartAction.busy) return;
    const existing = cart.find(row => row.id === item.id);
    if ((!existing && cart.length >= 50) || (existing && existing.quantity >= Math.min(item.stock, 1000))) return;
    checkoutKey.current = null;
    const snapshot = { id: item.id, name: item.name, stock: item.stock, salePrice: item.salePrice };
    setCart(rows => existing ? rows.map(row => row.id === item.id ? { ...snapshot, quantity: row.quantity + 1 } : row)
      : [...rows, { ...snapshot, quantity: 1 }]);
  }

  function change(id: string, increment: number) {
    checkoutKey.current = null;
    setCart(rows => rows.map(row => row.id === id ? {
      ...row, quantity: increment === 0 ? 0 : Math.min(row.quantity + increment, row.stock, 1000),
    } : row).filter(row => row.quantity > 0));
  }

  function join() {
    void action.run(async () => {
      await api(`${root}/join`, { method: "POST", body: {} });
      profile.reload();
    });
  }

  function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cartAction.busy || !cart.length || !profile.data) return;
    void cartAction.run(async () => {
      checkoutKey.current ??= crypto.randomUUID();
      const order = await api<Order>(`${root}/orders`, { method: "POST", body: {
        checkoutKey: checkoutKey.current, couponCode: code.trim() || undefined,
        items: cart.map(item => ({ productId: item.id, quantity: item.quantity })),
      } });
      setCart([]); setCode(""); checkoutKey.current = null;
      if (orderPage !== 1) setOrderPage(1);
      orders.reload(); catalog.reload();
      cartAction.setNotice({ text: `Pedido enviado por ${money(order.total)}. La tienda debe aprobarlo.`, tone: "success" });
    });
  }

  function applyCoupon(value: string) {
    checkoutKey.current = null;
    setCode(value);
    document.getElementById("carrito")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function logout() {
    await action.run(async () => {
      await signOut({ redirect: false });
      window.location.assign(`/tienda/${encodeURIComponent(slug)}`);
    });
  }

  if (!store.data) return <main className="standalone stack">
    <Brand />{store.loading ? <Loading /> : <Failure error={store.error} reload={store.reload} />}
  </main>;

  return <div className="store-page">
    <header className="store-header">
      <div className="standalone-header storefront-width">
        <Brand />
        <div className="actions">
          {session.data?.businesses.length ? <Link className="button secondary small" href="/panel">Mi panel <ArrowUpRight size={15} /></Link> : null}
          {session.data && <button className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión" disabled={action.busy} onClick={() => void logout()}><LogOut size={18} /></button>}
          <a className="button primary small" href="#carrito"><ShoppingBag size={17} />Carrito {quantities > 0 && <span className="cart-bubble">{quantities}</span>}</a>
        </div>
      </div>
    </header>
    <main className="storefront storefront-width stack roomy">
      <div className="store-hero">
        <div><h1>{store.data.name}</h1><p>Encuentra productos y ofertas disponibles en esta tienda.</p></div>
        <span className="store-hero-icon"><StoreIcon size={39} strokeWidth={1.6} /></span>
      </div>

      {action.notice && <Notice {...action.notice} />}
      {sessionFailed && <Failure error={session.error} reload={session.reload} />}
      {profile.error !== undefined && <Failure error={profile.error} reload={profile.reload} />}
      <div className="store-grid">
        <section className="stack" aria-labelledby="store-catalog">
          <div className="toolbar"><h2 id="store-catalog">Productos</h2>
            <label className="search"><Search size={19} aria-hidden="true" /><input aria-label="Buscar productos" placeholder="Buscar productos" value={search} maxLength={120}
              onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
          </div>
          {catalog.loading && <Loading />}
          {catalog.error !== undefined && <Failure error={catalog.error} reload={catalog.reload} />}
          {catalog.data && (catalog.data.items.length ? <div className="catalog">
            {catalog.data.items.map(item => {
              const quantity = cart.find(row => row.id === item.id)?.quantity ?? 0;
              return <article className="product-card" key={item.id}>
                <div className="product-art">
                  <Package size={31} strokeWidth={1.55} aria-hidden="true" />
                  {item.discountPercent > 0 && <Badge tone="violet">−{item.discountPercent}%</Badge>}
                </div>
                <div className="product-copy stack tight">
                  <h3>{item.name}</h3>{item.description && <p>{item.description}</p>}
                  <div className="actions compact"><strong>{money(item.salePrice)}</strong>{item.discountPercent > 0 && <del>{money(item.price)}</del>}</div>
                  <small className="muted">{item.stock} un. disponibles</small>
                  <button className="button secondary" onClick={() => add(item)}
                    disabled={cartAction.busy || quantity >= Math.min(item.stock, 1000) || (cart.length >= 50 && quantity === 0)}>
                    <Plus size={17} />{quantity >= Math.min(item.stock, 1000) ? "En carrito" : "Agregar"}
                  </button>
                </div>
              </article>;
            })}
          </div> : <Empty>{search ? "No encontramos productos para esa búsqueda." : "La tienda aún no tiene productos disponibles."}</Empty>)}
          {catalog.data && <Pagination page={page} size={size} total={catalog.data.total} onChange={setPage} />}
        </section>
        <aside className="card stack cart" id="carrito">
          <div className="section-heading"><h2>Tu carrito</h2><ShoppingBag size={21} /></div>
          {cartAction.notice && <Notice {...cartAction.notice} />}
          {cart.length ? <form className="stack" onSubmit={checkout}>
            <ul className="cart-list">{cart.map(item => <li key={item.id}>
              <div><strong>{item.name}</strong><small>{money(item.salePrice * item.quantity)}</small></div>
              <div className="actions compact">
                <button type="button" className="icon-button" aria-label={`Restar unidad de ${item.name}`} disabled={cartAction.busy} onClick={() => change(item.id, -1)}><Minus size={15} /></button>
                <span>{item.quantity}</span>
                <button type="button" className="icon-button" aria-label={`Sumar unidad de ${item.name}`} disabled={cartAction.busy || item.quantity >= Math.min(item.stock, 1000)} onClick={() => change(item.id, 1)}><Plus size={15} /></button>
                <button type="button" className="icon-button" aria-label={`Quitar ${item.name}`} disabled={cartAction.busy} onClick={() => change(item.id, 0)}><Trash2 size={15} /></button>
              </div>
            </li>)}</ul>
            <Field label="Código de cupón"><input name="coupon" placeholder="Opcional" value={code} disabled={cartAction.busy} onChange={event => {
              checkoutKey.current = null; setCode(event.target.value);
            }} maxLength={40} autoCapitalize="characters" /></Field>
            <div className="section-heading cart-total"><span>Subtotal estimado</span><strong>{money(total)}</strong></div>
            <p>El stock, los precios y el cupón se confirman al enviar el pedido.</p>
            {profile.data && <button className="button primary" disabled={cartAction.busy}><Check size={17} />{cartAction.busy ? "Enviando…" : "Enviar pedido"}</button>}
          </form> : <Empty>Agrega productos para iniciar un pedido.</Empty>}
          {memberLoading && <Loading />}
          {session.data && profile.data === null && <button className="button primary" onClick={join} disabled={action.busy}>Unirme a esta tienda</button>}
          {!memberLoading && !session.data && <Link className="button primary" href={login}>Iniciar sesión</Link>}
        </aside>
      </div>

      {profile.data && <div className="stack roomy">
        <section className="card stack">
          <div className="section-heading"><h2>Mis pedidos</h2><ShoppingBag size={21} /></div>
          {orders.loading && <Loading />}
          {orders.error !== undefined && <Failure error={orders.error} reload={orders.reload} />}
          {orders.data && <><OrderHistory orders={orders.data.items} /><Pagination page={orderPage} size={size} total={orders.data.total} onChange={setOrderPage} /></>}
        </section>
        <section className="card stack">
          <div className="section-heading"><h2>Mis cupones</h2><Ticket size={21} /></div>
          {coupons.loading && <Loading />}
          {coupons.error !== undefined && <Failure error={coupons.error} reload={coupons.reload} />}
          {coupons.data && <><Coupons coupons={coupons.data.items} onUse={applyCoupon} /><Pagination page={couponPage} size={size} total={coupons.data.total} onChange={setCouponPage} /></>}
        </section>
        <section className="card stack" id="preferencias">
          <h2>Preferencias de correo</h2>
          <label className="checkbox"><input type="checkbox" checked={profile.data.marketingOptIn} disabled={action.busy} onChange={event => {
            const marketingOptIn = event.target.checked;
            void action.run(async () => { await api(`${root}/profile`, { method: "PATCH", body: { marketingOptIn } }); profile.reload(); });
          }} /> Quiero recibir novedades y recordatorios de esta tienda.</label>
        </section>
      </div>}
    </main>
  </div>;
}
