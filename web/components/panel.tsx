"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight, Boxes, ChartNoAxesCombined, ChartPie, Clock3, CreditCard, LayoutGrid, LogOut,
  Plus, ReceiptText, ShoppingBag, Sparkles, Store, UsersRound,
} from "lucide-react";
import { z } from "zod";
import { api, ApiError, useAction, useResource } from "@/lib/api";
import { displayDate, money, number, orderNames, orderTones, type Business, type Me, type Overview } from "@/lib/domain";
import DashboardDesign, { AssistantMascot, DashboardShell, type DashboardDesignProps } from "./dashboard-design";
import { Inventory } from "./inventory";
import { Invoices } from "./invoices";
import { SalesView } from "./sales";
import { Customers, Assistant, Subscription } from "./relationships";
import { Brand, ButtonLink, Empty, Failure, Field, Loading, Notice } from "./ui";

const pages: Record<string, { heading: string; subtitle: string }> = {
  resumen: { heading: "Resumen", subtitle: "Tu actividad comercial de un vistazo." },
  inventario: { heading: "Inventario", subtitle: "Controla stock, vencimientos y disponibilidad." },
  facturas: { heading: "Facturas", subtitle: "Registra compras de proveedores y actualiza existencias." },
  ventas: { heading: "Ventas", subtitle: "Gestiona pedidos y revisa tus resultados." },
  clientes: { heading: "Clientes", subtitle: "Conoce la frecuencia de compra y reactiva clientes." },
  asistente: { heading: "Asistente comercial", subtitle: "Consulta tus ventas y oportunidades del día." },
  suscripcion: { heading: "Suscripción", subtitle: "Consulta el estado del plan de tu comercio." },
  comercios: { heading: "Tus comercios", subtitle: "Registra un comercio y comparte su tienda." },
};

const newProduct = { label: "Nuevo producto", href: "/panel/inventario/nuevo" };

function navigation(active: string): DashboardDesignProps["navigation"] {
  return [
    { label: "Resumen", href: "/panel", icon: <LayoutGrid size={18} />, active: active === "resumen" },
    { label: "Inventario", href: "/panel/inventario", icon: <Boxes size={18} />, active: active === "inventario" },
    { label: "Ventas", href: "/panel/ventas", icon: <ChartNoAxesCombined size={18} />, active: active === "ventas" },
    { label: "Facturas", href: "/panel/facturas", icon: <ReceiptText size={18} />, active: active === "facturas" },
    { label: "Clientes", href: "/panel/clientes", icon: <UsersRound size={18} />, active: active === "clientes" },
    { label: "Asistente", href: "/panel/asistente", icon: <Sparkles size={18} />, active: active === "asistente" },
  ];
}

const businessSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(3).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

function BusinessForm({ onCreated }: { onCreated: (business: Business) => void }) {
  const action = useAction();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action.run(async () => {
      const parsed = businessSchema.safeParse(Object.fromEntries(form));
      if (!parsed.success) throw new Error("Ingresa un nombre y una URL de 3 a 40 caracteres con letras minúsculas, números y guiones.");
      onCreated(await api<Business>("/businesses", { method: "POST", body: parsed.data }));
    });
  };
  return <form className="card stack form-card" onSubmit={submit}>
    <div><h2>Registrar comercio</h2><p>Esta URL identifica tu tienda pública.</p></div>
    <div className="form-grid">
      <Field label="Nombre del comercio"><input name="name" placeholder="Mercado del Valle" maxLength={80} required autoComplete="organization" /></Field>
      <Field label="Nombre para la URL"><input name="slug" placeholder="mercado-del-valle" minLength={3} maxLength={40} required pattern="[a-z0-9]+(?:\x2d[a-z0-9]+)*" autoCapitalize="none" spellCheck={false} /></Field>
    </div>
    {action.notice && <Notice {...action.notice} />}
    <div><button className="button primary" disabled={action.busy}><Plus size={17} />Crear comercio</button></div>
  </form>;
}

function OverviewPage({ business, utilities }: { business: Business; utilities: DashboardDesignProps["utilities"] }) {
  const overview = useResource<Overview>("/analytics/overview", business.id);
  const shell = { commerce: business.name, logoPath: business.logoPath, ...pages.resumen, utilities, navigation: navigation("resumen") };
  if (!overview.data) return <DashboardShell {...shell}>{overview.error ? <Failure error={overview.error} reload={overview.reload} /> : <Loading />}</DashboardShell>;
  const { today, recent, counts } = overview.data;
  return <DashboardDesign {...shell}
    categorySales={overview.data.categories ?? []}
    primaryAction={newProduct}
    metrics={[
      { label: "Ingresos de hoy", value: money(today.revenue), icon: <ChartNoAxesCombined size={17} /> },
      { label: "Pedidos aprobados hoy", value: number(today.orders), icon: <ShoppingBag size={17} /> },
      { label: "Pedidos pendientes", value: number(counts.PENDING ?? 0), icon: <Clock3 size={17} /> },
      { label: "Unidades vendidas hoy", value: number(today.units), icon: <Boxes size={17} /> },
    ]}
    chart={{ title: "Estado de los pedidos", segments: [
      { label: "Aprobados", value: counts.APPROVED ?? 0, tone: "aqua" },
      { label: "Pendientes", value: counts.PENDING ?? 0, tone: "amber" },
      { label: "Rechazados", value: counts.FAILED ?? 0, tone: "neutral" },
    ] }}
    activity={{ title: "Pedidos recientes", viewAll: { label: "Ver ventas", href: "/panel/ventas" },
      rows: recent.map(order => ({
        id: order.id, title: order.customer.user.name, detail: money(order.total),
        date: { dateTime: order.createdAt, label: displayDate(order.createdAt) },
        status: orderNames[order.status], tone: orderTones[order.status], icon: <ShoppingBag size={18} />,
      })),
    }} />;
}

