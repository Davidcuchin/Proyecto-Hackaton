"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, CircleCheck } from "lucide-react";
import { errorText } from "@/lib/api";

export function Brand({ href = "/" }: { href?: string }) {
  return <Link className="brand" href={href}><span className="brand-mark" aria-hidden="true" />Impulso</Link>;
}

export function ButtonLink({ href, children, kind = "primary" }: { href: string; children: ReactNode; kind?: "primary" | "secondary" }) {
  return <Link href={href} className={`button ${kind}`}>{children}</Link>;
}

export function Back({ href = "/panel", children = "Volver al panel" }: { href?: string; children?: ReactNode }) {
  return <Link className="back" href={href}><ArrowLeft size={17} aria-hidden="true" />{children}</Link>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "violet" | "amber" | "green" }) {
  return <span className="badge" data-tone={tone}>{children}</span>;
}

export function Notice({ text, tone = "error" }: { text?: string; tone?: "error" | "success" }) {
  if (!text) return null;
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return <div className="notice" data-tone={tone} role={tone === "error" ? "alert" : "status"}><Icon size={18} aria-hidden="true" />{text}</div>;
}

export function Loading() {
  return <div className="empty" role="status"><span className="spinner" aria-hidden="true" /> Cargando…</div>;
}

export function Failure({ error, reload }: { error: unknown; reload?: () => void }) {
  return <div className="stack tight"><Notice text={errorText(error)} />{reload && <button className="button secondary" onClick={reload}>Reintentar</button>}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Pagination({ page, total, size, onChange }: { page: number; total: number; size: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1 && page === 1) return null;
  return <nav aria-label="Páginas de resultados" className="pagination">
    <button className="icon-button" aria-label="Página anterior" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={18} /></button>
    <span>Página {page} de {pages}</span>
    <button className="icon-button" aria-label="Página siguiente" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={18} /></button>
  </nav>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
