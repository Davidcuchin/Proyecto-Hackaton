"use client";

import { useState } from "react";
import { ChartNoAxesCombined, Package, ShoppingBag, Trophy } from "lucide-react";
import { api, useAction, useResource } from "@/lib/api";
import {
  displayDate, money, number, orderNames, orderTones,
  type Order, type OrderStatus, type Page, type Period, type RankedProduct, type Rankings, type Sales,
} from "@/lib/domain";
import { Badge, Empty, Failure, Field, Loading, Notice, Pagination } from "./ui";

const size = 15;
const periods: { key: Period; label: string }[] = [
  { key: "day", label: "Hoy" }, { key: "week", label: "Semana" }, { key: "month", label: "Mes" }, { key: "year", label: "Año" },
];

export function OrderHistory({ orders, onResolve, disabled }: {
  orders: Order[]; onResolve?: (order: Order, status: "APPROVED" | "FAILED") => void; disabled?: boolean;
}) {
  if (!orders.length) return <Empty>No hay pedidos para mostrar.</Empty>;
  return <ul className="detail-list">{orders.map(order => <li key={order.id}><details>
    <summary>
      <span className="tile-icon"><ShoppingBag size={19} /></span>
      <span><strong>{onResolve ? order.customer.user.name : `Pedido #${order.id.slice(-7).toUpperCase()}`}</strong>
        <small>{displayDate(order.createdAt)} · {money(order.total)}</small></span>
      <Badge tone={orderTones[order.status]}>{orderNames[order.status]}</Badge>
    </summary>
    <div className="detail-content stack">
      {onResolve && <p>{order.customer.user.email}</p>}
      <ul className="record-list">
        {order.items.map(item => <li key={item.id}><span>{item.productName} × {item.quantity}</span><strong>{money(item.unitPrice * item.quantity)}</strong></li>)}
        {order.discountAmount !== "0" && <li><span>Descuento por cupón</span><strong>−{money(order.discountAmount)}</strong></li>}
        <li><strong>Total</strong><strong>{money(order.total)}</strong></li>
      </ul>
      {order.status === "PENDING" && onResolve && <div className="actions">
        <button className="button primary" disabled={disabled} onClick={() => onResolve(order, "APPROVED")}>Aprobar pedido</button>
        <button className="button danger" disabled={disabled} onClick={() => onResolve(order, "FAILED")}>Rechazar pedido</button>
      </div>}
    </div>
  </details></li>)}</ul>;
}

function SalesChart({ data }: { data: Sales }) {
  const [metric, setMetric] = useState<"revenue" | "units">("revenue");
  const max = Math.max(1, ...data.buckets.map(row => Number(row[metric])));
  const format = metric === "revenue" ? money : number;

  return <>
    <div className="metrics">
      <div><small>Ingresos</small><strong>{money(data.totals.revenue)}</strong></div>
      <div><small>Unidades</small><strong>{number(data.totals.units)}</strong></div>
      <div><small>Pedidos aprobados</small><strong>{number(data.totals.orders)}</strong></div>
    </div>
    <div className="section-heading">
      <h3>Actividad del período</h3>
      <select aria-label="Métrica del gráfico" value={metric} onChange={event => setMetric(event.target.value === "units" ? "units" : "revenue")}>
        <option value="revenue">Ingresos</option><option value="units">Unidades</option>
      </select>
    </div>
    <div className="chart-scroll">
      <ol className="bar-chart" style={{ gridTemplateColumns: `repeat(${data.buckets.length}, minmax(32px, 1fr))` }} aria-label={metric === "revenue" ? "Ingresos por intervalo" : "Unidades por intervalo"}>
        {data.buckets.map(row => <li key={row.bucket} aria-label={`${row.label}, ${format(row[metric])}`} title={`${row.label}: ${format(row[metric])}`}>
          <span className="bar-track" aria-hidden="true"><span style={{ height: `${Number(row[metric]) / max * 100}%` }} /></span>
          <small aria-hidden="true">{row.label}</small>
        </li>)}
      </ol>
    </div>
  </>;
}

