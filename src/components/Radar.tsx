import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Product } from "@/lib/sheets.functions";
import { analyzeProduct, applySuggestedPrices, getRadar, saveRadarSettings } from "@/lib/radar.functions";
import { analyze, type RadarSettings, type RadarStatus } from "@/lib/radar";
import { brl, pct, parseNum, toast } from "@/lib/format";
import { ALL_INSTS, DEFAULT_RATES, fillRates } from "@/lib/rates";

const STATUSES: RadarStatus[] = ["Competitivo", "Acima do mercado", "Oportunidade de subir", "Mercado abaixo do meu piso", "Sem dados"];
const tone: Record<RadarStatus, string> = {
  "Competitivo": "text-success bg-success/10", "Acima do mercado": "text-acid bg-acid/10",
  "Oportunidade de subir": "text-success bg-success/10 ring-1 ring-success/30", "Mercado abaixo do meu piso": "text-destructive bg-destructive/10", "Sem dados": "text-dim bg-ground",
};
const DAY = 864e5;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ground/80 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-panel p-5 ring-1 ring-line sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2><button className="btn-ghost !py-1 text-xs" onClick={onClose}>Fechar</button></div>
        {children}
      </div>
    </div>
  );
}

export function Radar({ products, onChanged }: { products: Product[]; onChanged: () => void }) {
  const fetchRadar = useServerFn(getRadar);
  const runOne = useServerFn(analyzeProduct);
  const apply = useServerFn(applySuggestedPrices);
  const saveSettings = useServerFn(saveRadarSettings);
  const q = useQuery({ queryKey: ["radar"], queryFn: () => fetchRadar() });
  const [rates, setRates] = useState(DEFAULT_RATES);
  useEffect(() => { try { const r = localStorage.getItem("taxas-cartao"); if (r) setRates(fillRates(JSON.parse(r))); } catch { /* ignore */ } }, []);

  const [busca, setBusca] = useState(""), [cat, setCat] = useState(""), [st, setSt] = useState<string>("");
  const [ordem, setOrdem] = useState<"diff" | "nome">("diff");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<number | null>(null);
  const [confirmRun, setConfirmRun] = useState<number[] | null>(null);
  const [confirmApply, setConfirmApply] = useState<{ row: number; nome: string; antes: number; depois: number }[] | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [showCfg, setShowCfg] = useState(false);

  const settings = q.data?.settings;
  const results = useMemo(() => new Map((q.data?.results ?? []).map((r) => [r.product_row, r])), [q.data]);
  const rows = useMemo(() => !settings ? [] : products.map((p) => {
    const r = results.get(p.row);
    return { p, r, a: analyze(r?.ofertas ?? [], p.venda, p.custo, settings) };
  }), [products, results, settings]);
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, rows.filter((x) => x.a.status === s).length])), [rows]);
  const cats = useMemo(() => [...new Set(products.map((p) => p.categoriaPai || p.categoria).filter(Boolean))].sort(), [products]);
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const list = rows.filter(({ p, a }) => (!cat || (p.categoriaPai || p.categoria) === cat) && (!st || a.status === st) && (!busca || norm(`${p.modelo} ${p.categoria}`).includes(norm(busca))))
    .sort((x, y) => ordem === "nome" ? x.p.modelo.localeCompare(y.p.modelo) : Math.abs(y.a.diffPct) - Math.abs(x.a.diffPct));

  const fresh = (row: number) => { const r = results.get(row); return !!r && Date.now() - new Date(r.analyzed_at).getTime() < DAY; };
  const askRun = (ids: number[]) => {
    if (!q.data?.temChave) { toast("Configure a chave da busca de preços primeiro"); return; }
    const todo = ids.filter((id) => !fresh(id));
    if (!todo.length) { toast("Já atualizados nas últimas 24 h"); return; }
    setConfirmRun(todo.slice(0, settings?.limite ?? 20));
  };
  const doRun = async (ids: number[]) => {
    setConfirmRun(null);
    let ok = 0;
    for (const [i, row] of ids.entries()) {
      setRunning(`Consultando ${i + 1} de ${ids.length}…`);
      try { await runOne({ data: { row } }); ok++; }
      catch (e) { toast(e instanceof Error ? e.message : "Falha na consulta"); if (/Créditos|Chave/.test(String(e))) break; }
    }
    setRunning(null); await q.refetch(); toast(`${ok} produto(s) analisado(s)`);
  };
  const askApply = (ids: number[]) => {
    const items = rows.filter((x) => ids.includes(x.p.row) && x.a.sugerido > 0 && x.a.sugerido !== x.p.venda)
      .map((x) => ({ row: x.p.row, nome: [x.p.modelo, x.p.variacao].filter(Boolean).join(" · "), antes: x.p.venda, depois: x.a.sugerido }));
    if (!items.length) { toast("Nenhum preço sugerido diferente do atual"); return; }
    setConfirmApply(items);
  };
  const doApply = async () => {
    if (!confirmApply) return;
    try { await apply({ data: { itens: confirmApply.map((x) => ({ row: x.row, venda: x.depois })) } }); toast("Preços aplicados"); setConfirmApply(null); setSel(new Set()); onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : "Falha ao aplicar"); }
  };

  if (q.isLoading || !settings) return <p className="py-16 text-center font-mono text-xs text-dim">Carregando radar…</p>;
  if (q.isError) return <p className="py-16 text-center text-sm text-destructive">{String(q.error)}</p>;
  const d = detail != null ? rows.find((x) => x.p.row === detail) : null;
  const toggle = (row: number) => setSel((s) => { const n = new Set(s); if (n.has(row)) n.delete(row); else n.add(row); return n; });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Radar de preços</h1>
          <p className="mt-1 font-mono text-[11px] text-dim">Google Shopping Brasil · {q.data?.usoMes ?? 0} consultas neste mês · limite {settings.limite} por execução</p>
        </div>
        <button className="btn-ghost text-xs" onClick={() => setShowCfg(true)}>Configurações do radar</button>
      </div>
      {!q.data!.temChave && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">A chave da busca de preços (SerpApi) ainda não está configurada.</p>}
      {running && <p className="mb-4 rounded-xl bg-acid/10 p-3 font-mono text-xs text-acid">{running}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setSt(st === s ? "" : s)} className={`rounded-xl p-3 text-left ring-1 ${st === s ? "ring-acid" : "ring-line"} bg-panel2`}>
            <span className="block text-2xl font-semibold tabular-nums">{counts[s]}</span>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${tone[s]}`}>{s}</span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input className="field !w-auto flex-1" placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="field !w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas as categorias</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="field !w-auto" value={st} onChange={(e) => setSt(e.target.value)}><option value="">Todos os status</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="field !w-auto" value={ordem} onChange={(e) => setOrdem(e.target.value as "diff")}><option value="diff">Maior diferença</option><option value="nome">Nome</option></select>
      </div>
      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-dim">{sel.size} selecionado(s)</span>
          <button className="btn-ghost text-xs" disabled={!!running} onClick={() => askRun([...sel])}>Atualizar selecionados</button>
          <button className="btn-acid text-xs" onClick={() => askApply([...sel])}>Aplicar preço sugerido</button>
          <button className="btn-ghost text-xs" onClick={() => setSel(new Set())}>Limpar seleção</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl bg-panel2 ring-1 ring-line">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left font-mono text-[11px] text-dim"><tr className="border-b border-line">
            <th className="p-3"><input type="checkbox" checked={list.length > 0 && list.every((x) => sel.has(x.p.row))} onChange={(e) => setSel(e.target.checked ? new Set(list.map((x) => x.p.row)) : new Set())} /></th>
            <th className="p-3">Produto</th><th className="p-3">Meu preço</th><th className="p-3">Menor</th><th className="p-3">Mediana</th><th className="p-3">Dif. %</th><th className="p-3">Status</th><th className="p-3">Sugerido</th><th className="p-3">Ação</th>
          </tr></thead>
          <tbody>
            {list.map(({ p, r, a }) => (
              <tr key={p.row} className="cursor-pointer border-b border-line/60 hover:bg-ground/50" onClick={() => setDetail(p.row)}>
                <td className="p-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(p.row)} onChange={() => toggle(p.row)} /></td>
                <td className="p-3"><span className="font-medium">{p.modelo}</span>{p.variacao && <span className="text-dim"> · {p.variacao}</span>}
                  <span className="block font-mono text-[10px] text-dim">{r ? `atualizado ${new Date(r.analyzed_at).toLocaleString("pt-BR")}` : "nunca analisado"}</span></td>
                <td className="p-3 tabular-nums">{brl(p.venda)}</td>
                <td className="p-3 tabular-nums">{a.n ? brl(a.menor) : "—"}</td>
                <td className="p-3 tabular-nums">{a.n ? brl(a.mediana) : "—"}</td>
                <td className={`p-3 tabular-nums ${a.diff > 0 ? "text-destructive" : "text-success"}`}>{a.n ? `${a.diffPct > 0 ? "+" : ""}${pct(a.diffPct)}` : "—"}</td>
                <td className="p-3"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${tone[a.status]}`}>{a.status}</span></td>
                <td className="p-3 tabular-nums">{a.n ? brl(a.sugerido) : "—"}</td>
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <button className="btn-ghost !px-2 !py-1 text-[11px]" disabled={!!running} onClick={() => askRun([p.row])}>Atualizar</button>
                    {a.n > 0 && a.sugerido !== p.venda && <button className="btn-acid !px-2 !py-1 text-[11px]" onClick={() => askApply([p.row])}>Aplicar</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={9} className="p-8 text-center text-dim">Nenhum produto encontrado</td></tr>}
          </tbody>
        </table>
      </div>

      {d && (() => {
        const hist = (q.data!.snapshots).filter((s) => s.product_row === d.p.row).map((s) => ({ data: new Date(s.created_at).toLocaleDateString("pt-BR"), Mediana: s.mediana, "Meu preço": s.meu_preco }));
        const a = d.a;
        return (
          <Modal title={[d.p.modelo, d.p.variacao].filter(Boolean).join(" · ")} onClose={() => setDetail(null)}>
            <div className="mb-3"><span className={`rounded-full px-2 py-0.5 text-[11px] ${tone[a.status]}`}>{a.status}</span>{d.r && <span className="ml-2 font-mono text-[11px] text-dim">busca: "{d.r.consulta}"</span>}</div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[["Ofertas válidas", String(a.n)], ["Menor", brl(a.menor)], ["Mediana", brl(a.mediana)], ["Maior", brl(a.maior)], ["Faixa P25–P75", `${brl(a.p25)} – ${brl(a.p75)}`], ["Meu preço (Pix)", brl(d.p.venda)],
                ["Diferença", a.n ? `${brl(a.diff)} (${pct(a.diffPct)})` : "—"], ["Posição", a.n ? `${a.posicao}º mais barato de ${a.n + 1}` : "—"], ["Piso", brl(a.piso)], ["Sugerido", a.n ? brl(a.sugerido) : "—"], ["Lucro no sugerido", a.n ? brl(a.lucro) : "—"]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-ground p-2"><span className="label-mono">{k}</span><span className="block font-medium tabular-nums">{v}</span></div>
              ))}
            </div>
            {a.n > 0 && <div className="mt-3 grid grid-cols-3 gap-1 font-mono text-[11px] text-dim sm:grid-cols-4">
              {ALL_INSTS.map((n) => { const t = a.sugerido / (1 - (rates[n as number] ?? 0) / 100); return <span key={n}>{n}x {brl(t / n)}</span>; })}
            </div>}
            <h3 className="mt-5 mb-2 text-sm font-semibold">Histórico (90 dias)</h3>
            {hist.length ? <div className="h-48"><ResponsiveContainer><LineChart data={hist}><CartesianGrid strokeOpacity={0.15} /><XAxis dataKey="data" fontSize={10} /><YAxis fontSize={10} width={60} /><Tooltip formatter={(v: number) => brl(v)} /><Legend /><Line dataKey="Mediana" stroke="var(--color-acid)" /><Line dataKey="Meu preço" stroke="var(--color-success)" /></LineChart></ResponsiveContainer></div>
              : <p className="text-xs text-dim">Sem histórico ainda.</p>}
            <h3 className="mt-5 mb-2 text-sm font-semibold">Ofertas usadas</h3>
            <ul className="grid gap-1 text-sm">
              {(d.r?.ofertas ?? []).map((o, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-ground p-2">
                  <span className="min-w-0"><span className="font-medium">{o.loja || "Loja"}</span>{o.suspeito && <span className="ml-1 rounded bg-destructive/10 px-1 text-[10px] text-destructive">suspeito</span>}<span className="block truncate text-[11px] text-dim">{o.titulo}</span></span>
                  <span className="flex shrink-0 items-center gap-2"><span className="tabular-nums">{brl(o.preco)}</span>{o.link && /^https?:\/\//i.test(o.link) && <a className="text-xs text-acid underline" href={o.link} target="_blank" rel="noopener noreferrer">abrir</a>}</span>
                </li>
              ))}
              {!d.r?.ofertas.length && <li className="text-xs text-dim">Nenhuma oferta válida.</li>}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn-ghost text-xs" disabled={!!running} onClick={() => askRun([d.p.row])}>Atualizar este produto</button>
              {a.n > 0 && a.sugerido !== d.p.venda && <button className="btn-acid text-xs" onClick={() => askApply([d.p.row])}>Aplicar preço sugerido</button>}
            </div>
          </Modal>
        );
      })()}

      {confirmRun && (
        <Modal title="Atualizar radar" onClose={() => setConfirmRun(null)}>
          <p className="text-sm">Isso fará <b>{confirmRun.length}</b> consulta(s).{confirmRun.length === settings.limite && " (limite por execução atingido)"} Produtos atualizados nas últimas 24 h foram pulados.</p>
          <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost text-xs" onClick={() => setConfirmRun(null)}>Cancelar</button><button className="btn-acid text-xs" onClick={() => doRun(confirmRun)}>Consultar</button></div>
        </Modal>
      )}
      {confirmApply && (
        <Modal title="Aplicar preço sugerido" onClose={() => setConfirmApply(null)}>
          <ul className="grid gap-1 text-sm">{confirmApply.map((x) => <li key={x.row} className="flex justify-between gap-2 rounded-lg bg-ground p-2"><span className="truncate">{x.nome}</span><span className="shrink-0 tabular-nums"><span className="text-dim line-through">{brl(x.antes)}</span> → <b>{brl(x.depois)}</b></span></li>)}</ul>
          <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost text-xs" onClick={() => setConfirmApply(null)}>Cancelar</button><button className="btn-acid text-xs" onClick={doApply}>Aplicar {confirmApply.length}</button></div>
        </Modal>
      )}
      {showCfg && <Settings initial={settings} onClose={() => setShowCfg(false)} onSave={async (s) => { await saveSettings({ data: s }); await q.refetch(); setShowCfg(false); toast("Configurações salvas"); }} />}
    </>
  );
}

