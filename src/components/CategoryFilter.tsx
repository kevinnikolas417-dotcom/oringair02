import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listCategoryOrder, type CategoryOrder } from "@/lib/categories.functions";

type Item = { categoria: string; categoriaPai: string };

// Saved order first (in saved sequence), then any new categories at the end.
export function applyOrder(found: string[], saved: string[]): string[] {
  if (!saved.length) return found;
  const rank = new Map(saved.map((n, i) => [n.trim().toLowerCase(), i]));
  return [...found].sort((a, b) => {
    const ra = rank.get(a.trim().toLowerCase()), rb = rank.get(b.trim().toLowerCase());
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}

// Shared hook: loads the admin-saved category order (works logged in or on the public storefront).
export function useCategoryOrder() {
  const list = useServerFn(listCategoryOrder);
  const [order, setOrder] = useState<CategoryOrder>({ pai: [], sub: [] });
  useEffect(() => { list().then(setOrder).catch(() => {}); }, [list]);
  return order;
}

// Two-level filter: parent category, then its subcategories (the existing "categoria").
export function useCategoryFilter<T extends Item>(items: T[], order?: CategoryOrder) {
  const [pai, setPai] = useState("");
  const [sub, setSub] = useState("");
  const parents = applyOrder([...new Set(items.map((x) => x.categoriaPai).filter(Boolean))], order?.pai ?? []);
  const inPai = items.filter((x) => !pai || x.categoriaPai === pai);
  const subs = applyOrder([...new Set(inPai.map((x) => x.categoria).filter(Boolean))], order?.sub ?? []);
  const match = (x: T) => (!pai || x.categoriaPai === pai) && (!sub || x.categoria === sub);
  return { pai, sub, parents, subs, match, active: !!(pai || sub), choosePai: (p: string) => { setPai(p); setSub(""); }, setSub };
}

export function CategoryChips({ f, chip }: { f: Omit<ReturnType<typeof useCategoryFilter>, "match">; chip: (label: string, on: boolean, click: () => void) => React.ReactNode }) {
  return (
    <div className="space-y-2">
      {f.parents.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por categoria pai">
          {["", ...f.parents].map((c) => <span key={c || "_all"} className="contents">{chip(c || "Todos", f.pai === c, () => f.choosePai(c))}</span>)}
        </div>
      )}
      {f.subs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por categoria">
          {["", ...f.subs].map((c) => <span key={c || "_all"} className="contents">{chip(c || (f.parents.length ? "Todas" : "Todos"), f.sub === c, () => f.setSub(c))}</span>)}
        </div>
      )}
    </div>
  );
}
