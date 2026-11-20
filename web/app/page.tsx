import { Login } from "@/components/login";

export default async function Home({ searchParams }: { searchParams: Promise<{ tienda?: string }> }) {
  const { tienda } = await searchParams;
  const store = typeof tienda === "string" && tienda.length >= 3 && tienda.length <= 40 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tienda)
    ? tienda
    : undefined;
  return <Login store={store} />;
}
