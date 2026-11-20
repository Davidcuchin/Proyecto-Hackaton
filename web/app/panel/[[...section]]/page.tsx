import type { Metadata } from "next";
import { Panel } from "@/components/panel";

export const metadata: Metadata = { title: "Panel" };

export default async function PanelPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  return <Panel section={section ?? []} />;
}
