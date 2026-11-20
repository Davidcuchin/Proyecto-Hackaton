"use client";

import Link from "next/link";
import { useState } from "react";

type Period = "Día" | "Semana" | "Mes" | "Año";
type Summary = {
  revenue: number;
  sales: number;
  units: number;
  products: { name: string; units: number }[];
  couponsIssued: number;
  couponsRedeemed: number;
  couponDiscount: number;
};

const periods: Period[] = ["Día", "Semana", "Mes", "Año"];

const examples: Record<Period, Summary> = {
  Día: {
    revenue: 36000,
    sales: 4,
    units: 6,
    products: [
      { name: "Producto A", units: 3 },
      { name: "Producto B", units: 2 },
      { name: "Servicio A", units: 1 },
    ],
    couponsIssued: 0,
    couponsRedeemed: 0,
    couponDiscount: 0,
  },
  Semana: {
    revenue: 168000,
    sales: 18,
    units: 29,
    products: [
      { name: "Producto A", units: 12 },
      { name: "Servicio A", units: 9 },
      { name: "Producto B", units: 8 },
    ],
    couponsIssued: 4,
    couponsRedeemed: 2,
    couponDiscount: 4000,
  },
  Mes: {
    revenue: 720000,
    sales: 75,
    units: 120,
    products: [
      { name: "Producto A", units: 48 },
      { name: "Producto B", units: 39 },
      { name: "Servicio A", units: 33 },
    ],
    couponsIssued: 16,
    couponsRedeemed: 8,
    couponDiscount: 16000,
  },
  Año: {
    revenue: 8400000,
    sales: 900,
    units: 1440,
    products: [
      { name: "Producto A", units: 570 },
      { name: "Producto B", units: 450 },
      { name: "Servicio A", units: 420 },
    ],
    couponsIssued: 180,
    couponsRedeemed: 90,
    couponDiscount: 180000,
  },
};

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("es-CL");

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("Día");
  const summary = examples[period];
  const maxUnits = Math.max(...summary.products.map((product) => product.units));
  const metrics = [
    { label: "Ventas cobradas", value: money.format(summary.revenue), note: "Descuentos aplicados" },
    { label: "Ventas aprobadas", value: number.format(summary.sales), note: "Órdenes del período" },
    { label: "Unidades vendidas", value: number.format(summary.units), note: "Suma de cantidades" },
    {
      label: "Ticket promedio",
      value: money.format(summary.revenue / summary.sales),
      note: "Redondeado al peso",
    },
  ];

  return (
    <>
      <header className="dashboard-heading">
        <h1>Resumen de ventas</h1>
        <p>Datos de ejemplo · Pesos chilenos</p>
      </header>

      <div className="dashboard-toolbar">
        <div className="period-filter" role="group" aria-label="Período de ventas">
          {periods.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={period === option}
              className={period === option ? "period-button active" : "period-button"}
              onClick={() => setPeriod(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="demo-badge">Datos de demostración</span>
      </div>

      <section className="metrics-grid" aria-label="Métricas de ventas">
        {metrics.map((metric, index) => (
          <article className={index === 0 ? "metric-card metric-card-primary" : "metric-card"} key={metric.label}>
            <h2>{metric.label}</h2>
            <p className="metric-value">{metric.value}</p>
            <p className="metric-note">{metric.note}</p>
          </article>
        ))}
      </section>

      <div className="dashboard-panels">
        <section className="dashboard-card products-card" aria-labelledby="products-heading">
          <h2 id="products-heading">Productos más vendidos</h2>
          <p className="card-description">Ordenados por unidades en el período</p>
          <ul className="product-list">
            {summary.products.map((product, index) => (
              <li key={product.name}>
                <div className="product-line">
                  <span>{product.name}</span>
                  <span>{number.format(product.units)} ud.</span>
                </div>
                <div className="product-track" aria-hidden="true">
                  <div
                    className={index === 0 ? "product-bar product-bar-primary" : "product-bar"}
                    style={{ width: `${(product.units / maxUnits) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="dashboard-card loyalty-card" aria-labelledby="loyalty-heading">
          <h2 id="loyalty-heading">Fidelización del período</h2>
          <dl className="loyalty-list">
            <div><dt>Cupones emitidos</dt><dd>{number.format(summary.couponsIssued)}</dd></div>
            <div><dt>Cupones canjeados</dt><dd>{number.format(summary.couponsRedeemed)}</dd></div>
            <div><dt>Descuento por cupones</dt><dd>{money.format(summary.couponDiscount)}</dd></div>
          </dl>
          <Link className="secondary-button" href="/dashboard/fidelizacion">Ver campaña</Link>
        </section>
      </div>

      <section className="dashboard-banner">
        <div>
          <h2>Tu negocio, en resumen</h2>
          <p>Conoce tus productos y servicios para tomar mejores decisiones.</p>
        </div>
        <Link className="primary-button" href="/dashboard/productos">Ver productos</Link>
      </section>
    </>
  );
}
