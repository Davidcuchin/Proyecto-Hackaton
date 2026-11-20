import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { money, type CategoryRevenue } from "@/lib/domain";
import { Badge, Brand, BusinessLogo, ButtonLink, Empty } from "./ui";
import styles from "./dashboard-design.module.css";

type LinkItem = { label: string; href: string };
type NavigationLink = LinkItem & { icon: ReactNode; active?: boolean };
type Metric = { label: string; value: ReactNode; icon: ReactNode };
type Segment = { label: string; value: number; tone: "aqua" | "amber" | "neutral" };
type Activity = {
  id: string;
  title: string;
  detail: string;
  date: { label: string; dateTime: string };
  status: string;
  tone: "violet" | "neutral" | "amber";
  icon: ReactNode;
};

type ShellProps = {
  commerce: string;
  logoPath?: string | null;
  heading: string;
  subtitle?: string;
  introArt?: ReactNode;
  utilities?: ReactNode;
  navigation: readonly NavigationLink[];
};

export type DashboardDesignProps = ShellProps & {
  primaryAction: LinkItem;
  metrics: readonly Metric[];
  chart: { title: string; segments: readonly Segment[] };
  categorySales: readonly CategoryRevenue[];
  activity: { title: string; viewAll: LinkItem; rows: readonly Activity[] };
};

function OrderDistribution({ title, segments }: DashboardDesignProps["chart"]) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return <section className={`card ${styles.overviewCard}`}>
    <div className={styles.cardHeader}><h2>{title}</h2><span className="muted">{total} en total</span></div>
    <ul className={styles.chartList}>
      {segments.map(({ label, value, tone }) => <li key={label}>
        <div className={styles.chartRow}><span>{label}</span><strong>{value}</strong></div>
        <div className={styles.bar} aria-hidden="true">
          <i data-tone={tone} style={{ "--dd-progreso": `${total ? value / total * 100 : 0}%` } as CSSProperties} />
        </div>
      </li>)}
    </ul>
  </section>;
}

export function AssistantMascot() {
  return <Image className={styles.assistantMascot} src="/impulso-assistant.webp" alt="" width={450} height={395} unoptimized />;
}

const categoryColors = ["#7140b5", "#00837f", "#c57515", "#4b66ba", "#ad4e82", "#758093"];
const percent = new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 });

function CategorySales({ categories }: { categories: readonly CategoryRevenue[] }) {
  const zero = BigInt(0);
  const sales = categories.map(({ category, revenue }) => ({ category, revenue: BigInt(revenue) }))
    .filter(({ revenue }) => revenue > zero);
  const total = sales.reduce((sum, { revenue }) => sum + revenue, zero);
  const visible = sales.length <= categoryColors.length ? sales : sales.slice(0, categoryColors.length - 1);
  const rows = visible.map(({ category, revenue }) => ({ key: `category:${category ?? ""}`, label: category ?? "Sin categoría", revenue }));
  if (visible.length < sales.length) {
    rows.push({ key: "other", label: "Otras categorías", revenue: sales.slice(visible.length).reduce((sum, row) => sum + row.revenue, zero) });
  }

  let cumulative = zero;
  const segments = rows.map((row, index) => {
    const start = Number(cumulative) / Number(total);
    cumulative += row.revenue;
    return { ...row, color: categoryColors[index], start, end: Number(cumulative) / Number(total) };
  });
  const stops = segments.map(({ color, start, end }) => `${color} ${start * 100}% ${end * 100}%`).join(", ");
  const background = segments.length === 1 ? segments[0].color : `conic-gradient(${stops})`;

  return <section className={`card ${styles.overviewCard} ${styles.categorySales}`} aria-labelledby="category-sales-title">
    <div className={styles.cardHeader}><h2 id="category-sales-title">Ventas por categoría</h2><Badge>Últimos 30 días</Badge></div>
    {segments.length === 0 ? <Empty>Todavía no hay ingresos por ventas aprobadas en este período.</Empty> :
      <div className={styles.categoryLayout}>
        <div className={styles.categoryRing} style={{ background }}>
          <div className={styles.categoryTotal}><span>Ventas netas</span><strong>{money(total)}</strong></div>
        </div>
        <ul className={styles.categoryLegend} aria-label="Ingresos por categoría">
          {segments.map(({ key, label, revenue, color }) => <li key={key}>
            <i aria-hidden="true" style={{ backgroundColor: color }} />
            <span>{label}</span><strong>{money(revenue)}</strong>
            <span className={styles.categoryPercent}>{percent.format(Number(revenue) / Number(total))}</span>
          </li>)}
        </ul>
      </div>}
  </section>;
}

