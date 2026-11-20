"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, Boxes, ChartNoAxesCombined, UsersRound } from "lucide-react";
import { api, useAction, useResource } from "@/lib/api";
import type { Me } from "@/lib/domain";
import { Brand, ButtonLink, Field, Notice } from "./ui";
import styles from "./login-design.module.css";

export function Login({ store }: { store?: string }) {
  const config = useResource<{ demo: boolean }>("/auth/config");
  const session = useResource<Me>("/auth/me");
  const action = useAction();
  const [registering, setRegistering] = useState(false);
  const storePath = store ? `/tienda/${store}` : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    void action.run(async () => {
      if (registering) {
        const name = String(fields.get("name") ?? "").trim();
        await api("/auth/register", { method: "POST", body: { name, email, password } });
        setRegistering(false);
      }
      const result = await signIn("credentials", { email, password, redirect: false, redirectTo: storePath ?? "/panel" });
      if (result?.error === "CredentialsSignin") throw new Error("Correo o contraseña incorrectos. Revisa los datos o intenta más tarde.");
      if (!result || !result.ok || result.error) throw new Error("El acceso no está disponible en este momento.");
      const { user } = await api<Me>("/auth/me");
      window.location.assign(storePath ?? (user.id === "demo-buyer" ? "/tienda/mercado-demo" : "/panel"));
    });
  }

  return <div className={styles.raiz}>
    <a className={styles.skip} href="#acceso">Saltar al acceso</a>
    <header><div className={`${styles.wrap} ${styles.nav}`}><Brand /></div></header>
    <main className={`${styles.wrap} ${styles.main}`}>
      <div className={styles.hero}>
        <section className={styles["hero-copy"]}>
          <h1>Tu negocio,<em>en un solo lugar.</em></h1>
          <p>Gestiona tu inventario, revisa tus ventas y mantén el contacto con tus clientes.</p>
          <ul className={styles.features} aria-label="Funciones de Impulso">
            <li><Boxes size={16} aria-hidden="true" /> Inventario</li>
            <li><ChartNoAxesCombined size={16} aria-hidden="true" /> Ventas</li>
            <li><UsersRound size={16} aria-hidden="true" /> Clientes</li>
          </ul>
        </section>
        <div className={styles.scene}>
          <div className={styles.stage}>
            <section id="acceso" className={`stack ${styles.formCard}`} tabIndex={-1} aria-label="Acceso a Impulso">
              {action.notice && <Notice {...action.notice} />}
              {session.data ? <div>
                <ButtonLink href={storePath ?? (session.data.user.id === "demo-buyer" ? "/tienda/mercado-demo" : "/panel")}>
                  {storePath || session.data.user.id === "demo-buyer" ? "Ir a la tienda" : "Abrir mi panel"} <ArrowRight size={18} />
                </ButtonLink>
              </div> : <>
                <form className="stack" onSubmit={submit}>
                  <h2>{registering ? "Crear cuenta" : "Iniciar sesión"}</h2>
                  {registering && <Field label="Nombre"><input name="name" autoComplete="name" minLength={2} maxLength={120} required /></Field>}
                  <Field label="Correo electrónico"><input name="email" type="email" autoComplete="email" maxLength={254} required /></Field>
                  <Field label={registering ? "Contraseña (mínimo 12 caracteres)" : "Contraseña"}>
                    <input name="password" type="password" autoComplete={registering ? "new-password" : "current-password"}
                      minLength={registering ? 12 : undefined} maxLength={128} required />
                  </Field>
                  <div className="actions">
                    <button className="button primary" disabled={action.busy}>
                      {action.busy ? "Cargando…" : registering ? "Crear cuenta" : "Entrar"} <ArrowRight size={18} />
                    </button>
                    <button className="button secondary" type="button" disabled={action.busy} onClick={() => {
                      setRegistering(!registering); action.setNotice(undefined);
                    }}>{registering ? "Ya tengo una cuenta" : "Crear cuenta"}</button>
                  </div>
                </form>
                {config.data?.demo && !registering && <p className={styles.hint}>Puedes acceder con las cuentas de ejemplo indicadas en el README.</p>}
              </>}
            </section>
          </div>
        </div>
      </div>
    </main>
  </div>;
}
