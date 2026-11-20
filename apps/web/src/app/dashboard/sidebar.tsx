"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Resumen" },
  { href: "/dashboard/productos", label: "Productos y ofertas" },
  { href: "/dashboard/facturas", label: "Ventas y facturas" },
  { href: "/dashboard/clientes", label: "Clientes" },
  { href: "/dashboard/fidelizacion", label: "Fidelización" },
  { href: "/dashboard/agente-ia", label: "Asistente IA" },
];

export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="dashboard-sidebar">
      <Link href="/dashboard" className="dashboard-brand" aria-label="DaleDoble, ir al resumen">
        <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M0 2h6l7 10-7 10H0l7-10zM10 2h6l7 10-7 10h-6l7-10z" />
        </svg>
        <span>DaleDoble</span>
      </Link>
      <div className="business-info">
        <strong>Mi negocio</strong>
        <span>Panel del emprendedor</span>
      </div>
      <nav className="dashboard-nav" aria-label="Navegación del panel">
        {navigation.map((item) => (
          <Link
            href={item.href}
            key={item.href}
            className={pathname === item.href ? "nav-link selected" : "nav-link"}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Link href="/" className="store-button">Ver tienda cliente</Link>
        <div className="sidebar-profile">
          <span>Perfil del emprendedor</span>
          <small>ADMIN&nbsp; / &nbsp;Web</small>
        </div>
      </div>
    </aside>
  );
}