export function DashboardShell({ commerce, logoPath, heading, subtitle, introArt, utilities, navigation, children }: ShellProps & { children: ReactNode }) {
  return <div className={styles.raiz}>
    <a className={styles.skip} href="#panel-contenido">Saltar al contenido</a>
    <header>
      <div className={styles.top}>
        <Brand href="/panel" />
        {utilities && <div className={styles.utilities}>{utilities}</div>}
      </div>
    </header>
    <div className={styles.layout}>
      <aside className={styles.side}>
        <p className={styles.commerce}>
          {logoPath && <BusinessLogo src={logoPath} size={44} className={styles.commerceLogo} />}
          <span>{commerce}</span>
        </p>
        <nav className={styles.menu} aria-label="Navegación principal">
          {navigation.map(({ label, href, active, icon }) =>
            <Link key={href} className={styles.navLink} href={href} aria-current={active ? "page" : undefined}>
              {icon}{label}
            </Link>)}
        </nav>
      </aside>
      <main id="panel-contenido" className={styles.workspace} tabIndex={-1}>
        <div className={styles.intro}>
          <div><h1>{heading}</h1>{subtitle && <p>{subtitle}</p>}</div>
          {introArt}
        </div>
        {children}
      </main>
    </div>
  </div>;
}

export default function DashboardDesign({ primaryAction, metrics, chart, categorySales, activity, ...shell }: DashboardDesignProps) {
  return <DashboardShell {...shell}>
    <section className={styles.banner} aria-labelledby="panel-assistant">
      <div>
        <h2 id="panel-assistant">Asistente comercial</h2>
        <p>Revisa oportunidades de venta y recibe recomendaciones para tu comercio.</p>
        <div className="actions">
          <ButtonLink href="/panel/asistente"><Sparkles size={17} aria-hidden="true" />Ver asistente</ButtonLink>
          <ButtonLink kind="secondary" href={primaryAction.href}><Plus size={17} aria-hidden="true" />{primaryAction.label}</ButtonLink>
        </div>
      </div>
      <div className={styles.bannerArt}><AssistantMascot /></div>
    </section>

    <ul className={styles.kpis} aria-label="Indicadores del comercio">
      {metrics.map(({ label, value, icon }) => <li className={`${styles.kpi} ${styles.summaryItem}`} key={label}>
        <span className={styles.summaryIcon} aria-hidden="true">{icon}</span>
        <span>{label}</span>
        <strong>{value}</strong>
      </li>)}
    </ul>

    <CategorySales categories={categorySales} />

    <div className={styles.grid}>
      <OrderDistribution {...chart} />
      <section className={`card ${styles.overviewCard}`}>
        <header className={styles.cardHeader}>
          <h2>{activity.title}</h2>
          <Link href={activity.viewAll.href}>{activity.viewAll.label}</Link>
        </header>
        {activity.rows.length === 0 ? <p className="muted">Todavía no hay pedidos en este comercio.</p> :
          <ul className={styles.activityList}>
            {activity.rows.map(({ id, title, detail, date, status, tone, icon }) => <li key={id} className={styles.activityItem}>
              <span className={styles.activityIcon} aria-hidden="true">{icon}</span>
              <div className={styles.activityDescription}>
                <strong>{title}</strong>
                <span>{detail} · <time dateTime={date.dateTime}>{date.label}</time></span>
              </div>
              <Badge tone={tone}>{status}</Badge>
            </li>)}
          </ul>}
      </section>
    </div>
  </DashboardShell>;
}
