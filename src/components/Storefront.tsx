import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicProduct } from "@/lib/sheets.functions";
import { brl, parseNum } from "@/lib/format";
import { fillRates } from "@/lib/rates";
import { applyOrder, useCategoryFilter, useCategoryOrder } from "./CategoryFilter";
import { VitrineHeader, buildCatTree } from "./VitrineChrome";
import { matchSearch, useSearch } from "./SearchBar";

type Sort = "" | "asc" | "desc" | "new";
const SORTS: [Sort, string][] = [["", "Relevância"], ["asc", "Menor preço"], ["desc", "Maior preço"], ["new", "Mais recentes"]];

const Ico = {
  wa: <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z"/></svg>,
  sliders: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>,
  home: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>,
  grid: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>,
  sort: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3"/></svg>,
  search: <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
};

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ground/80 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-panel2 ring-1 ring-line motion-safe:animate-in motion-safe:slide-in-from-bottom-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="tap grid size-11 place-items-center text-xl text-dim">×</button>
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
        {footer && <div className="border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

const chipCls = (on: boolean) => `tap shrink-0 snap-start h-9 rounded-full px-4 text-sm font-medium ${on ? "bg-acid text-white" : "bg-[var(--chip)] text-dim hover:text-ink"}`;

// Public storefront UI: only photo, model, category, color and sale price — never cost/profit/margin/tax.
export const useRates = (t: string) => useMemo(() => Object.entries(fillRates(t)).map(([n, r]) => [Number(n), r] as [number, number]).sort((a, b) => a[0] - b[0]), [t]);

export function Storefront({ products, loading, error, phone, rates: t, seller, slug, initial }: {
  products: PublicProduct[] | undefined; loading: boolean; error: boolean; phone: string; rates: string; seller?: string | undefined;
  slug?: string; initial?: { pai?: string | undefined; sub?: string | undefined; focus?: boolean | undefined };
}) {
  const rates = useRates(t);
  const all = products ?? [];
  const order = useCategoryOrder();
  const cf = useCategoryFilter(all, order);
  const searchRef = useRef<HTMLInputElement>(null);
  const ip = initial?.pai ?? "", is = initial?.sub ?? "";
  useEffect(() => { cf.choosePai(ip); if (is) cf.setSub(is); }, [ip, is]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (initial?.focus) searchRef.current?.focus(); }, [initial?.focus]);
  const cats = useMemo(() => buildCatTree(all, applyOrder([...new Set(all.map((x) => x.categoriaPai).filter(Boolean))], order.pai), (l) => applyOrder(l, order.sub)), [all, order]);
  const search = useSearch();
  const [cores, setCores] = useState<string[]>([]);
  const [pMin, setPMin] = useState("");
  const [pMax, setPMax] = useState("");
  const [sort, setSort] = useState<Sort>("");
  const [sheet, setSheet] = useState<"" | "filters" | "cats" | "sort">("");
  const [detail, setDetail] = useState<PublicProduct | null>(null);
  const [buy, setBuy] = useState<PublicProduct | null>(null);

  const corList = useMemo(() => [...new Set(all.map((x) => x.cor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [all]);
  const bounds = useMemo(() => { const v = all.map((x) => x.venda).filter((n) => n > 0); return v.length ? [Math.floor(Math.min(...v)), Math.ceil(Math.max(...v))] : [0, 0]; }, [all]);
  const lo = pMin.trim() ? parseNum(pMin) : null, hi = pMax.trim() ? parseNum(pMax) : null;
  const filt = (x: PublicProduct, c = cores, l = lo, h = hi) => cf.match(x) && (!c.length || c.includes(x.cor)) && (l == null || x.venda >= l) && (h == null || x.venda <= h) && matchSearch(search.value, x.modelo, x.categoria);
  // One card per model: color variants of the same model are grouped and chosen inside the detail sheet.
  const seen = new Set<string>();
  const list = all.filter((x) => filt(x)).filter((x) => { const k = baseKey(x); if (seen.has(k)) return false; seen.add(k); return true; });
  if (sort === "asc") list.sort((a, b) => a.venda - b.venda);
  else if (sort === "desc") list.sort((a, b) => b.venda - a.venda);
  else if (sort === "new") list.sort((a, b) => b.row - a.row);
  const nFilters = cores.length + (lo != null || hi != null ? 1 : 0);
  const clearFilters = () => { setCores([]); setPMin(""); setPMax(""); };
  const clearAll = () => { search.clear(); clearFilters(); cf.choosePai(""); };
  const name = seller || "Loja";
  const showParents = cf.parents.length > 1;

  return (
    <div className="min-h-screen bg-ground pb-24 text-ink [--chip:#e8e8ed] dark:[--chip:#1c1c1e]">
      <VitrineHeader name={name} slug={slug} phone={phone} cats={cats} onSearch={() => { window.scrollTo({ top: 0 }); searchRef.current?.focus(); }} />
      <div className="sticky top-14 z-20">
        <div className="border-b border-line/60 bg-ground/90 backdrop-blur-xl">
          <div className="mx-auto max-w-[1200px] space-y-2 px-4 py-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-dim">{Ico.search}</span>
                <input ref={searchRef} type="search" value={search.input} onChange={(e) => search.setInput(e.target.value)} placeholder="Buscar produto..." aria-label="Buscar produto"
                  className="field !h-11 !rounded-[12px] !pl-10 !pr-28 [&::-webkit-search-cancel-button]:hidden" />
                <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  {!loading && !error && <span className="text-xs tabular-nums text-dim">{list.length} {list.length === 1 ? "produto" : "produtos"}</span>}
                  {search.input && <button aria-label="Limpar busca" onClick={search.clear} className="tap grid size-8 place-items-center rounded-full text-dim">✕</button>}
                </span>
              </div>
              <button onClick={() => setSheet("filters")} aria-label="Filtros" className={`tap relative grid size-11 shrink-0 place-items-center rounded-[12px] ring-1 ring-line ${nFilters ? "text-acid" : "text-dim"}`}>{Ico.sliders}{nFilters > 0 && <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-acid px-1 text-[10px] font-semibold text-white">{nFilters}</span>}</button>
              <button onClick={() => setSheet("sort")} aria-label="Ordenar" className={`tap grid size-11 shrink-0 place-items-center rounded-[12px] ring-1 ring-line ${sort ? "text-acid" : "text-dim"}`}>{Ico.sort}</button>
            </div>
            {showParents && (
              <div className="flex rounded-[10px] bg-[var(--chip)] p-0.5" role="tablist" aria-label="Categoria">
                {["", ...cf.parents].map((c) => (
                  <button key={c || "_all"} role="tab" aria-selected={cf.pai === c} onClick={() => cf.choosePai(c)}
                    className={`tap h-9 flex-1 truncate rounded-[8px] px-2 text-sm font-medium ${cf.pai === c ? "bg-panel2 text-ink shadow-sm" : "text-dim"}`}>{c || "Todos"}</button>
                ))}
              </div>
            )}
            {cf.subs.length > 1 && (
              <div className="no-scrollbar edge-fade -mx-4 flex snap-x gap-2 overflow-x-auto px-4" aria-label="Subcategorias">
                {["", ...cf.subs].map((c) => <button key={c || "_all"} onClick={() => cf.setSub(c)} className={chipCls(cf.sub === c)}>{c || "Todas"}</button>)}
              </div>
            )}
            {nFilters > 0 && (
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {cores.map((c) => <button key={c} onClick={() => setCores(cores.filter((x) => x !== c))} className="tap h-8 shrink-0 rounded-full bg-acid/15 px-3 text-xs font-medium text-acid">{c} ×</button>)}
                {(lo != null || hi != null) && <button onClick={() => { setPMin(""); setPMax(""); }} className="tap h-8 shrink-0 rounded-full bg-acid/15 px-3 text-xs font-medium text-acid">{lo != null ? brl(lo) : "R$ 0"}–{hi != null ? brl(hi) : "∞"} ×</button>}
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-[1200px] grid-cols-2 gap-3 p-4 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {loading && Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse motion-reduce:animate-none"><div className="aspect-square rounded-2xl bg-[var(--chip)]" /><div className="mt-2 h-4 w-3/4 rounded bg-[var(--chip)]" /><div className="mt-2 h-5 w-1/2 rounded bg-[var(--chip)]" /></div>
        ))}
        {error && <p className="col-span-full py-10 text-center text-sm text-destructive">Não foi possível carregar a vitrine.</p>}
        {!loading && !error && !list.length && (
          <div className="col-span-full grid place-items-center gap-3 py-16 text-center">
            <p className="text-sm text-dim">{all.length ? "Nenhum produto encontrado" : "Nenhum produto aqui."}</p>
            {all.length > 0 && <button className="btn-ghost tap min-h-11" onClick={clearAll}>Limpar filtros</button>}
          </div>
        )}
        {!loading && list.map((x) => <ProductCard key={x.row} x={x} rates={rates} onOpen={setDetail} colors={variantsOf(x, all).length} />)}
      </main>

      {sheet === "sort" && (
        <Sheet title="Ordenar" onClose={() => setSheet("")}>
          <div className="grid gap-2">
            {SORTS.map(([k, l]) => <button key={k} onClick={() => { setSort(k); setSheet(""); }} className={`tap flex min-h-11 items-center justify-between rounded-xl px-4 ring-1 ${sort === k ? "text-acid ring-acid/50" : "ring-line"}`}>{l}{sort === k && <span>✓</span>}</button>)}
          </div>
        </Sheet>
      )}
      {sheet === "cats" && (
        <Sheet title="Categorias" onClose={() => setSheet("")} footer={<button className="btn-acid tap w-full py-3" onClick={() => setSheet("")}>Ver {list.length} produtos</button>}>
          {cf.parents.length > 0 && <>
            <span className="label-mono">Categoria</span>
            <div className="mb-4 mt-2 flex flex-wrap gap-2">{["", ...cf.parents].map((c) => <button key={c || "_"} onClick={() => cf.choosePai(c)} className={chipCls(cf.pai === c)}>{c || "Todos"}</button>)}</div>
          </>}
          <span className="label-mono">Subcategoria</span>
          <div className="mt-2 flex flex-wrap gap-2">{["", ...cf.subs].map((c) => <button key={c || "_"} onClick={() => cf.setSub(c)} className={chipCls(cf.sub === c)}>{c || "Todas"}</button>)}</div>
        </Sheet>
      )}
      {sheet === "filters" && (
        <FilterSheet corList={corList} bounds={bounds as [number, number]} cores={cores} pMin={pMin} pMax={pMax}
          count={(c, l, h) => all.filter((x) => filt(x, c, l, h)).length}
          onApply={(c, a, b) => { setCores(c); setPMin(a); setPMax(b); setSheet(""); }} onClose={() => setSheet("")} />
      )}
      {detail && <DetailSheet product={detail} all={all} rates={rates} onClose={() => setDetail(null)} onBuy={(p) => { setBuy(p); setDetail(null); }} />}
      {buy && <BuySheet product={buy} rates={rates} phone={phone} onClose={() => setBuy(null)} />}
    </div>
  );
}

const baseKey = (x: PublicProduct) => (x.modelo.split(" · ")[0] ?? "").trim().toLowerCase();
export const variantsOf = (x: PublicProduct, all: PublicProduct[]) => all.filter((y) => baseKey(y) === baseKey(x) && y.cor);

export function ProductCard({ x, rates, onOpen, className = "", colors = 0 }: { x: PublicProduct; rates: [number, number][]; onOpen: (p: PublicProduct) => void; className?: string; colors?: number }) {
  const r12 = rates.find(([n]) => n === 12);
  const pc = r12 ? x.venda / (1 - r12[1] / 100) / 12 : null;
  return (
    <button onClick={() => onOpen(x)} className={`tap group rounded-2xl text-left ${className}`}>
      <div className="aspect-square overflow-hidden rounded-2xl bg-panel2">
        {x.foto ? <img src={x.foto} alt={x.modelo} loading="lazy" width={400} height={400} className="size-full object-contain" /> : <div className="grid size-full place-items-center text-xs text-dim">sem foto</div>}
      </div>
      <div className="px-1 pt-2">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{x.modelo}</h3>
        <div className="mt-1 text-[18px] font-semibold tabular-nums">{brl(x.venda)}</div>
        {pc != null && <div className="text-xs tabular-nums text-dim">ou 12x de {brl(pc)}</div>}
        {colors > 1 && <div className="mt-1 text-xs font-medium text-acid">{colors} cores disponíveis</div>}
      </div>
    </button>
  );
}

export function CardSkeleton() {
  return <div className="animate-pulse motion-reduce:animate-none"><div className="aspect-square rounded-2xl bg-[var(--chip)]" /><div className="mt-2 h-4 w-3/4 rounded bg-[var(--chip)]" /><div className="mt-2 h-5 w-1/2 rounded bg-[var(--chip)]" /></div>;
}

// Product detail → existing buy flow. Self-contained so the home page can reuse it.
export function ProductSheets({ product, all, rates, phone, onClose }: { product: PublicProduct | null; all: PublicProduct[]; rates: [number, number][]; phone: string; onClose: () => void }) {
  const [buy, setBuy] = useState<PublicProduct | null>(null);
  return <>
    {product && <DetailSheet product={product} all={all} rates={rates} onClose={onClose} onBuy={(p) => { setBuy(p); onClose(); }} />}
    {buy && <BuySheet product={buy} rates={rates} phone={phone} onClose={() => setBuy(null)} />}
  </>;
}

function DetailSheet({ product, all, rates, onClose, onBuy }: { product: PublicProduct; all: PublicProduct[]; rates: [number, number][]; onClose: () => void; onBuy: (p: PublicProduct) => void }) {
  const [detail, setDetail] = useState(product);
  const vs = variantsOf(product, all);
  return (
    <Sheet title={detail.modelo.split(" · ")[0] ?? detail.modelo} onClose={onClose} footer={<button className="btn-acid tap w-full py-3" onClick={() => onBuy(detail)}>Comprar{detail.cor ? ` · ${detail.cor}` : ""}</button>}>
      <div className="aspect-square overflow-hidden rounded-2xl bg-ground">
        {detail.foto ? <img src={detail.foto} alt={detail.modelo} width={800} height={800} className="size-full object-contain" /> : <div className="grid size-full place-items-center text-xs text-dim">sem foto</div>}
      </div>
      {vs.length > 0 && <>
        <div className="mt-4 text-sm text-dim">Cor: <span className="font-medium text-ink">{detail.cor}</span></div>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
          {vs.map((v) => <button key={v.row} role="radio" aria-checked={v.row === detail.row} onClick={() => setDetail(v)} className={chipCls(v.row === detail.row)}>{v.cor}</button>)}
        </div>
      </>}
      <div className="mt-4 flex items-baseline justify-between"><span className="text-sm text-dim">Pix à vista</span><span className="text-2xl font-semibold tabular-nums">{brl(detail.venda)}</span></div>
      <div className="mt-3 grid gap-1">
        {rates.map(([n, r]) => { const total = detail.venda / (1 - r / 100); return (
          <div key={n} className="flex justify-between rounded-lg px-3 py-2 text-sm tabular-nums odd:bg-ground"><span>{n}x de {brl(total / n)}</span><span className="text-xs text-dim">total {brl(total)}</span></div>
        ); })}
      </div>
    </Sheet>
  );
}

function FilterSheet({ corList, bounds, cores, pMin, pMax, count, onApply, onClose }: {
  corList: string[]; bounds: [number, number]; cores: string[]; pMin: string; pMax: string;
  count: (c: string[], lo: number | null, hi: number | null) => number; onApply: (c: string[], a: string, b: string) => void; onClose: () => void;
}) {
  const [c, setC] = useState(cores);
  const [a, setA] = useState(pMin);
  const [b, setB] = useState(pMax);
  const [mn, mx] = bounds;
  const lo = a.trim() ? parseNum(a) : null, hi = b.trim() ? parseNum(b) : null;
  const vLo = lo ?? mn, vHi = hi ?? mx;
  const step = Math.max(1, Math.round((mx - mn) / 100));
  const n = count(c, lo, hi);
  return (
    <Sheet title="Filtros" onClose={onClose} footer={
      <div className="flex gap-3">
        <button className="btn-ghost tap min-h-11 flex-1" onClick={() => { setC([]); setA(""); setB(""); }}>Limpar</button>
        <button className="btn-acid tap min-h-11 flex-[2]" onClick={() => onApply(c, a, b)}>Ver {n} {n === 1 ? "produto" : "produtos"}</button>
      </div>}>
      {corList.length > 0 && <>
        <span className="label-mono">Cor</span>
        <div className="mb-6 mt-2 flex flex-wrap gap-2">
          {corList.map((x) => { const on = c.includes(x); return <button key={x} aria-pressed={on} onClick={() => setC(on ? c.filter((y) => y !== x) : [...c, x])} className={chipCls(on)}>{x}</button>; })}
        </div>
      </>}
      {mx > mn && <>
        <span className="label-mono">Preço</span>
        <div className="relative mt-4 h-6">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" />
          <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-acid" style={{ left: `${((vLo - mn) / (mx - mn)) * 100}%`, right: `${100 - ((vHi - mn) / (mx - mn)) * 100}%` }} />
          {[["Preço mínimo", vLo, (v: number) => setA(String(Math.min(v, vHi)))], ["Preço máximo", vHi, (v: number) => setB(String(Math.max(v, vLo)))]].map(([l, v, fn]) => (
            <input key={l as string} type="range" aria-label={l as string} min={mn} max={mx} step={step} value={v as number} onChange={(e) => (fn as (v: number) => void)(Number(e.target.value))}
              className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow" />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {([["Mínimo", a, setA, mn], ["Máximo", b, setB, mx]] as const).map(([l, v, set, ph]) => (
            <label key={l} className="grid gap-1 text-xs text-dim">{l}
              <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dim">R$</span>
                <input inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} placeholder={String(ph)} className="field !h-11 w-full !pl-10 tabular-nums" /></div>
            </label>
          ))}
        </div>
      </>}
    </Sheet>
  );
}

function BuySheet({ product, rates, phone, onClose }: { product: PublicProduct; rates: [number, number][]; phone: string; onClose: () => void }) {
  const [method, setMethod] = useState<"pix" | "cartao" | null>(null);
  const [inst, setInst] = useState<number | null>(null);
  // Same formula as the Calculator: total = price / (1 − fee), installment = total / n.
  const cards = rates.map(([n, r]) => { const total = product.venda / (1 - r / 100); return { n, total, parcela: total / n }; });
  const chosen = cards.find((c) => c.n === inst);
  const ready = method === "pix" || (method === "cartao" && chosen);
  const finish = () => {
    const pay = method === "pix"
      ? `Pix à vista: ${brl(product.venda)}`
      : `Cartão de crédito: ${chosen!.n}x de ${brl(chosen!.parcela)} (total ${brl(chosen!.total)})`;
    const msg = `Olá! Quero comprar:\n📱 ${product.modelo}\n💳 ${pay}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ground/80 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-t-2xl bg-panel2 ring-1 ring-line sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line p-4">
          {product.foto ? <img src={product.foto} alt="" className="size-14 rounded-lg object-cover" /> : <div className="size-14 rounded-lg bg-ground ring-1 ring-line" />}
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{product.modelo}</div>
            <div className="font-mono text-sm text-acid">{brl(product.venda)}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="px-2 text-xl text-dim">×</button>
        </div>
        <div className="grid gap-3 p-4">
          <span className="label-mono">Forma de pagamento</span>
          <button onClick={() => { setMethod("pix"); setInst(null); }}
            className={`flex items-center justify-between rounded-lg px-4 py-3 text-left ring-1 ${method === "pix" ? "bg-acid/10 ring-acid/50" : "ring-line"}`}>
            <span className="font-medium">Pix · à vista</span><span className="font-mono text-acid">{brl(product.venda)}</span>
          </button>
          <button onClick={() => setMethod("cartao")}
            className={`rounded-lg px-4 py-3 text-left font-medium ring-1 ${method === "cartao" ? "bg-acid/10 ring-acid/50" : "ring-line"}`}>Cartão de crédito</button>
          {method === "cartao" && (
            <div className="grid gap-2">
              {cards.map((c) => (
                <button key={c.n} onClick={() => setInst(c.n)}
                  className={`flex items-center justify-between rounded-md px-3 py-2 font-mono text-sm ring-1 ${inst === c.n ? "bg-acid/10 text-acid ring-acid/50" : "ring-line"}`}>
                  <span>{c.n}x de {brl(c.parcela)}</span><span className="text-[11px] text-dim">total {brl(c.total)}</span>
                </button>
              ))}
            </div>
          )}
          {!phone && <p className="font-mono text-[11px] text-dim">Este link não tem o WhatsApp da loja. Peça um novo link ao vendedor.</p>}
          <button disabled={!ready || !phone} onClick={finish} className="btn-acid mt-1 w-full py-3">Finalizar pelo WhatsApp</button>
        </div>
      </div>
    </div>
  );
}
