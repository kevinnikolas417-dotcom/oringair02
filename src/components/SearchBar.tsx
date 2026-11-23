import { useEffect, useState } from "react";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// Every typed term must appear (partially) in the given text fields.
export const matchSearch = (q: string, ...fields: string[]) => {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = norm(fields.join(" "));
  return terms.every((t) => hay.includes(t));
};

// Debounced (200ms) search input. `value` is the debounced query.
export function useSearch() {
  const [input, setInput] = useState("");
  const [value, setValue] = useState("");
  useEffect(() => { const t = setTimeout(() => setValue(input), 200); return () => clearTimeout(t); }, [input]);
  const clear = () => { setInput(""); setValue(""); };
  return { input, setInput, value, clear };
}

export function SearchBar({ s, className = "" }: { s: ReturnType<typeof useSearch>; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-dim" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="search" value={s.input} onChange={(e) => s.setInput(e.target.value)} placeholder="Buscar produto..." aria-label="Buscar produto"
        className="field !h-11 !rounded-[12px] !pl-10 !pr-10 [&::-webkit-search-cancel-button]:hidden" />
      {s.input && <button type="button" aria-label="Limpar busca" onClick={s.clear} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-dim hover:text-ink">✕</button>}
    </div>
  );
}

export function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="col-span-full grid place-items-center gap-3 py-10 text-center">
      <p className="text-sm text-dim">Nenhum produto encontrado</p>
      <button type="button" className="btn-ghost" onClick={onClear}>Limpar busca</button>
    </div>
  );
}
