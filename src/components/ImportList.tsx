import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listProductAliases, parseSupplierList, saveImportMetadata } from "@/lib/import.functions";
import { findProductImages, saveLibraryImage } from "@/lib/images.functions";
import { uploadPhoto } from "./Catalog";
import { Camera } from "lucide-react";
import { saveProduct, type Product } from "@/lib/sheets.functions";
import {
  buildAliasKey,
  matchImportedItem,
  mergeImportedVariants,
  mergeVariacaoLabel,
  normalizeProductText,
  type MatchType,
} from "@/lib/product-matching";
import { brl, parseNum, toast } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Cfg = { acrescimo: string; lucroMin: string; imposto: string; frete: string; porCategoria: string };
const defaults: Cfg = { acrescimo: "0", lucroMin: "500", imposto: "1,5", frete: "20", porCategoria: "Acessórios: 80" };
type Row = {
  on: boolean;
  nome: string;
  cores: string;
  rawNome: string;
  rawCores: string;
  custo: string;
  venda: string;
  categoria: string;
  subcategoria: string;
  status: "Novo" | "Atualizar" | "Atenção";
  match?: Product | undefined;
  matchType: MatchType;
  ref: string;
  url: string;
  img: "buscando" | "ok" | "sem";
};

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const DEFAULT_PROFIT = 300; // Calculator's default fixed profit

const MATCH_LABEL: Record<MatchType, string> = {
  alias: "Memória",
  exact: "Exato",
  variant: "Modelo/Cor",
  fuzzy: "Aproximado",
  none: "",
};

// Same formula as the Calculator: custo → imposto → frete → lucro; rounded up to R$ 10.
export function priceFor(custo: number, categoria: string, c: Cfg) {
  const base = custo * (1 + parseNum(c.acrescimo) / 100);
  const total = base + base * (parseNum(c.imposto) / 100) + parseNum(c.frete);
  const cat = new Map(c.porCategoria.split(/[\n;]/).map((l) => l.split(":")).filter((p) => p.length === 2).map(([k, v]) => [norm(k!), parseNum(v!.trim())]));
  const min = cat.get(norm(categoria)) ?? Math.max(parseNum(c.lucroMin), DEFAULT_PROFIT);
  return { total, venda: Math.ceil((total + min) / 10) * 10 };
}

