import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { listClients, listProducts } from "@/lib/sheets.functions";
import { Calculator, type Draft } from "@/components/Calculator";
import { Clients } from "@/components/Clients";
import { Catalog } from "@/components/Catalog";
import { Sellers } from "@/components/Sellers";
import { Banners } from "@/components/Banners";
import { MyCatalog } from "@/components/MyCatalog";
import { getMyAccess } from "@/lib/sellers.functions";
import { SellerCalculator } from "@/components/SellerCalculator";
import { Quotes } from "@/components/Quotes";
import { MinPrices } from "@/components/MinPrices";
import { Radar } from "@/components/Radar";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Gestão & Precificação Pro — Painel da loja" },
      { name: "description", content: "Calculadora de preço, clientes e catálogo de celulares sincronizados com Google Sheets." },
      { property: "og:title", content: "Gestão & Precificação Pro" },
      { property: "og:description", content: "Precificação, clientes e estoque da sua loja de celulares em um só painel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Tab = "calc" | "clientes" | "catalogo" | "vendedores" | "meu" | "orcamentos" | "banners" | "radar";

function Index() {
  const fetchProducts = useServerFn(listProducts);
  const fetchClients = useServerFn(listClients);
  const fetchAccess = useServerFn(getMyAccess);
  const access = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });
  const isAdmin = access.data?.role === "admin";
  const products = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts(), retry: 1, staleTime: 60_000, enabled: isAdmin });
  const clients = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients(), retry: 1, staleTime: 60_000, enabled: isAdmin });
  const [tab, setTab] = useState<Tab>("calc");
  const seller = access.data?.seller ?? null;
  const activeTab: Tab = isAdmin ? tab : (["meu", "calc", "orcamentos"] as Tab[]).includes(tab) ? tab : "meu";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<{ p: (typeof p)[number]; n: number } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const h = (e: Event) => { setToastMsg((e as CustomEvent).detail); clearTimeout(t); t = setTimeout(() => setToastMsg(null), 2800); };
    window.addEventListener("app-toast", h);
    return () => window.removeEventListener("app-toast", h);
  }, []);

  const p = products.data ?? [];
  const c = clients.data ?? [];
  const tabs: { id: Tab; label: string; count: string }[] = isAdmin ? [
    { id: "calc", label: "Calculadora", count: "01" },
    { id: "clientes", label: "Clientes", count: String(c.length) },
    { id: "catalogo", label: "Catálogo", count: String(p.length) },
    { id: "vendedores", label: "Vendedores", count: "" },
    { id: "banners", label: "Banners", count: "" },
    { id: "orcamentos", label: "Orçamentos", count: "" },
    { id: "radar", label: "Radar de preços", count: "" },
  ] : seller ? [{ id: "meu", label: "Meu catálogo", count: "" }, { id: "calc", label: "Calculadora", count: "" }, { id: "orcamentos", label: "Orçamentos", count: "" }] : [];

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-acid/10 ring-1 ring-acid/25"><span className="font-mono text-sm font-semibold text-acid">G&amp;P</span></div>
            <div className="leading-none">
              <span className="block text-sm font-semibold tracking-tight">Gestão &amp; Precificação <span className="text-acid">Pro</span></span>
              <span className="mt-1 block font-mono text-[11px] text-dim">loja de celulares · painel admin</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
          {isAdmin && <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] ${products.isError ? "border-destructive/30 text-destructive" : "border-acid/25 bg-acid/5 text-acid"}`}>
            <span className={`size-1.5 rounded-full ${products.isError ? "bg-destructive" : "bg-acid"}`} />
            {products.isError ? "Planilha indisponível" : products.isLoading ? "Conectando…" : `Planilha conectada · ${p.length} produtos`}
          </div>}
            <button onClick={signOut} className="btn-ghost !py-1.5 text-xs">Sair</button>
          </div>
        </div>
      </header>

      <nav className="no-print pt-5">
        <div className="mx-auto flex max-w-[1100px] overflow-x-auto px-5">
          <div className="segmented">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              data-active={activeTab === t.id} className="segment">
              {t.label}{t.count && <span className="text-[11px] tabular-nums opacity-60">{t.count}</span>}
            </button>
          ))}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1100px] px-5 py-7">
        {access.isLoading && <p className="py-16 text-center font-mono text-xs text-dim">Carregando…</p>}
        {access.data && !isAdmin && !seller && <p className="py-16 text-center font-mono text-xs text-dim">Seu acesso ainda não foi liberado ou está desativado. Fale com o administrador.</p>}
        {!isAdmin && seller && activeTab === "meu" && <MyCatalog seller={seller} />}
        {!isAdmin && seller && activeTab === "calc" && <SellerCalculator />}
        {!isAdmin && seller && activeTab === "orcamentos" && <Quotes admin={false} />}
        {isAdmin && tab === "orcamentos" && <Quotes admin />}
        {isAdmin && tab === "radar" && <Radar products={p} onChanged={() => products.refetch()} />}
        {isAdmin && tab === "banners" && <Banners products={p} />}
        {isAdmin && tab === "vendedores" && <><Sellers products={p} /><MinPrices products={p} /></>}
        {isAdmin && tab === "calc" && <Calculator products={p} selected={selected} onSendToCatalog={(d) => { setDraft({ ...d }); setTab("catalogo"); }} />}
        {isAdmin && tab === "clientes" && <Clients clients={c} refreshing={clients.isFetching} onChanged={() => clients.refetch()} />}
        {isAdmin && tab === "catalogo" && <Catalog products={p} draft={draft} loading={products.isLoading} refreshing={products.isFetching} onChanged={() => products.refetch()} onUse={(x) => { setSelected({ p: x, n: Date.now() }); setTab("calc"); }} />}
      </main>

      {toastMsg && (
        <div className="no-print fixed bottom-5 right-5 z-50 rounded-lg bg-panel px-4 py-3 font-mono text-xs text-acid ring-1 ring-acid/30">{toastMsg}</div>
      )}
    </div>
  );
}
