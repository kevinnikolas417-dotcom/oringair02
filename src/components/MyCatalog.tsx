import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSellerStorefront } from "@/lib/sheets.functions";
import type { Seller } from "@/lib/sellers.functions";
import { brl, toast } from "@/lib/format";
import { publicOrigin } from "@/lib/publicUrl";
import { CategoryChips, useCategoryFilter, useCategoryOrder } from "./CategoryFilter";
import { NoResults, SearchBar, matchSearch, useSearch } from "./SearchBar";

// Seller view: read-only, shows only what the public storefront shows.
export function MyCatalog({ seller }: { seller: Seller }) {
  const fetchStore = useServerFn(getSellerStorefront);
  const q = useQuery({ queryKey: ["my-catalog", seller.slug], queryFn: () => fetchStore({ data: { slug: seller.slug } }) });
  const search = useSearch();
  const cf = useCategoryFilter(q.data?.products ?? [], useCategoryOrder());
  const shown = (q.data?.products ?? []).filter((p) => cf.match(p) && matchSearch(search.value, p.modelo, p.categoria));
  const link = `${publicOrigin()}/vitrine/${seller.slug}`;
  const copy = async () => { await navigator.clipboard.writeText(link); toast("Link copiado!"); };
  const send = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Olá! Separei alguns aparelhos para você. Confira fotos e preços: ${link}`)}`, "_blank");

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[26px] font-semibold tracking-tight">Meu catálogo</h1>
        <p className="mt-1 font-mono text-[11px] text-dim">olá, {seller.nome} · envie seu link aos clientes</p>
      </div>
      <section className="rounded-xl bg-panel2">
        <div className="panel-head">Seu link</div>
        <div className="flex flex-wrap gap-2 p-4">
          <input className="field !w-auto flex-1" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="btn-ghost" onClick={copy}>Copiar link</button>
          <button className="btn-acid" onClick={send}>Enviar por WhatsApp</button>
        </div>
      </section>
      <section className="mt-6 rounded-xl bg-panel2">
        <div className="panel-head">Seus produtos · {q.data?.products.length ?? 0}</div>
        {q.isLoading && <p className="p-6 text-center font-mono text-xs text-dim">Carregando…</p>}
        {q.data && !q.data.products.length && <p className="p-6 text-center font-mono text-xs text-dim">Nenhum produto liberado ainda. Fale com o administrador.</p>}
        {!!q.data?.products.length && <div className="sticky top-0 z-10 bg-panel2 px-4 pt-4 md:static"><SearchBar s={search} /><div className="mt-3"><CategoryChips f={cf} chip={(c, on, click) => <button onClick={click} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ring-1 ${on ? "bg-acid/15 text-acid ring-acid/40" : "text-dim ring-line"}`}>{c}</button>} /></div></div>}
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {!!q.data?.products.length && !shown.length && <NoResults onClear={search.clear} />}
          {shown.map((p) => (
            <div key={p.row} className="flex items-center gap-3 rounded-lg bg-ground p-3 ring-1 ring-line">
              {p.foto ? <img src={p.foto} alt="" className="size-12 rounded object-cover" /> : <span className="size-12 rounded bg-panel ring-1 ring-line" />}
              <div className="min-w-0"><div className="truncate text-sm font-medium">{p.modelo}</div><div className="font-mono text-sm text-acid">{brl(p.venda)}</div></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