function ProductRanking({ title, products, measure }: { title: string; products: RankedProduct[]; measure: "units" | "revenue" | "stock" }) {
  const Icon = measure === "stock" ? Package : Trophy;
  return <section className="card stack">
    <div className="section-heading"><h3>{title}</h3><Icon size={19} /></div>
    {products.length ? <ol className="rank-list">{products.map((product, index) => <li key={product.id}>
      <span className="rank-index">{index + 1}</span>
      <span><strong>{product.name}</strong><small>{product.sku}</small></span>
      <strong>{measure === "revenue" ? money(product.revenue) : `${number(product[measure])} un.`}</strong>
    </li>)}</ol> : <Empty>Sin productos en este ranking.</Empty>}
  </section>;
}

export function SalesView({ business }: { business: string }) {
  const [period, setPeriod] = useState<Period>("day");
  const [filter, setFilter] = useState<OrderStatus | "">("");
  const [page, setPage] = useState(1);
  const sales = useResource<Sales>(`/analytics/sales?period=${period}`, business);
  const rankings = useResource<Rankings>("/analytics/products", business);
  const orders = useResource<Page<Order>>(`/orders?limit=${size}&page=${page}${filter ? `&status=${filter}` : ""}`, business);
  const action = useAction();

  function resolve(order: Order, status: "APPROVED" | "FAILED") {
    if (status === "FAILED" && !window.confirm("¿Rechazar este pedido?")) return;
    void action.run(async () => {
      await api(`/orders/${order.id}/status`, { business, method: "PATCH", body: { status } });
      action.setNotice({ text: status === "APPROVED" ? "Pedido aprobado. Se descontó el stock." : "Pedido rechazado.", tone: "success" });
      if (page > 1 && orders.data?.items.length === 1 && filter === "PENDING") setPage(page - 1);
      orders.reload(); sales.reload(); rankings.reload();
    });
  }

  return <div className="stack roomy">
    <section className="card stack">
      <div className="section-heading"><div><h2>Ventas del período</h2><p>Pedidos aprobados · Hora de Santiago</p></div><ChartNoAxesCombined size={23} /></div>
      <div className="pills" aria-label="Período">{periods.map(item =>
        <button key={item.key} aria-pressed={period === item.key} onClick={() => setPeriod(item.key)}>{item.label}</button>)}</div>
      {sales.loading && <Loading />}
      {sales.error !== undefined && <Failure error={sales.error} reload={sales.reload} />}
      {sales.data && <SalesChart data={sales.data} />}
    </section>
    <section className="card stack">
      <div className="section-heading"><h2>Pedidos</h2><Field label="Estado"><select value={filter} onChange={event => { setFilter(event.target.value as OrderStatus | ""); setPage(1); }}>
        <option value="">Todos</option>{Object.entries(orderNames).map(([status, label]) => <option value={status} key={status}>{label}</option>)}
      </select></Field></div>
      {action.notice && <Notice {...action.notice} />}
      {orders.loading && <Loading />}
      {orders.error !== undefined && <Failure error={orders.error} reload={orders.reload} />}
      {orders.data && <><OrderHistory orders={orders.data.items} onResolve={resolve} disabled={action.busy} />
        <Pagination page={page} size={size} total={orders.data.total} onChange={setPage} /></>}
    </section>
    <section className="stack" aria-labelledby="rankings-title">
      <div><h2 id="rankings-title">Ranking de productos</h2><p className="muted">Últimos 30 días</p></div>
      {rankings.loading && <Loading />}
      {rankings.error !== undefined && <Failure error={rankings.error} reload={rankings.reload} />}
      {rankings.data && <div className="ranking-grid">
        <ProductRanking title="Más vendidos" products={rankings.data.byUnits} measure="units" />
        <ProductRanking title="Mayores ingresos" products={rankings.data.byRevenue} measure="revenue" />
        <ProductRanking title="Con stock y sin ventas" products={rankings.data.stagnant} measure="stock" />
      </div>}
    </section>
  </div>;
}
