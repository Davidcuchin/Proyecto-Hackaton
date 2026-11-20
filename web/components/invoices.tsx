"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, ReceiptText, Trash2 } from "lucide-react";
import { api, useAction, useResource } from "@/lib/api";
import { inputDate, money, today, type Invoice, type InvoiceLine, type Page, type Product } from "@/lib/domain";
import { Back, Badge, Empty, Failure, Field, Loading, Notice, Pagination } from "./ui";

const size = 15;
type Line = InvoiceLine & { key: number; productLabel?: string };
const blankLine = (key: number): Line => ({ key, productId: "", quantity: 1, unitCost: 0 });

function InvoiceProduct({ business, initial, line, onChange }: { business: string; initial: Product[]; line: Line; onChange: (patch: Partial<Line>) => void }) {
  const [search, setSearch] = useState("");
  const products = useResource<Page<Product>>(search ? `/products?limit=30&search=${encodeURIComponent(search)}` : null, business);
  const items = search ? products.data?.items ?? [] : initial;
  return <div className="stack tight">
    <Field label="Buscar producto"><input value={search} maxLength={120} placeholder="Nombre o SKU" onChange={event => setSearch(event.target.value)} /></Field>
    <Field label="Producto"><select value={line.productId} required onChange={event => {
      const item = items.find(product => product.id === event.target.value);
      onChange({ productId: event.target.value, productLabel: item ? `${item.name} · ${item.sku}` : undefined });
    }}>
      <option value="">Seleccionar producto</option>
      {line.productId && !items.some(item => item.id === line.productId) &&
        <option value={line.productId}>{line.productLabel ?? "Producto seleccionado"}</option>}
      {items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}
    </select></Field>
    {products.error !== undefined && <Failure error={products.error} reload={products.reload} />}
  </div>;
}

function InvoiceForm({ business, invoice, onClose, onSaved }: {
  business: string; invoice: Invoice | null; onClose: () => void; onSaved: (text: string) => void;
}) {
  const action = useAction();
  const products = useResource<Page<Product>>("/products?limit=30", business);
  const [lines, setLines] = useState<Line[]>(() => invoice?.items.map((item, key) => ({
    key, productId: item.productId, quantity: item.quantity, unitCost: item.unitCost, productLabel: `${item.product.name} · ${item.product.sku}`,
  })) ?? [blankLine(0)]);
  const total = lines.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const update = (key: number, patch: Partial<Line>) => setLines(rows => rows.map(row => row.key === key ? { ...row, ...patch } : row));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void action.run(async () => {
      if (new Set(lines.map(line => line.productId)).size !== lines.length) throw new Error("Agrega cada producto una sola vez.");
      await api(invoice ? `/invoices/${invoice.id}` : "/invoices", {
        business, method: invoice ? "PUT" : "POST",
        body: { supplier: data.get("supplier"), number: data.get("number"), issuedOn: data.get("issuedOn"),
          items: lines.map(({ productId, quantity, unitCost }) => ({ productId, quantity, unitCost })) },
      });
      onSaved(invoice ? "Factura corregida. Se ajustaron las existencias." : "Factura registrada. El stock se actualizó.");
    });
  }
  return <form className="card stack" id="factura-formulario" onSubmit={submit}>
    <div className="section-heading"><h2>{invoice ? `Editar factura ${invoice.number}` : "Nueva factura"}</h2><button type="button" className="button secondary" onClick={onClose}>Cerrar</button></div>
    <div className="form-grid">
      <Field label="Proveedor"><input name="supplier" maxLength={100} defaultValue={invoice?.supplier} required /></Field>
      <Field label="Número de factura"><input name="number" maxLength={40} defaultValue={invoice?.number} required /></Field>
      <Field label="Fecha de emisión"><input name="issuedOn" type="date" defaultValue={inputDate(invoice?.issuedOn) || today()} required /></Field>
    </div>
    <h3>Productos de la factura</h3>
    {products.error !== undefined && <Failure error={products.error} reload={products.reload} />}
    {lines.map((line, index) => <fieldset key={line.key} className="invoice-line">
      <legend>Producto {index + 1}</legend>
      <InvoiceProduct business={business} initial={products.data?.items ?? []} line={line} onChange={patch => update(line.key, patch)} />
      <Field label="Cantidad"><input type="number" min={1} max={1_000_000} value={line.quantity} required onChange={event => update(line.key, { quantity: Number(event.target.value) })} /></Field>
      <Field label="Costo unitario en CLP"><input type="number" min={0} max={100_000_000} value={line.unitCost} required onChange={event => update(line.key, { unitCost: Number(event.target.value) })} /></Field>
      <button type="button" className="icon-button" title="Quitar producto" aria-label={`Quitar producto ${index + 1}`} disabled={lines.length === 1}
        onClick={() => setLines(rows => rows.filter(row => row.key !== line.key))}><Trash2 size={17} /></button>
    </fieldset>)}
    <div className="section-heading">
      <button type="button" className="button secondary" disabled={lines.length >= 50}
        onClick={() => setLines(rows => [...rows, blankLine(Math.max(...rows.map(row => row.key)) + 1)])}><Plus size={17} />Agregar producto</button>
      <strong>Total {money(total)}</strong>
    </div>
    {action.notice && <Notice {...action.notice} />}
    <div><button className="button primary" disabled={action.busy}>{action.busy ? "Guardando…" : "Guardar factura"}</button></div>
  </form>;
}