export function ImportList({ open, onClose, products, onDone }: { open: boolean; onClose: () => void; products: Product[]; onDone: () => void }) {
  const parse = useServerFn(parseSupplierList);
  const loadAliases = useServerFn(listProductAliases);
  const saveMeta = useServerFn(saveImportMetadata);
  const save = useServerFn(saveProduct);
  const findImgs = useServerFn(findProductImages);
  const saveLib = useServerFn(saveLibraryImage);
  const [texto, setTexto] = useState("");
  const [cfg, setCfg] = useState<Cfg>(defaults);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [markOff, setMarkOff] = useState(false);
  const [summary, setSummary] = useState("");
  useEffect(() => { try { const s = localStorage.getItem("import-config"); if (s) setCfg({ ...defaults, ...JSON.parse(s) }); } catch { /* ignore */ } }, []);
  const setC = (k: keyof Cfg) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCfg((s) => { const n = { ...s, [k]: e.target.value }; localStorage.setItem("import-config", JSON.stringify(n)); return n; });
  const reset = () => { setTexto(""); setRows(null); setSummary(""); setMarkOff(false); };
  const close = () => { if (busy) return; reset(); onClose(); };

  const analyze = async () => {
    if (texto.trim().length < 5) { toast("Cole a lista do fornecedor"); return; }
    setBusy(true);
    try {
      const [itens, aliases] = await Promise.all([
        parse({ data: {
          texto,
          categorias: [...new Set(products.map((p) => p.categoriaPai).filter(Boolean))],
          subcategorias: [...new Set(products.map((p) => p.categoria).filter(Boolean))],
          modelosExistentes: [...new Set(products.map((p) => p.modelo).filter(Boolean))],
        } }),
        loadAliases().catch(() => []),
      ]);
      const built: Row[] = itens.map((x) => {
        const res = matchImportedItem(x, products, aliases);
        const match = res.product;
        return {
          on: true,
          nome: x.nome,
          cores: x.cores,
          rawNome: x.nome,
          rawCores: x.cores,
          custo: String(x.custo).replace(".", ","),
          venda: String(priceFor(x.custo, match?.categoriaPai || x.categoria, cfg).venda),
          categoria: match?.categoriaPai || x.categoria,
          subcategoria: match?.categoria || x.subcategoria,
          match,
          matchType: res.matchType,
          status: x.incerto ? "Atenção" : match ? "Atualizar" : "Novo",
          ref: match?.fotoRef ?? "",
          url: match?.foto ?? "",
          img: match?.foto ? "ok" : "buscando",
        };
      });
      setRows(built);
      // Photo lookup runs in the background; a failure only marks "Sem imagem".
      const need = built.map((r, i) => ({ r, i })).filter(({ r }) => r.img === "buscando");
      if (need.length) findImgs({ data: { items: need.map(({ r }) => ({ nome: r.nome, cores: r.cores })) } })
        .then((found) => setRows((rs) => rs && rs.map((r, i) => { const k = need.findIndex((n) => n.i === i); if (k < 0 || r.img !== "buscando") return r; const f = found[k]; return f ? { ...r, ref: f.ref, url: f.url, img: "ok" } : { ...r, img: "sem" }; })))
        .catch(() => setRows((rs) => rs && rs.map((r) => (r.img === "buscando" ? { ...r, img: "sem" } : r))));
      setTexto(""); // the original message is discarded after analysis
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao analisar"); }
    finally { setBusy(false); }
  };

  const edit = (i: number, k: keyof Row, v: string | boolean) => setRows((rs) => rs!.map((r, j) => {
    if (j !== i) return r;
    const n = { ...r, [k]: v };
    if (k === "custo" || k === "categoria") n.venda = String(priceFor(parseNum(n.custo), n.categoria, cfg).venda);
    return n;
  }));

  const linkProduct = (i: number, rowValue: string) => setRows((rs) => rs!.map((r, j) => {
    if (j !== i) return r;
    if (!rowValue) {
      return {
        ...r,
        match: undefined,
        matchType: "none",
        status: r.status === "Atenção" ? "Atenção" : "Novo",
      };
    }
    const target = products.find((p) => p.row === Number(rowValue));
    if (!target) return r;
    const nextCat = target.categoriaPai || r.categoria;
    return {
      ...r,
      match: target,
      matchType: "alias",
      status: r.status === "Atenção" ? "Atenção" : "Atualizar",
      categoria: nextCat,
      subcategoria: target.categoria || r.subcategoria,
      venda: String(priceFor(parseNum(r.custo), nextCat, cfg).venda),
      ref: target.fotoRef || r.ref,
      url: target.foto || r.url,
      img: target.foto ? "ok" : r.img,
    };
  }));

  const swap = async (i: number, file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    edit(i, "img", "buscando");
    try {
      const up = await uploadPhoto(file);
      const r = rows![i]!;
      setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, ref: up.ref, url: up.preview, img: "ok" } : x)));
      saveLib({ data: { nome: r.nome, cores: r.cores, ref: up.ref } }).catch(() => { /* library is optional */ });
    } catch (e) { toast(e instanceof Error ? e.message : "Erro na foto"); edit(i, "img", "sem"); }
  };

  const runImport = async () => {
    const sel = rows!.filter((r) => r.on);
    if (!sel.length) { toast("Selecione ao menos um item"); return; }
    setBusy(true);
    let novos = 0, atual = 0, off = 0;
    const liveProducts = new Map<number, Product>(products.map((p) => [p.row, p]));
    const updatedRows = new Set<number>();
    const aliasesToSave: { aliasKey: string; productRow: number; rawNome: string; rawCores: string }[] = [];
    const historyToSave: { productRow: number; custoAnterior: number; custoNovo: number; vendaAnterior: number; vendaNovo: number }[] = [];

    try {
      for (const r of sel) {
        const custo = parseNum(r.custo), venda = parseNum(r.venda);
        const lucro = Math.round(Math.max(0, venda - priceFor(custo, r.categoria, cfg).total) * 100) / 100;
        const m = r.match ? (liveProducts.get(r.match.row) ?? r.match) : undefined;

        if (m) {
          const mergedVariants = mergeImportedVariants(m.variants ?? [], r.cores, custo, lucro, venda);
          const mergedVariacao = mergeVariacaoLabel(m.variacao, r.cores);
          const nextEstoque = m.estoque > 0 ? m.estoque : 1;
          await save({ data: {
            row: m.row,
            modelo: m.modelo,
            variacao: mergedVariacao,
            custo,
            venda,
            estoque: nextEstoque,
            foto: m.fotoRef || r.ref,
            lucroTipo: "fixo",
            lucro,
            categoria: m.categoria,
            categoriaPai: m.categoriaPai,
            fromImport: true,
            previousCusto: m.custo,
            previousVenda: m.venda,
            ...(mergedVariants ? { variants: mergedVariants } : {}),
          } });

          liveProducts.set(m.row, {
            ...m,
            variacao: mergedVariacao,
            custo,
            venda,
            estoque: nextEstoque,
            fotoRef: m.fotoRef || r.ref,
            lucro,
            variants: mergedVariants ?? m.variants,
          });
          if (!updatedRows.has(m.row)) {
            updatedRows.add(m.row);
            atual++;
          }
          historyToSave.push({
            productRow: m.row,
            custoAnterior: m.custo,
            custoNovo: custo,
            vendaAnterior: m.venda,
            vendaNovo: venda,
          });
          const key = buildAliasKey(r.rawNome, r.rawCores);
          if (key) aliasesToSave.push({ aliasKey: key, productRow: m.row, rawNome: r.rawNome, rawCores: r.rawCores });
          const rawSqlKey = normalizeProductText([r.rawNome, r.rawCores].filter(Boolean).join(" "));
          if (rawSqlKey && rawSqlKey !== key) {
            aliasesToSave.push({ aliasKey: rawSqlKey, productRow: m.row, rawNome: r.rawNome, rawCores: r.rawCores });
          }
        } else {
          const initialVariants = mergeImportedVariants([], r.cores, custo, lucro, venda);
          const saved = await save({ data: {
            modelo: r.nome.trim(),
            variacao: r.cores.trim(),
            custo,
            venda,
            estoque: 1,
            foto: r.ref,
            lucroTipo: "fixo",
            lucro,
            categoria: r.subcategoria.trim(),
            categoriaPai: r.categoria.trim(),
            fromImport: true,
            ...(initialVariants ? { variants: initialVariants } : {}),
          } });
          novos++;
          const newRow = saved && typeof saved === "object" && "row" in saved ? Number((saved as { row?: number }).row) : undefined;
          if (newRow && newRow >= 2) {
            const key = buildAliasKey(r.rawNome, r.rawCores);
            if (key) aliasesToSave.push({ aliasKey: key, productRow: newRow, rawNome: r.rawNome, rawCores: r.rawCores });
          }
        }
      }

      if (aliasesToSave.length || historyToSave.length) {
        await saveMeta({ data: { aliases: aliasesToSave, history: historyToSave } }).catch(() => { /* optional metadata */ });
      }

      if (markOff) {
        const kept = new Set(sel.map((r) => r.match?.row).filter(Boolean));
        for (const p of products) if (!kept.has(p.row) && p.estoque > 0) {
          await save({ data: { row: p.row, modelo: p.modelo, variacao: p.variacao, custo: p.custo, venda: p.venda, estoque: 0, foto: p.fotoRef, lucroTipo: p.lucroTipo, lucro: p.lucro, categoria: p.categoria, categoriaPai: p.categoriaPai } });
          off++;
        }
      }
      setSummary(`${novos} novos, ${atual} atualizados, ${rows!.length - sel.length} ignorados${markOff ? `, ${off} marcados como indisponíveis` : ""}.`);
      setRows(null); onDone();
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao importar"); }
    finally { setBusy(false); }
  };

  const matchedCount = rows ? rows.filter((r) => r.match).length : 0;
  const newCount = rows ? rows.length - matchedCount : 0;
  const cell = "h-9 w-full min-w-0 rounded-lg bg-ground px-2 text-sm outline-none focus:ring-2 focus:ring-acid/40";
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent aria-describedby={undefined} className="max-h-[92dvh] max-w-[1200px] overflow-y-auto rounded-2xl border-0 bg-panel p-5 sm:p-6">
        <DialogTitle className="text-xl">Importar lista do fornecedor</DialogTitle>
        {summary ? (
          <div className="grid gap-4">
            <p className="rounded-xl bg-ground p-4 text-sm">Importação concluída: {summary}</p>
            <div className="flex gap-2"><Button onClick={reset} variant="secondary" className="h-11 rounded-xl">Importar outra lista</Button><Button onClick={close} className="h-11 rounded-xl">Fechar</Button></div>
          </div>
        ) : !rows ? (
          <div className="grid gap-4">
            <label><span className="label-mono">Mensagem do fornecedor (WhatsApp)</span>
              <textarea className="field min-h-[260px] py-3 font-mono text-xs" placeholder="Cole aqui a lista do fornecedor…" value={texto} onChange={(e) => setTexto(e.target.value)} disabled={busy} /></label>
            <div className="grid gap-3 sm:grid-cols-4">
              <label><span className="label-mono">Acréscimo sobre o custo (%)</span><input className="field" inputMode="decimal" value={cfg.acrescimo} onChange={setC("acrescimo")} /></label>
              <label><span className="label-mono">Lucro mínimo (R$)</span><input className="field" inputMode="decimal" value={cfg.lucroMin} onChange={setC("lucroMin")} /></label>
              <label><span className="label-mono">Imposto %</span><input className="field" inputMode="decimal" value={cfg.imposto} onChange={setC("imposto")} /></label>
              <label><span className="label-mono">Frete (R$)</span><input className="field" inputMode="decimal" value={cfg.frete} onChange={setC("frete")} /></label>
            </div>
            <label><span className="label-mono">Lucro mínimo por categoria (uma por linha, ex.: "Acessórios: 80") — prevalece sobre o padrão</span>
              <textarea className="field min-h-[70px] py-2 text-sm" value={cfg.porCategoria} onChange={setC("porCategoria")} /></label>
            <Button onClick={analyze} disabled={busy} className="h-11 rounded-xl">{busy ? "Analisando…" : "Analisar lista"}</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm text-dim">
              {rows.length} itens encontrados ({matchedCount} reconhecidos para atualizar, {newCount} novos). Revise, ajuste vínculos ou edite antes de importar.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm">
                <thead><tr className="text-left text-xs text-dim">
                  <th className="p-1"><input type="checkbox" aria-label="Selecionar todos" checked={rows.every((r) => r.on)} onChange={(e) => setRows(rows.map((r) => ({ ...r, on: e.target.checked })))} /></th>
                  <th className="p-1">Foto</th><th className="p-1">Produto / Vínculo no banco</th><th className="p-1">Cores</th><th className="p-1 w-28">Custo</th><th className="p-1 w-28">Venda</th><th className="p-1 w-24">Lucro</th><th className="p-1">Categoria</th><th className="p-1">Subcategoria</th><th className="p-1">Status</th>
                </tr></thead>
                <tbody>{rows.map((r, i) => {
                  const custoNum = parseNum(r.custo);
                  const vendaNum = parseNum(r.venda);
                  const lucro = vendaNum - priceFor(custoNum, r.categoria, cfg).total;
                  const custoDiff = r.match && r.match.custo !== custoNum;
                  const vendaDiff = r.match && r.match.venda !== vendaNum;
                  return (
                    <tr key={i} className="align-middle">
                      <td className="p-1"><input type="checkbox" aria-label={`Selecionar ${r.nome}`} checked={r.on} onChange={(e) => edit(i, "on", e.target.checked)} /></td>
                      <td className="p-1"><div className="flex items-center gap-1.5">
                        <div className="grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded-md bg-ground text-[9px] leading-tight text-dim">
                          {r.img === "ok" && r.url ? <img src={r.url} alt={r.nome} className="size-full object-cover" /> : r.img === "buscando" ? "Buscando…" : <span className="grid justify-items-center gap-0.5 text-center"><Camera className="size-3.5" />Sem imagem</span>}
                        </div>
                        <div className="grid gap-1">
                          <label className="cursor-pointer rounded-md bg-ground px-2 py-1 text-[11px]">Trocar<input type="file" accept="image/*" className="hidden" aria-label={`Trocar foto de ${r.nome}`} onChange={(e) => { swap(i, e.target.files?.[0]); e.target.value = ""; }} /></label>
                          {r.img === "ok" && <button type="button" className="rounded-md bg-ground px-2 py-1 text-[11px] text-destructive" onClick={() => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, ref: "", url: "", img: "sem" } : x)))}>Remover</button>}
                        </div>
                      </div></td>
                      <td className="p-1">
                        <div className="grid gap-1">
                          <input className={cell} value={r.nome} onChange={(e) => edit(i, "nome", e.target.value)} disabled={!!r.match} />
                          {products.length > 0 && (
                            <select
                              aria-label={`Vincular ${r.nome}`}
                              className="h-7 w-full min-w-0 rounded-md bg-ground/70 px-1.5 text-[11px] text-dim outline-none focus:ring-1 focus:ring-acid/40"
                              value={r.match ? String(r.match.row) : ""}
                              onChange={(e) => linkProduct(i, e.target.value)}
                            >
                              <option value="">+ Criar como novo produto</option>
                              {products.map((p) => (
                                <option key={p.row} value={String(p.row)}>
                                  Atualizar: {p.modelo}{p.variacao ? ` (${p.variacao})` : ""}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="p-1"><input className={cell} value={r.cores} onChange={(e) => edit(i, "cores", e.target.value)} /></td>
                      <td className="p-1">
                        <input className={cell} inputMode="decimal" value={r.custo} onChange={(e) => edit(i, "custo", e.target.value)} />
                        {custoDiff && <div className="mt-0.5 text-[10px] text-dim">Antes: {brl(r.match!.custo)}</div>}
                      </td>
                      <td className="p-1">
                        <input className={cell} inputMode="decimal" value={r.venda} onChange={(e) => edit(i, "venda", e.target.value)} />
                        {vendaDiff && <div className="mt-0.5 text-[10px] text-dim">Antes: {brl(r.match!.venda)}</div>}
                      </td>
                      <td className="p-1 tabular-nums text-success">{brl(lucro)}</td>
                      <td className="p-1"><input className={cell} value={r.categoria} onChange={(e) => edit(i, "categoria", e.target.value)} disabled={!!r.match} /></td>
                      <td className="p-1"><input className={cell} value={r.subcategoria} onChange={(e) => edit(i, "subcategoria", e.target.value)} disabled={!!r.match} /></td>
                      <td className="p-1">
                        <div className="grid justify-items-start gap-0.5">
                          <span className={`rounded-full px-2 py-1 text-xs ${r.status === "Atenção" ? "bg-destructive/10 text-destructive" : r.status === "Atualizar" ? "bg-acid/10 text-acid" : "bg-success/10 text-success"}`}>{r.status}</span>
                          {r.match && MATCH_LABEL[r.matchType] && (
                            <span className="px-1 text-[10px] text-dim">{MATCH_LABEL[r.matchType]}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={markOff} onChange={(e) => setMarkOff(e.target.checked)} />Marcar como indisponível os produtos que não vieram nesta lista</label>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setRows(null)} disabled={busy} className="h-11 rounded-xl">Voltar</Button>
              <Button onClick={runImport} disabled={busy} className="h-11 rounded-xl">{busy ? "Importando…" : `Importar selecionados (${rows.filter((r) => r.on).length})`}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
