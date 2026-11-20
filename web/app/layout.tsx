import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Impulso", template: "%s · Impulso" },
  description: "Inventario, ventas y clientes para emprendedores.",
  icons: {
    icon: { url: "/impulso-mascot.png", type: "image/png", sizes: "180x180" },
    apple: { url: "/impulso-mascot.png", sizes: "180x180" },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="es-CL"><body>{children}</body></html>;
}