export function Invoices({ business, openNew }: { business: string; openNew: boolean }) {
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Invoice | "new" | null>(openNew ? "new" : null);
  const invoices = useResource<Page<Invoice>>(`/invoices?page=${page}&limit=${size}`, business);
  const action = useAction();
  const router = useRouter();
  useEffect(() => { if (openNew) setEditor("new"); }, [openNew]);
  useEffect(() => {
    if (editor) document.getElementById("factura-formulario")?.scrollIntoView({ block: "nearest" });
  }, [editor]);
  const close = () => {
    setEditor(null);
    if (openNew) router.replace("/panel/facturas", { scroll: false });
  };
  const saved = (text: string) => { close(); action.setNotice({ text, tone: "success" }); invoices.reload(); };

  function cancel(item: Invoice) {
    if (!window.confirm(`¿Anular la factura ${item.number}? Se revertirán las cantidades ingresadas.`)) return;
    void action.run(async () => {
      await api(`/invoices/${item.id}`, { method: "DELETE", business });
      saved("Factura anulada. Se revirtió el ajuste de stock.");
    });
  }

  return <div className="stack">
    <div className="toolbar"><Back href="/panel/inventario">Volver a inventario</Back>
      <button className="button primary" onClick={() => setEditor("new")}><Plus size={17} />Nueva factura</button>
    </div>
    {action.notice && <Notice {...action.notice} />}
    {editor && <InvoiceForm key={editor === "new" ? "new" : editor.id}
      business={business} invoice={editor === "new" ? null : editor} onClose={close} onSaved={saved} />}
    <section className="card stack">
      <div className="section-heading"><h2>Facturas de proveedores</h2><ReceiptText size={23} /></div>
      {invoices.loading && <Loading />}
      {invoices.error !== undefined && <Failure error={invoices.error} reload={invoices.reload} />}
      {invoices.data && (invoices.data.items.length === 0 ? <Empty>Todavía no registras facturas.</Empty> : <ul className="detail-list">
        {invoices.data.items.map(item => <li key={item.id}><details>
          <summary><span className="tile-icon"><FileText size={19} /></span>
            <span><strong>{item.supplier} · #{item.number}</strong><small>{inputDate(item.issuedOn)} · {money(item.total)}</small></span>
            <Badge tone={item.cancelledAt ? "neutral" : "green"}>{item.cancelledAt ? "Anulada" : "Registrada"}</Badge>
          </summary>
          <div className="detail-content stack">
            <ul className="record-list">{item.items.map(line => <li key={line.productId}><span>{line.product.name} × {line.quantity}</span><strong>{money(line.quantity * line.unitCost)}</strong></li>)}</ul>
            {!item.cancelledAt && <div className="actions">
              <button className="button secondary" onClick={() => setEditor(item)}>Editar factura</button>
              <button className="button danger" disabled={action.busy} onClick={() => cancel(item)}>Anular factura</button>
            </div>}
          </div>
        </details></li>)}
      </ul>)}
      {invoices.data && <Pagination page={page} size={size} total={invoices.data.total} onChange={setPage} />}
    </section>
  </div>;
}
