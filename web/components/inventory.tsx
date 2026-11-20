"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, Boxes, List, Pencil, Plus, ReceiptText, Search, Snowflake } from "lucide-react";
import { z } from "zod";
import { api, useAction, useResource } from "@/lib/api";
import { displayDate, inputDate, money, type Movement, type Page, type Product } from "@/lib/domain";
import { Badge, ButtonLink, Empty, Failure, Field, Loading, Notice, Pagination } from "./ui";

const size = 20;
const scheme = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(40),
  category: z.string().trim().max(60).transform(value => value || null),
  description: z.string().max(500),
  price: z.coerce.number().int().min(1).max(100_000_000),
  lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000),
  expiresAt: z.string().transform(value => value || null),
});

type Editor = { kind: "new" } | { kind: "edit" | "stock" | "history"; product: Product };

function ProductEditor({ business, editor, onClose, onSaved }: {
  business: string; editor: Editor; onClose: () => void; onSaved: (text: string) => void;
}) {
  const product = editor.kind === "new" ? undefined : editor.product;
  const action = useAction();
  const history = useResource<Product & { movements: Movement[] }>(editor.kind === "history" ? `/products/${product?.id}` : null, business);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action.run(async () => {
      if (editor.kind === "stock") {
        await api(`/products/${product?.id}/stock`, {
          method: "POST", business, body: { quantity: Number(form.get("quantity")), reason: form.get("reason") },
        });
        onSaved("Stock actualizado.");
        return;
      }
      const parsed = scheme.safeParse(Object.fromEntries(form));
      if (!parsed.success) throw new Error("Revisa el nombre, código, categoría, precio y stock mínimo.");
      await api(product ? `/products/${product.id}` : "/products", {
        method: product ? "PATCH" : "POST", business,
        body: product ? parsed.data : { ...parsed.data, stock: Number(form.get("stock")) },
      });
      onSaved(product ? "Producto actualizado." : "Producto agregado al inventario.");
    });
  }

  const title = editor.kind === "new" ? "Nuevo producto" : editor.kind === "edit" ? "Editar producto" : editor.kind === "stock" ? "Ajustar stock" : "Movimientos";
  return <section className="card stack" id="producto-formulario" aria-label={title}>
    <div className="section-heading"><div><h2>{title}</h2>{product && <p>{product.name} · {product.sku}</p>}</div>
      <button type="button" className="button secondary" onClick={onClose}>Cerrar</button>
    </div>
    {editor.kind === "history" ? <>
      {history.loading && <Loading />}
      {history.error !== undefined && <Failure error={history.error} reload={history.reload} />}
      {history.data && (history.data.movements.length ? <ul className="record-list">
        {history.data.movements.map(item => <li key={item.id}>
          <div><strong>{item.reason}</strong><small>{displayDate(item.createdAt)}</small></div>
          <Badge tone={item.quantity > 0 ? "green" : "amber"}>{item.quantity > 0 ? "+" : ""}{item.quantity}</Badge>
        </li>)}
      </ul> : <Empty>Este producto todavía no tiene movimientos.</Empty>)}
    </> : <form className="stack" onSubmit={submit}>
      {editor.kind === "stock" ? <div className="form-grid">
        <Field label="Cantidad del ajuste"><input name="quantity" type="number" step={1} min={-1_000_000} max={1_000_000} placeholder="Ej. 10 o -3" required /></Field>
        <Field label="Motivo"><input name="reason" maxLength={140} placeholder="Ej. Conteo de inventario" required /></Field>
      </div> : <>
        <div className="form-grid">
          <Field label="Nombre"><input name="name" maxLength={120} defaultValue={product?.name} required /></Field>
          <Field label="SKU"><input name="sku" maxLength={40} defaultValue={product?.sku} required /></Field>
          <Field label="Categoría"><input name="category" maxLength={60} defaultValue={product?.category ?? ""} placeholder="Ej. Herramientas" /></Field>
          <Field label="Precio en CLP"><input name="price" type="number" min={1} max={100_000_000} defaultValue={product?.price} required /></Field>
          <Field label="Stock mínimo"><input name="lowStockThreshold" type="number" min={0} max={1_000_000} defaultValue={product?.lowStockThreshold ?? 5} required /></Field>
          {!product && <Field label="Stock inicial"><input name="stock" type="number" min={0} max={1_000_000} defaultValue={0} required /></Field>}
          <Field label="Vencimiento"><input name="expiresAt" type="date" defaultValue={inputDate(product?.expiresAt)} /></Field>
        </div>
        <Field label="Descripción"><textarea name="description" maxLength={500} rows={3} defaultValue={product?.description} /></Field>
      </>}
      {action.notice && <Notice {...action.notice} />}
      <div><button className="button primary" disabled={action.busy}>{action.busy ? "Guardando…" : "Guardar cambios"}</button></div>
    </form>}
  </section>;
}

