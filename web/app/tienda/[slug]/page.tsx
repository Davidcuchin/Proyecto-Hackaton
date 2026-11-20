import type { Metadata } from "next";
import { Store } from "@/components/store";

export const metadata: Metadata = { title: "Tienda" };

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Store key={slug} slug={slug} />;
}
