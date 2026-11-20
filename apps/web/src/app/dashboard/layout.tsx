import type { ReactNode } from "react";
import DashboardSidebar from "./sidebar";
import "./dashboard.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-shell">
      <DashboardSidebar />
      <main className="dashboard-main">
        <div className="dashboard-topline">
          <span>Mi negocio <span className="breadcrumb-separator">/</span> Panel del emprendedor</span>
          <span>Maqueta · Datos ficticios</span>
        </div>
        {children}
      </main>
    </div>
  );
}
