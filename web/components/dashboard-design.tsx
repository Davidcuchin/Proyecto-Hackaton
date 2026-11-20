import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { Badge, Brand, ButtonLink } from "./ui";
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

export function DashboardShell({ commerce, heading, subtitle, introArt, utilities, navigation, children }: ShellProps & { children: ReactNode }) {
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
        <p className={styles.commerce}>{commerce}</p>
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

export default function DashboardDesign({ primaryAction, metrics, chart, activity, ...shell }: DashboardDesignProps) {
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
