"use client";

import { useState } from "react";
import { ClipboardCopy, CreditCard, Mail, Send, Sparkles, UsersRound } from "lucide-react";
import { api, useAction, useResource } from "@/lib/api";
import { displayDate, mailNames, segmentNames, type Analysis, type CustomerPage, type MailPage, type MailStatus, type Segment } from "@/lib/domain";
import { Back, Badge, Empty, Failure, Field, Loading, Notice, Pagination } from "./ui";

const size = 20;

export function Customers({ business }: { business: string }) {
  const [filter, setFilter] = useState<Segment | "">("");
  const [page, setPage] = useState(1);
  const [mailPage, setMailPage] = useState(1);
  const customers = useResource<CustomerPage>(`/customers?page=${page}&limit=${size}${filter ? `&segment=${filter}` : ""}`, business);
  const outbox = useResource<MailPage>(`/mail?page=${mailPage}&limit=${size}`, business);
  const action = useAction();

  function remind(id: string) {
    void action.run(async () => {
      const result = await api<{ status: MailStatus }>(`/customers/${id}/remind`, { business, method: "POST", body: {} });
      action.setNotice({
        text: result.status === "SENT" ? "Ya se envió un recordatorio hoy."
          : result.status === "FAILED" ? "El recordatorio de hoy figura como fallido."
          : "Recordatorio en la cola de correo.",
        tone: result.status === "FAILED" ? "error" : "success",
      });
      if (mailPage !== 1) setMailPage(1);
      else outbox.reload();
    });
  }

  return <div className="stack roomy">
    {customers.data && <div className="metrics segment-metrics">
      {Object.entries(segmentNames).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => {
        setFilter(filter === value ? "" : value as Segment); setPage(1);
      }}><small>{label}</small><strong>{customers.data?.counts[value as Segment] ?? 0}</strong></button>)}
    </div>}
    <section className="card stack">
      <div className="section-heading"><div><h2>Ranking de frecuencia</h2><p>Ordenado por compras aprobadas y actividad reciente.</p></div><UsersRound size={22} /></div>
      <div className="actions"><Field label="Segmento"><select value={filter} onChange={event => { setFilter(event.target.value as Segment | ""); setPage(1); }}>
        <option value="">Todos</option>{Object.entries(segmentNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></Field></div>
      {action.notice && <Notice {...action.notice} />}
      {customers.loading && <Loading />}
      {customers.error !== undefined && <Failure error={customers.error} reload={customers.reload} />}
      {customers.data && (customers.data.items.length === 0 ? <Empty>No hay clientes en este segmento.</Empty> : <div className="table-scroll"><table>
        <thead><tr><th>Cliente</th><th>Compras</th><th>Última compra</th><th>Segmento</th><th>Novedades</th></tr></thead>
        <tbody>{customers.data.items.map(customer => <tr key={customer.id}>
          <td><strong>{customer.name}</strong><small>{customer.email}</small></td><td>{customer.approvedOrdersCount}</td>
          <td>{customer.daysSinceLastPurchase === null ? "Sin compras" : customer.daysSinceLastPurchase === 0 ? "Hoy" : `Hace ${customer.daysSinceLastPurchase} días`}</td>
          <td><Badge tone={customer.segment === "VIP" ? "violet" : customer.segment === "AT_RISK" ? "amber" : "neutral"}>{segmentNames[customer.segment]}</Badge></td>
          <td>{customer.marketingOptIn && ["AT_RISK", "INFREQUENT"].includes(customer.segment) ?
            <button className="button secondary small" disabled={action.busy} onClick={() => remind(customer.id)}><Send size={14} />Recordatorio</button>
            : <span className="muted">{customer.marketingOptIn ? "Acepta novedades" : "Sin suscripción"}</span>}</td>
        </tr>)}</tbody></table></div>)}
      {customers.data && <Pagination page={page} size={size} total={customers.data.total} onChange={setPage} />}
    </section>

    <section className="card stack">
      <div className="section-heading"><div><h2>Correo de fidelización</h2><p>Cupones y recordatorios por comercio.</p></div><Mail size={22} /></div>
      {outbox.loading && <Loading />}
      {outbox.error !== undefined && <Failure error={outbox.error} reload={outbox.reload} />}
      {outbox.data && <>
        {!outbox.data.enabled && <p className="muted">Los correos quedan en cola hasta configurar el servicio de correo.</p>}
        {outbox.data.items.length ? <ul className="record-list">{outbox.data.items.map(job => <li key={job.id}>
          <div><strong>{job.subject}</strong><small>{job.recipient} · {displayDate(job.createdAt)}</small></div>
          <Badge tone={job.status === "SENT" ? "green" : job.status === "FAILED" ? "amber" : "neutral"}>{mailNames[job.status]}</Badge>
        </li>)}</ul> : <Empty>Aún no hay correos registrados.</Empty>}
        <div className="section-heading"><button className="button secondary small" onClick={outbox.reload}>Actualizar estados</button>
          <Pagination page={mailPage} size={size} total={outbox.data.total} onChange={setMailPage} /></div>
      </>}
    </section>
  </div>;
}

export function Assistant({ business }: { business: string }) {
  const action = useAction();
  const [analysis, setAnalysis] = useState<Analysis>();

  const run = () => action.run(async () => {
    setAnalysis(await api<Analysis>("/ai/analyze", { business, method: "POST", body: {} }));
  });
  const copy = () => action.run(async () => {
    if (!analysis) return;
    await navigator.clipboard.writeText(analysis.draft);
    action.setNotice({ text: "Borrador copiado.", tone: "success" });
  });

  return <div className="stack">
    <Back />
    <section className="assistant-intro stack">
      <span className="tile-icon"><Sparkles size={25} /></span>
      <div><h2>Genera un análisis del día</h2><p>Consulta tus ventas, productos congelados o próximos a vencer y clientes inactivos.</p></div>
      <div><button className="button primary" onClick={() => void run()} disabled={action.busy}><Sparkles size={17} />{action.busy ? "Procesando…" : "Generar análisis"}</button></div>
    </section>
    {action.notice && <Notice {...action.notice} />}
    {analysis && <div className="stack">
      <div><Badge tone="violet">{analysis.source === "llm" ? "Análisis generado con IA" : "Análisis por reglas locales"}</Badge></div>
      <section className="card stack"><h2>Diagnóstico comercial</h2><p className="prewrap">{analysis.diagnosis}</p></section>
      <section className="card stack"><h2>Estrategia de rescate</h2><p className="prewrap">{analysis.strategy}</p></section>
      <section className="card stack"><div className="section-heading"><h2>Borrador de reactivación</h2>
        <button className="button secondary" disabled={action.busy} onClick={() => void copy()}><ClipboardCopy size={16} />Copiar</button>
      </div><p className="prewrap">{analysis.draft}</p></section>
    </div>}
  </div>;
}

export function Subscription({ business }: { business: string }) {
  const subscription = useResource<{ status: string }>("/subscription", business);
  return <div className="stack">
    <Back href="/panel/comercios">Volver a comercios</Back>
    <section className="card stack">
      <div className="section-heading"><h2>Plan del comercio</h2><CreditCard size={23} /></div>
      {subscription.loading && <Loading />}
      {subscription.error !== undefined && <Failure error={subscription.error} reload={subscription.reload} />}
      {subscription.data && <div><Badge tone="amber">{subscription.data.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge>
        <p>La gestión de planes se habilitará próximamente.</p></div>}
    </section>
  </div>;
}
