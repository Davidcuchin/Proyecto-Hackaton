"use client";

import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type RequestOptions = { method?: string; body?: unknown; business?: string; signal?: AbortSignal };

export async function api<T>(path: string, { method = "GET", body, business, signal }: RequestOptions = {}): Promise<T> {
  const result = await fetch(`/api/v1${path}`, {
    method, signal, cache: "no-store", credentials: "same-origin",
    headers: { ...(business && { "x-business-id": business }), ...(body !== undefined && { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (result.status === 204) return undefined as T;
  const data = await result.json().catch(() => null);
  if (!result.ok) {
    const detail = data?.fields?.[0];
    const fields: Record<string, string> = { name: "nombre", slug: "URL", sku: "SKU", price: "precio", lowStockThreshold: "stock mínimo", expiresAt: "vencimiento", quantity: "cantidad", stock: "stock", reason: "motivo", items: "productos", number: "número", supplier: "proveedor", issuedOn: "fecha" };
    const label = detail?.field?.split(".").at(-1);
    const explanation = detail && (fields[label] ? ` Campo: ${fields[label]}.` : "");
    throw new ApiError(result.status, `${data?.error ?? "La API no está disponible."}${explanation || ""}`);
  }
  return data as T;
}

type Result<T> = { key: string; data?: T; error?: unknown };
export function useResource<T>(path: string | null, business?: string) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result<T>>();
  const key = `${business ?? ""}:${path ?? ""}`;
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void api<T>(path, { business, signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setResult({ key, data }); },
      error => { if (!controller.signal.aborted) setResult({ key, error }); },
    );
    return () => controller.abort();
  }, [key, path, business, revision]);
  const current = path && result?.key === key ? result : undefined;
  return { data: current?.data, error: current?.error, loading: !!path && !current, reload };
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "error" | "success" }>();
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNotice(undefined);
    try { await action(); }
    catch (error) { setNotice({ text: errorText(error), tone: "error" }); }
    finally { setBusy(false); }
  }
  return { busy, notice, setNotice, run };
}