function Settings({ initial, onClose, onSave }: { initial: RadarSettings; onClose: () => void; onSave: (s: RadarSettings) => Promise<void> }) {
  const [f, setF] = useState(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v).replace(".", ",")])) as Record<keyof RadarSettings, string>);
  const set = (k: keyof RadarSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => onSave({ estrategia: f.estrategia as RadarSettings["estrategia"], delta_menor: parseNum(f.delta_menor), lucro_min: parseNum(f.lucro_min), imposto: parseNum(f.imposto), frete: parseNum(f.frete), folga: parseNum(f.folga), limite: Math.max(1, Math.round(parseNum(f.limite))) }).catch((e) => toast(String(e)));
  return (
    <Modal title="Configurações do radar" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="label-mono">Estratégia do preço sugerido</span>
          <select className="field" value={f.estrategia} onChange={set("estrategia")}><option value="mediana">Igualar mediana</option><option value="abaixo5">5% abaixo da mediana</option><option value="menor">Menor preço + R$ X</option></select></label>
        {f.estrategia === "menor" && <label><span className="label-mono">X (R$)</span><input className="field" inputMode="decimal" value={f.delta_menor} onChange={set("delta_menor")} /></label>}
        <label><span className="label-mono">Lucro mínimo R$</span><input className="field" inputMode="decimal" value={f.lucro_min} onChange={set("lucro_min")} /></label>
        <label><span className="label-mono">Imposto %</span><input className="field" inputMode="decimal" value={f.imposto} onChange={set("imposto")} /></label>
        <label><span className="label-mono">Frete R$</span><input className="field" inputMode="decimal" value={f.frete} onChange={set("frete")} /></label>
        <label><span className="label-mono">Folga p/ "subir" (% abaixo da mediana)</span><input className="field" inputMode="decimal" value={f.folga} onChange={set("folga")} /></label>
        <label><span className="label-mono">Limite de consultas por execução</span><input className="field" inputMode="numeric" value={f.limite} onChange={set("limite")} /></label>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost text-xs" onClick={onClose}>Cancelar</button><button className="btn-acid text-xs" onClick={save}>Salvar</button></div>
    </Modal>
  );
}