export function Panel({ section }: { section: string[] }) {
  const session = useResource<Me>("/auth/me");
  const [selected, setSelected] = useState("");
  const [pendingBusiness, setPendingBusiness] = useState<Business>();
  const action = useAction();
  const router = useRouter();
  const active = section[0] ?? "resumen";
  const businesses = session.data?.businesses;
  const business = businesses?.find(item => item.id === selected)
    ?? (pendingBusiness?.id === selected ? pendingBusiness : undefined)
    ?? businesses?.[0];
  useEffect(() => { setSelected(window.localStorage.getItem("impulso.business") ?? ""); }, []);
  const select = (id: string) => { setSelected(id); window.localStorage.setItem("impulso.business", id); };
  const logout = () => action.run(async () => { await signOut({ redirect: false }); window.location.assign("/"); });
  const created = (item: Business) => { setPendingBusiness(item); select(item.id); session.reload(); router.push("/panel"); };

  if (!session.data || !business) {
    return <main className="standalone stack">
      <header className="standalone-header"><Brand />{session.data && <button className="button secondary" onClick={() => void logout()} disabled={action.busy}><LogOut size={17} />Salir</button>}</header>
      {action.notice && <Notice {...action.notice} />}
      {session.loading && <Loading />}
      {session.error instanceof ApiError && session.error.status === 401 && <section className="card stack">
        <h1>Ingresa a tu panel</h1><p>Inicia sesión para gestionar tu comercio.</p>
        <div><ButtonLink href="/">Ir al inicio</ButtonLink></div>
      </section>}
      {session.error !== undefined && !(session.error instanceof ApiError && session.error.status === 401) && <Failure error={session.error} reload={session.reload} />}
      {session.data && <BusinessForm onCreated={created} />}
    </main>;
  }

  const utilities = <>
    <Link className="icon-button" href="/panel/comercios" title="Tus comercios" aria-label="Tus comercios"><Store size={19} /></Link>
    <Link className="icon-button" href={`/tienda/${business.slug}`} title="Ver tienda" aria-label="Ver tienda"><ArrowUpRight size={20} /></Link>
    <button className="icon-button" onClick={() => void logout()} title="Cerrar sesión" aria-label="Cerrar sesión" disabled={action.busy}><LogOut size={18} /></button>
  </>;
  if (active === "resumen") return <>
    {action.notice && <div className="floating-notice"><Notice {...action.notice} /></div>}
    <OverviewPage business={business} utilities={utilities} />
  </>;

  const page = pages[active] ?? { heading: "Sección no encontrada", subtitle: "" };
  return <DashboardShell {...page} commerce={business.name} logoPath={business.logoPath} navigation={navigation(active)} utilities={utilities}
    introArt={active === "asistente" ? <AssistantMascot /> : undefined}>
    {action.notice && <Notice {...action.notice} />}
    <div key={`${active}:${business.id}`}>
      {active === "inventario" && <Inventory business={business.id} openNew={section[1] === "nuevo"} />}
      {active === "facturas" && <Invoices business={business.id} openNew={section[1] === "nueva"} />}
      {active === "ventas" && <SalesView business={business.id} />}
      {active === "clientes" && <Customers business={business.id} />}
      {active === "asistente" && <Assistant business={business.id} />}
      {active === "suscripcion" && <Subscription business={business.id} />}
      {active === "comercios" && <div className="stack">
        <section className="card stack">
          <div className="section-heading"><div><h2>Comercio activo</h2><p>Cambia el comercio que quieres gestionar.</p></div><Store size={23} /></div>
          <Field label="Selecciona un comercio"><select value={business.id} onChange={event => select(event.target.value)}>
            {(businesses?.some(item => item.id === business.id) ? businesses : [...(businesses ?? []), business]).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></Field>
          <div className="actions">
            <ButtonLink kind="secondary" href={`/tienda/${business.slug}`}><ArrowUpRight size={16} />Abrir tienda</ButtonLink>
            <ButtonLink kind="secondary" href="/panel/suscripcion"><CreditCard size={16} />Suscripción</ButtonLink>
          </div>
        </section>
        <BusinessForm onCreated={created} />
      </div>}
      {!pages[active] && <Empty><ChartPie size={20} /> <Link href="/panel">Volver al resumen</Link></Empty>}
    </div>
  </DashboardShell>;
}
