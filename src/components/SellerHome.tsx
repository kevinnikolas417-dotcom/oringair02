import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Banner, PublicProduct } from "@/lib/sheets.functions";
import { applyOrder, useCategoryOrder } from "./CategoryFilter";
import { CardSkeleton, ProductCard, ProductSheets, useRates } from "./Storefront";
import { TRUST_ITEMS, VitrineHeader, WaIcon, buildCatTree, initials } from "./VitrineChrome";

type Data = { nome: string; whatsapp: string; rates: string; products: PublicProduct[]; banners: Banner[] } | undefined;


const PhoneIco = () => <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>;

export function SellerHome({ slug, data, loading, error }: { slug: string; data: Data; loading: boolean; error: boolean }) {
  const navigate = useNavigate();
  const all = data?.products ?? [];
  const rates = useRates(data?.rates ?? "");
  const order = useCategoryOrder();
  const [open, setOpen] = useState<PublicProduct | null>(null);
  const name = data?.nome || "Vendedor";
  const phone = data?.whatsapp ?? "";
  const parents = useMemo(() => applyOrder([...new Set(all.map((x) => x.categoriaPai).filter(Boolean))], order.pai), [all, order]);
  const subs = useMemo(() => applyOrder([...new Set(all.map((x) => x.categoria).filter(Boolean))], order.sub), [all, order]);
  const cats = useMemo(() => buildCatTree(all, parents, (l) => applyOrder(l, order.sub)), [all, parents, order]);
  const shortcuts = parents.length > 1 ? parents.map((p) => ({ label: p, search: { pai: p } })) : subs.map((s) => ({ label: s, search: { sub: s } }));
  const recent = [...all].sort((a, b) => b.row - a.row);
  const featured = all.filter((x) => x.destaque);
  const destaques = featured.length ? featured : recent.slice(0, 6);
  const novidades = recent.filter((x) => x.disponivel).slice(0, 8);
  const banners = data?.banners ?? [];

  const bannerClick = (b: Banner) => {
    if (b.link_tipo === "categoria" && b.link_valor) {
      const v = b.link_valor;
      navigate({ to: "/vitrine/$slug/produtos", params: { slug }, search: parents.includes(v) ? { pai: v } : { sub: v } });
    } else if (b.link_tipo === "produto") {
      const p = all.find((x) => String(x.row) === b.link_valor.trim()); if (p) setOpen(p);
    } else if (b.link_tipo === "url" && /^https?:\/\//.test(b.link_valor)) window.open(b.link_valor, "_blank", "noopener");
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between px-4">
        <h2 className="text-[20px] font-semibold">{title}</h2>
        <Link to="/vitrine/$slug/produtos" params={{ slug }} className="tap flex min-h-11 items-center text-sm font-medium text-acid">Ver todos</Link>
      </div>
      {children}
    </section>
  );

  return (
    <div className="min-h-screen bg-ground pb-24 text-ink [--chip:#e8e8ed] dark:[--chip:#1c1c1e]">
      <VitrineHeader name={name} slug={slug} phone={phone} cats={cats}
        onSearch={() => navigate({ to: "/vitrine/$slug/produtos", params: { slug }, search: { busca: true } })} />
      <main className="mx-auto max-w-[1200px] pt-4">
        {error && <p className="py-10 text-center text-sm text-destructive">Não foi possível carregar a vitrine.</p>}
        {loading ? <div className="px-4"><div className="aspect-video w-full animate-pulse rounded-[20px] bg-[var(--chip)] md:max-h-[440px]" /></div> : banners.length > 0 && <div className="px-4"><Carousel banners={banners} onClick={bannerClick} /></div>}

        {shortcuts.length > 0 && (
          <div className="no-scrollbar edge-fade mt-6 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4" aria-label="Categorias">
            {shortcuts.map((c) => (
              <Link key={c.label} to="/vitrine/$slug/produtos" params={{ slug }} search={c.search} className="tap flex w-[72px] shrink-0 snap-start flex-col items-center gap-1.5 text-center">
                <span className="grid size-16 place-items-center rounded-full bg-panel2 text-acid"><PhoneIco /></span>
                <span className="line-clamp-2 text-xs font-medium">{c.label}</span>
              </Link>
            ))}
          </div>
        )}

        <Section title="Destaques">
          <div className="grid grid-cols-2 gap-3 px-4 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {loading ? Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />) : destaques.map((x) => <ProductCard key={x.row} x={x} rates={rates} onOpen={setOpen} />)}
          </div>
        </Section>

        {(loading || novidades.length > 0) && (
          <Section title="Novidades">
            <div className="no-scrollbar flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 md:gap-4">
              {loading ? Array.from({ length: 4 }, (_, i) => <div key={i} className="w-[44%] shrink-0 md:w-[23%]"><CardSkeleton /></div>)
                : novidades.map((x) => <ProductCard key={x.row} x={x} rates={rates} onOpen={setOpen} className="w-[44%] shrink-0 snap-start md:w-[23%]" />)}
            </div>
          </Section>
        )}

        <section className="mx-4 mt-10 grid gap-3 rounded-[20px] bg-panel2 p-4 sm:grid-cols-3" aria-label="Por que comprar aqui">
          {TRUST_ITEMS.map((t) => (
            <div key={t} className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-acid/15 text-acid" aria-hidden>✓</span>
              <span className="text-sm font-medium">{t}</span>
            </div>
          ))}
        </section>

        <section className="mx-4 mt-6 flex flex-col items-center gap-3 rounded-[20px] bg-panel2 p-6 text-center">
          <h2 className="text-[20px] font-semibold">Fale com o vendedor</h2>
          <span className="grid size-16 place-items-center rounded-full bg-acid text-xl font-semibold text-white">{initials(name)}</span>
          <span className="font-medium">{name}</span>
          {phone && <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="btn-acid tap flex min-h-11 items-center gap-2 !rounded-full px-6"><WaIcon /> Chamar no WhatsApp</a>}
        </section>
      </main>
      <ProductSheets product={open} all={all} rates={rates} phone={phone} onClose={() => setOpen(null)} />
    </div>
  );
}

export function Carousel({ banners, onClick }: { banners: Banner[]; onClick: (b: Banner) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || banners.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      const el = ref.current; if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % banners.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 5000);
    return () => clearInterval(t);
  }, [paused, banners.length]);
  return (
    <div className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)} onTouchEnd={() => setTimeout(() => setPaused(false), 4000)}>
      <div ref={ref} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-[20px]" aria-roledescription="carrossel" aria-label="Banners">
        {banners.map((b, n) => {
          const clickable = b.link_tipo !== "nenhum" && !!b.link_valor;
          return (
            <button key={b.id} onClick={() => clickable && onClick(b)} tabIndex={clickable ? 0 : -1} aria-label={b.titulo || `Banner ${n + 1}`}
              className={`relative aspect-video w-full shrink-0 snap-center overflow-hidden text-left md:max-h-[440px] ${clickable ? "" : "cursor-default"}`}>
              {b.imagem_url
                ? <img src={b.imagem_url} alt={b.titulo} width={1600} height={900} loading={n === 0 ? "eager" : "lazy"} className="size-full object-cover object-center" />
                : <div className="size-full bg-gradient-to-br from-acid/35 via-panel2 to-panel2" />}
              {(b.titulo || b.subtitulo) && (
                <div className={`absolute inset-0 flex flex-col justify-end p-5 md:p-8 ${b.imagem_url ? "bg-gradient-to-t from-black/60 to-transparent text-white" : ""}`}>
                  {b.titulo && <span className="text-2xl font-semibold tracking-tight md:text-4xl">{b.titulo}</span>}
                  {b.subtitulo && <span className={`mt-1 text-sm md:text-base ${b.imagem_url ? "opacity-85" : "text-dim"}`}>{b.subtitulo}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {banners.length > 1 && (
        <div className="absolute bottom-3 right-4 flex gap-1.5" aria-hidden>
          {banners.map((b, n) => <span key={b.id} className={`h-1.5 rounded-full transition-all duration-200 ${n === i ? "w-4 bg-ink" : "w-1.5 bg-ink/35"}`} />)}
        </div>
      )}
    </div>
  );
}