export function Inventory({ business, openNew }: { business: string; openNew: boolean }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor | null>(openNew ? { kind: "new" } : null);
  const products = useResource<Page<Product>>(`/products?search=${encodeURIComponent(search)}&page=${page}&limit=${size}`, business);
  const action = useAction();
  const router = useRouter();
  useEffect(() => { if (openNew) setEditor({ kind: "new" }); }, [openNew]);
  useEffect(() => {
    if (editor) document.getElementById("producto-formulario")?.scrollIntoView({ block: "nearest" });
  }, [editor]);
  const close = () => {
    setEditor(null);
    if (openNew) router.replace("/panel/inventario", { scroll: false });
  };
  const saved = (text: string) => { close(); action.setNotice({ text, tone: "success" }); products.reload(); };

  function mutate(product: Product, remove = false) {
    if (remove && !window.confirm(`¿Archivar ${product.name}? Saldrá del inventario activo y de la tienda.`)) return;
    void action.run(async () => {
      await api(`/products/${product.id}${remove ? "" : "/freeze"}`, {
        method: remove ? "DELETE" : "PATCH", business, body: remove ? undefined : { isFrozen: !product.isFrozen },
      });
      if (remove && products.data?.items.length === 1 && page > 1) setPage(page - 1);
      saved(remove ? "Producto archivado." : product.isFrozen ? "Producto descongelado." : "Producto congelado.");
    });
  }

  return <div className="stack">
    <div className="toolbar">
      <label className="search"><Search size={19} aria-hidden="true" /><input aria-label="Buscar por nombre o SKU" placeholder="Buscar por nombre o SKU" value={search} maxLength={120}
        onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <div className="actions">
        <ButtonLink href="/panel/facturas" kind="secondary"><ReceiptText size={17} />Facturas</ButtonLink>
        <button className="button primary" onClick={() => setEditor({ kind: "new" })}><Plus size={17} />Nuevo producto</button>
      </div>
    </div>
    {action.notice && <Notice {...action.notice} />}
    {editor && <ProductEditor key={`${editor.kind}:${editor.kind === "new" ? "" : editor.product.id}`}
      business={business} editor={editor} onClose={close} onSaved={saved} />}
    <section className="card stack">
      <div className="section-heading"><div><h2>Productos</h2>{products.data && <p>{products.data.total} en el inventario activo</p>}</div><Boxes size={23} /></div>
      {products.loading && <Loading />}
      {products.error !== undefined && <Failure error={products.error} reload={products.reload} />}
      {products.data && (products.data.items.length === 0 ? <Empty>{search ? "No hay productos que coincidan con la búsqueda." : "Agrega tu primer producto."}</Empty> : <div className="table-scroll">
        <table><thead><tr><th>Producto</th><th>Precio</th><th>Stock</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{products.data.items.map(product => <tr key={product.id}>
            <td><strong>{product.name}</strong><small>{product.sku}{product.category && ` · ${product.category}`}{product.expiresAt && ` · Vence ${inputDate(product.expiresAt)}`}</small></td>
            <td>{money(product.salePrice)}{product.discountPercent > 0 && <small><del>{money(product.price)}</del> · {product.discountPercent}% dcto.</small>}</td>
            <td>{product.stock}<small>Mín. {product.lowStockThreshold}</small></td>
            <td><div className="actions compact">
              {product.isFrozen && <Badge tone="violet">Congelado</Badge>}
              {product.expired && <Badge tone="amber">Vencido</Badge>}
              {product.expiring && <Badge tone="amber">Por vencer</Badge>}
              {product.lowStock && <Badge tone="amber">Stock bajo</Badge>}
              {!product.isFrozen && !product.expiring && !product.expired && !product.lowStock && <Badge tone="green">Disponible</Badge>}
            </div></td>
            <td><div className="actions compact">
              <button className="icon-button" title="Editar" aria-label={`Editar ${product.name}`} onClick={() => setEditor({ kind: "edit", product })}><Pencil size={16} /></button>
              <button className="icon-button" title="Ajustar stock" aria-label={`Ajustar stock de ${product.name}`} onClick={() => setEditor({ kind: "stock", product })}><Plus size={17} /></button>
              <button className="icon-button" title="Movimientos" aria-label={`Ver movimientos de ${product.name}`} onClick={() => setEditor({ kind: "history", product })}><List size={17} /></button>
              <button className="icon-button" title={product.isFrozen ? "Descongelar" : "Congelar"} aria-label={`${product.isFrozen ? "Descongelar" : "Congelar"} ${product.name}`} disabled={action.busy} onClick={() => mutate(product)}><Snowflake size={16} /></button>
              <button className="icon-button" title="Archivar" aria-label={`Archivar ${product.name}`} disabled={action.busy} onClick={() => mutate(product, true)}><Archive size={16} /></button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>)}
      {products.data && <Pagination page={page} size={size} total={products.data.total} onChange={setPage} />}
    </section>
  </div>;
}
