import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

// Editable storefront copy.
export const TRUST_ITEMS = ["Lacrado e com garantia", "Pix ou até 12x", "Atendimento direto no WhatsApp"];
export const HOW_TO_BUY = ["Escolha o aparelho e toque em Comprar.", "Selecione Pix ou cartão em até 12x.", "Finalize pelo WhatsApp com o vendedor."];

export const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "L";

export const WaIcon = ({ className = "size-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z" /></svg>
);

export type CatTree = { pai: string; subs: string[] }[];

export function VitrineHeader({ name, slug, phone, cats, onSearch }: { name: string; slug?: string | undefined; phone: string; cats: CatTree; onSearch: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-30 h-14 border-b border-line/60 bg-ground/75 backdrop-blur-xl">
        <div className="mx-auto grid h-full max-w-[1200px] grid-cols-[44px_1fr_44px] items-center gap-2 px-2">
          <button onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open} aria-controls="vitrine-drawer" className="tap grid size-11 place-items-center rounded-full text-ink">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <span className="truncate text-center font-semibold">{name}</span>
          <button onClick={onSearch} aria-label="Buscar produto" className="tap grid size-11 place-items-center rounded-full text-ink">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </button>
        </div>
      </header>
      <Drawer open={open} onClose={() => setOpen(false)} name={name} slug={slug} phone={phone} cats={cats} />
      {phone && (
        <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp"
          className="tap fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 grid size-12 place-items-center rounded-full bg-acid text-white shadow-lg">
          <WaIcon />
        </a>
      )}
    </>
  );
}

function Drawer({ open, onClose, name, slug, phone, cats }: { open: boolean; onClose: () => void; name: string; slug?: string | undefined; phone: string; cats: CatTree }) {
  const ref = useRef<HTMLDivElement>(null);
  const [acc, setAcc] = useState<"" | "cats" | "pay" | "how">("");
  const [openPai, setOpenPai] = useState("");
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>("a[href],button:not([disabled])") ?? [])];
    focusables()[0]?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const f = focusables(); if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [open, onClose]);

  const item = "tap flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left font-medium hover:bg-ground";
  const go = (label: string, search?: { pai?: string; sub?: string }) => slug
    ? <Link to="/vitrine/$slug/produtos" params={{ slug }} search={search ?? {}} onClick={onClose} className={item}>{label}</Link>
    : <button onClick={onClose} className={item}>{label}</button>;
  const chev = (on: boolean) => <span aria-hidden className={`text-dim transition-transform duration-200 ${on ? "rotate-90" : ""}`}>›</span>;

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none invisible delay-200"} transition-[visibility]`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-ground/70 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none ${open ? "opacity-100" : "opacity-0"}`} />
      <div id="vitrine-drawer" ref={ref} role="dialog" aria-modal="true" aria-label="Menu"
        className={`absolute inset-y-0 left-0 flex w-[85%] max-w-[360px] flex-col bg-panel2 shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-14 items-center justify-between border-b border-line px-3">
          <span className="font-semibold">Menu</span>
          <button onClick={onClose} aria-label="Fechar menu" className="tap grid size-11 place-items-center text-xl text-dim">×</button>
        </div>
        <nav className="flex-1 space-y-1 overflow-auto p-3">
          {slug ? <Link to="/vitrine/$slug" params={{ slug }} onClick={onClose} className={item}>Início</Link> : <button onClick={() => { window.scrollTo({ top: 0 }); onClose(); }} className={item}>Início</button>}
          {go("Todos os produtos")}
          {cats.length > 0 && <>
            <button className={item} aria-expanded={acc === "cats"} onClick={() => setAcc(acc === "cats" ? "" : "cats")}>Categorias {chev(acc === "cats")}</button>
            {acc === "cats" && <div className="space-y-1 pl-3">
              {cats.map((c) => c.subs.length && c.pai ? (
                <div key={c.pai}>
                  <button className={`${item} text-sm`} aria-expanded={openPai === c.pai} onClick={() => setOpenPai(openPai === c.pai ? "" : c.pai)}>{c.pai} {chev(openPai === c.pai)}</button>
                  {openPai === c.pai && <div className="pl-3 text-sm text-dim">{go(`Tudo em ${c.pai}`, { pai: c.pai })}{c.subs.map((s) => <div key={s}>{go(s, { pai: c.pai, sub: s })}</div>)}</div>}
                </div>
              ) : c.pai ? <div key={c.pai} className="text-sm">{go(c.pai, { pai: c.pai })}</div>
                : c.subs.map((s) => <div key={s} className="text-sm">{go(s, { sub: s })}</div>))}
            </div>}
          </>}
          <button className={item} aria-expanded={acc === "pay"} onClick={() => setAcc(acc === "pay" ? "" : "pay")}>Formas de pagamento {chev(acc === "pay")}</button>
          {acc === "pay" && <div className="space-y-2 px-3 pb-2 text-sm text-dim"><p><b className="text-ink">Pix à vista:</b> pague o preço anunciado, sem acréscimo.</p><p><b className="text-ink">Cartão de crédito:</b> parcele em até 12x; o valor de cada parcela aparece no produto.</p></div>}
          <button className={item} aria-expanded={acc === "how"} onClick={() => setAcc(acc === "how" ? "" : "how")}>Como comprar {chev(acc === "how")}</button>
          {acc === "how" && <ol className="list-decimal space-y-1 pb-2 pl-8 pr-3 text-sm text-dim">{HOW_TO_BUY.map((s) => <li key={s}>{s}</li>)}</ol>}
          {phone && <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="btn-acid tap mt-4 flex min-h-11 items-center justify-center gap-2 !rounded-full"><WaIcon /> Falar no WhatsApp</a>}
        </nav>
        <div className="flex items-center gap-3 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <span className="grid size-9 place-items-center rounded-full bg-acid text-sm font-semibold text-white">{initials(name)}</span>
          <span className="truncate text-sm font-medium">{name}</span>
        </div>
      </div>
    </div>
  );
}

export function buildCatTree(items: { categoria: string; categoriaPai: string }[], parents: string[], subsOrder: (list: string[]) => string[]): CatTree {
  const pais = parents.length ? parents : [""];
  return pais.map((p) => ({ pai: p, subs: subsOrder([...new Set(items.filter((x) => !p || x.categoriaPai === p).map((x) => x.categoria).filter(Boolean))]) }));
}
