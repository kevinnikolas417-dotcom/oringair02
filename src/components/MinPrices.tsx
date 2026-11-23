import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMinPrices, setMinPrice } from "@/lib/quotes.functions";
import type { Product } from "@/lib/sheets.functions";
import { brl, parseNum, toast } from "@/lib/format";

// Admin: minimum price per product used by sellers' calculator and quotes.
export function MinPrices({ products }: { products: Product[] }) {
  const fetchMin = useServerFn(listMinPrices);
  const save = useServerFn(setMinPrice);
  const q = useQuery({ queryKey: ["min-prices"], queryFn: () => fetchMin() });
  const mins = new Map((q.data ?? []).map((x) => [x.row, x.min]));
  const onSave = async (row: number, v: string) => {
    try {
      await save({ data: { row, min: v.trim() ? parseNum(v) : null } });
      toast("Preço mínimo salvo"); q.refetch();
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao salvar"); }
  };
  return (
    <section className="mt-6 rounded-xl bg-panel2">
      <div className="panel-head">Preço mínimo por produto (vendedores) · vazio = usa o preço de venda</div>
      <div className="divide-y divide-line">
        {products.map((p) => (
          <div key={p.row} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{[p.modelo, p.variacao].filter(Boolean).join(" · ")}</span>
            <span className="tabular-nums text-dim">venda {brl(p.venda)}</span>
            <input key={`${p.row}-${mins.get(p.row) ?? ""}`} className="field !w-32" inputMode="decimal" placeholder="mínimo"
              defaultValue={mins.has(p.row) ? String(mins.get(p.row)).replace(".", ",") : ""}
              onBlur={(e) => { const cur = mins.has(p.row) ? String(mins.get(p.row)).replace(".", ",") : ""; if (e.target.value !== cur) onSave(p.row, e.target.value); }} />
          </div>
        ))}
      </div>
    </section>
  );
}
