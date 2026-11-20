import type { CSSProperties, ReactNode } from "react";
import styles from "./dashboard-design.module.css";

type Link = { label: string; href: string };
type NavigationLink = Link & { icon: ReactNode; active?: boolean };
type Shortcut = Link & { detail?: string; icon: ReactNode };
type Segment = { label: string; value: number; color?: string };
type Activity = {
  id: string;
  title: string;
  detail?: string;
  date?: { label: string; dateTime: string };
  status?: string;
  tone?: "violet" | "neutral" | "amber";
  icon: ReactNode;
};

export type DashboardDesignProps = {
  brand: Link & { icon: ReactNode };
  heading: string;
  subtitle?: string;
  utilities?: ReactNode;
  navigation: readonly [NavigationLink, NavigationLink, NavigationLink, NavigationLink];
  primaryAction: Link;
  summary: { label: string; value: ReactNode; icon?: ReactNode };
  shortcuts: { title: string; items: readonly [Shortcut, Shortcut] };
  chart: { title: string; centerLabel: string; segments: readonly Segment[] };
  activity: { title: string; viewAll?: Link; rows: readonly Activity[] };
};

const chartColors = ["#6026ed", "#ad98fa", "#23184f"];

function DistributionChart({ title, centerLabel, segments }: DashboardDesignProps["chart"]) {
  const entries = segments.map(({ label, value, color }, index) => ({
    label,
    value: Number.isFinite(value) ? Math.max(0, value) : 0,
    color: color ?? chartColors[index % chartColors.length],
  }));
  const total = entries.reduce((sum, { value }) => sum + value, 0);
  let start = 0;
  const stops = entries.filter(({ value }) => value > 0).map(({ color, value }) => {
    const end = start + (value / total) * 100;
    const stop = `${color} ${start}% ${end}%`;
    start = end;
    return stop;
  });
  const fill = stops.length > 1
    ? `conic-gradient(from 310deg, ${stops.join(", ")})`
    : entries.find(({ value }) => value > 0)?.color ?? "#e0d6f7";

  return (
    <section className={styles.chartCard}>
      <h2>{title}</h2>
      <div className={styles.donut} style={{ "--chart-fill": fill } as CSSProperties}>
        <div className={styles.donutLabel}><strong>{total}</strong><span>{centerLabel}</span></div>
      </div>
      <ul className={styles.legend}>
        {entries.map(({ label, value, color }) => (
          <li key={label}>
            <span className={styles.legendDot} style={{ backgroundColor: color }} aria-hidden="true" />
            <span>{label}</span>
            <strong>{value}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NavigationItem({ label, href, active, icon }: NavigationLink) {
  return (
    <a className={styles.navLink} href={href} aria-current={active ? "page" : undefined}>
      <span className={styles.navIcon} aria-hidden="true">{icon}</span>
      {label}
    </a>
  );
}

export default function DashboardDesign({
  brand, heading, subtitle, utilities, navigation, primaryAction,
  summary, shortcuts, chart, activity,
}: DashboardDesignProps) {
  const brandLink = (
    <a className={styles.brand} href={brand.href}>
      <span className={styles.brandIcon} aria-hidden="true">{brand.icon}</span>{brand.label}
    </a>
  );
  const renderNavItem = (item: NavigationLink) => <NavigationItem key={item.href} {...item} />;

  return (
    <div className={styles.dashboard}>
      <aside className={styles.sidebar}>
        {brandLink}
        <nav className={styles.desktopNav} aria-label="Navegación principal">
          {navigation.map(renderNavItem)}
        </nav>
      </aside>

      <main className={styles.workspace}>
        <div className={styles.mobileBrand}>{brandLink}</div>
        <header className={styles.header}>
          <div>
            <h1>{heading}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {utilities && <div className={styles.utilities}>{utilities}</div>}
        </header>

        <div className={styles.overview}>
          <div className={styles.primaryColumn}>
            <section className={styles.hero}>
              <div className={styles.heroContent}>
                <h2>{summary.label}</h2>
                <strong className={styles.heroValue}>{summary.value}</strong>
                <a className={styles.heroAction} href={primaryAction.href}>
                  <span aria-hidden="true">+</span>{primaryAction.label}
                </a>
              </div>
              {summary.icon && (
                <div className={styles.heroArt} aria-hidden="true">
                  <span className={styles.heroIcon}>{summary.icon}</span>
                </div>
              )}
            </section>

            <section>
              <h2 className={styles.sectionTitle}>{shortcuts.title}</h2>
              <div className={styles.quickGrid}>
                {shortcuts.items.map(({ label, href, detail, icon }, index) => (
                  <a className={styles.quickCard} data-tone={index === 0 ? "violet" : "neutral"} href={href} key={href}>
                    <span className={styles.quickIcon} aria-hidden="true">{icon}</span>
                    <strong>{label}</strong>
                    {detail && <span className={styles.quickDetail}>{detail}</span>}
                  </a>
                ))}
              </div>
            </section>
          </div>
          <DistributionChart {...chart} />
        </div>

        <section className={styles.activity}>
          <header className={styles.sectionHeader}>
            <h2>{activity.title}</h2>
            {activity.viewAll && <a href={activity.viewAll.href}>{activity.viewAll.label}</a>}
          </header>
          <ul className={styles.activityList}>
            {activity.rows.map(({ id, title, detail, date, status, tone = "neutral", icon }) => (
              <li key={id} className={styles.row}>
                <span className={styles.rowIcon} data-tone={tone} aria-hidden="true">{icon}</span>
                <div className={styles.rowDescription}>
                  <strong>{title}</strong>
                  {detail && <span>{detail}</span>}
                </div>
                {date && <time dateTime={date.dateTime}>{date.label}</time>}
                {status && <span className={styles.status} data-tone={tone}>{status}</span>}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <nav className={styles.mobileNav} aria-label="Navegación principal">
        {navigation.slice(0, 2).map(renderNavItem)}
        <a className={styles.mobileAction} href={primaryAction.href} aria-label={primaryAction.label}>+</a>
        {navigation.slice(2).map(renderNavItem)}
      </nav>
    </div>
  );
}
