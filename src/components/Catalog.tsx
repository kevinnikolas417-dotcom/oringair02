import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, ArrowUpDown, Calculator as CalculatorIcon, Camera, Check, ClipboardList, ChevronLeft, ChevronRight, Copy, ImagePlus, MoreHorizontal, Pencil, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { deleteProduct, saveProduct, type Product } from "@/lib/sheets.functions";
import { listCategoryOrder, saveCategoryOrder, type CategoryOrder } from "@/lib/categories.functions";
import { supabase } from "@/integrations/supabase/client";
import { brl, pct, parseNum, toast } from "@/lib/format";
import { serializeRates } from "@/lib/rates";
import { publicOrigin } from "@/lib/publicUrl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { Draft } from "./Calculator";
import { ImportList } from "./ImportList";
import { CategoryChips, useCategoryFilter } from "./CategoryFilter";
import { NoResults, SearchBar, matchSearch, useSearch } from "./SearchBar";

const blank = { modelo: "", variacao: "", custo: "", venda: "", estoque: "1", foto: "", fotoRef: "", lucroTipo: "fixo" as "fixo" | "margem", lucro: "", categoria: "", categoriaPai: "", destaque: false };
const decimal = (n: number) => String(n).replace(".", ",");
const pageSize = 20;
const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
type VRow = { cor: string; corHex: string; custo: string; lucro: string; preco: string; manual: boolean; disponivel: boolean; imagem: string | null };
// Same formula as the Calculator (default imposto 1,5% and frete R$ 20): total = custo + imposto + frete; fixo → total + lucro, margem → total / (1 − m).
const autoPrice = (custo: string, lucro: string, tipo: "fixo" | "margem") => {
  const total = parseNum(custo) * 1.015 + 20, l = parseNum(lucro);
  const v = tipo === "fixo" ? total + l : l < 100 ? total / (1 - l / 100) : 0;
  return decimal(Math.round(v * 100) / 100);
};
const dupKey = (p: { modelo: string; variacao: string }) => `${norm(p.modelo)}|${norm(p.variacao)}`;

// Photos go to private Cloud storage at the display ratio 4:5, 1080x1350, high quality.
export async function uploadPhoto(file: File): Promise<{ ref: string; preview: string }> {
  const img = await createImageBitmap(file);
  let blob: Blob | null;
  try {
    const ratio = 4 / 5;
    let sw = img.width, sh = img.height;
    if (sw / sh > ratio) sw = sh * ratio; else sh = sw / ratio;
    const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1350;
    const context = c.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto");
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.drawImage(img, sx, sy, sw, sh, 0, 0, 1080, 1350);
    blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.9));
    if (!blob || blob.type !== "image/webp") blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
  } finally { img.close(); }
  if (!blob) throw new Error("Não foi possível preparar a foto");
  const path = `${crypto.randomUUID()}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
  const { error } = await supabase.storage.from("product-photos").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw new Error(`Erro ao enviar foto: ${error.message}`);
  return { ref: `sb:${path}`, preview: URL.createObjectURL(blob) };
}

export function Catalog({ products, draft, onChanged, refreshing, loading = false, onUse }: {
  products: Product[]; draft: Draft | null; onChanged: () => void; refreshing: boolean; loading?: boolean; onUse: (p: Product) => void;
}) {
  const save = useServerFn(saveProduct);
  const del = useServerFn(deleteProduct);
  const [removing, setRemoving] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [f, setF] = useState(blank);
  const [vars, setVars] = useState<VRow[]>([]);
  const setVar = (i: number, patch: Partial<VRow>) => setVars((l) => l.map((v, j) => { if (j !== i) return v; const n = { ...v, ...patch }; if (!("preco" in patch) && ("custo" in patch || "lucro" in patch) && !n.manual) n.preco = autoPrice(n.custo, n.lucro, f.lucroTipo); return n; }));
  const addVar = () => setVars((l) => [...l, { cor: "", corHex: "#d1d5db", custo: f.custo, lucro: f.lucro, preco: f.venda || autoPrice(f.custo, f.lucro, f.lucroTipo), manual: !!f.venda, disponivel: true, imagem: null }]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [share, setShare] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupSel, setDupSel] = useState<Set<number>>(new Set());
  const [dupDeleting, setDupDeleting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [zap, setZap] = useState("");
  const listOrder = useServerFn(listCategoryOrder);
  const saveOrder = useServerFn(saveCategoryOrder);
  const [catOrder, setCatOrder] = useState<CategoryOrder>({ pai: [], sub: [] });
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderTab, setOrderTab] = useState<"pai" | "sub">("pai");
  const [orderList, setOrderList] = useState<string[]>([]);
  const [orderSaving, setOrderSaving] = useState(false);
  const reloadOrder = () => listOrder().then(setCatOrder).catch(() => {});
  useEffect(() => { reloadOrder(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cf = useCategoryFilter(products, catOrder);
  const [page, setPage] = useState(1);
  const search = useSearch();
  useEffect(() => { setZap(localStorage.getItem("whatsapp-loja") ?? ""); }, []);
  useEffect(() => {
    if (draft) {
      setEditing(null);
      setF((s) => ({ ...s, modelo: draft.modelo, custo: decimal(draft.custo), venda: decimal(draft.venda), lucroTipo: draft.lucroTipo, lucro: decimal(draft.lucro) }));
      setVars([]);
      setFormOpen(true);
    }
  }, [draft]);
  useEffect(() => { setPage(1); }, [search.value, cf.pai, cf.sub]);
  const toggle = (row: number) => setSel((s) => { const n = new Set(s); if (n.has(row)) n.delete(row); else n.add(row); return n; });
  const rates = () => { try { return serializeRates(JSON.parse(localStorage.getItem("taxas-cartao") ?? "null")); } catch { return serializeRates(null); } };
  const link = () => `${publicOrigin()}/vitrine?p=${[...sel].join(",")}&t=${rates()}${zap.replace(/\D/g, "") ? `&w=${zap.replace(/\D/g, "")}` : ""}`;
  const saveZap = (v: string) => { setZap(v); localStorage.setItem("whatsapp-loja", v); };
  const copyLink = async () => { try { await navigator.clipboard.writeText(link()); toast("Link copiado!"); } catch { toast("Não foi possível copiar o link"); } };
  const sendZap = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Olá! Separei alguns aparelhos para você. Confira fotos e preços: ${link()}`)}`, "_blank");
  const openProduct = (p: Product, duplicate = false) => {
    setEditing(duplicate ? null : p);
    setF({ modelo: p.modelo, variacao: p.variacao, custo: decimal(p.custo), venda: decimal(p.venda), estoque: String(p.estoque), foto: p.foto, fotoRef: p.fotoRef, lucroTipo: p.lucroTipo, lucro: p.lucro ? decimal(p.lucro) : "", categoria: p.categoria, categoriaPai: p.categoriaPai, destaque: p.destaque });
    setVars(p.variants.map((v) => ({ cor: v.cor, corHex: v.corHex, custo: decimal(v.custo), lucro: v.lucro ? decimal(v.lucro) : "", preco: decimal(v.preco), manual: true, disponivel: v.disponivel, imagem: v.imagem })));
    setFormOpen(true);
  };
  const newProduct = () => { setEditing(null); setF(blank); setVars([]); setFormOpen(true); };
  const confirmDelete = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await del({ data: { row: removing.row } });
      toast("Produto excluído!");
      setRemoving(null); setSel((s) => { const n = new Set(s); n.delete(removing.row); return n; }); onChanged();
    } catch (err) { toast(err instanceof Error ? err.message : "Erro ao excluir"); }
    finally { setDeleting(false); }
  };
  const dupGroups = (() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const k = dupKey(p);
      const g = map.get(k);
      if (g) g.push(p); else map.set(k, [p]);
    }
    return [...map.values()].filter((g) => g.length > 1);
  })();
  const dupCount = dupGroups.reduce((n, g) => n + g.length - 1, 0);
  const openDups = () => {
    // Keep the first copy of each group, mark the rest for deletion.
    setDupSel(new Set(dupGroups.flatMap((g) => g.slice(1).map((p) => p.row))));
    setDupOpen(true);
  };
  const confirmDups = async () => {
    if (!dupSel.size) return;
    setDupDeleting(true);
    try {
      for (const row of dupSel) await del({ data: { row } });
      toast(`${dupSel.size} ${dupSel.size === 1 ? "produto excluído" : "produtos excluídos"}!`);
      setDupOpen(false); setDupSel(new Set()); onChanged();
    } catch (err) { toast(err instanceof Error ? err.message : "Erro ao excluir"); }
    finally { setDupDeleting(false); }
  };
  const bulkList = products.filter((p) => sel.has(p.row));
  const confirmBulk = async () => {
    if (!bulkList.length) return;
    setBulkDeleting(true);
    try {
      for (const p of bulkList) await del({ data: { row: p.row } });
      toast(`${bulkList.length} ${bulkList.length === 1 ? "produto excluído" : "produtos excluídos"}!`);
      setBulkOpen(false); setSel(new Set()); onChanged();
    } catch (err) { toast(err instanceof Error ? err.message : "Erro ao excluir"); }
    finally { setBulkDeleting(false); }
  };
  const cancel = () => { if (saving || photoLoading) return; setFormOpen(false); setEditing(null); setF(blank); };
  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Selecione uma imagem"); return; }
    setPhotoLoading(true);
    try { const up = await uploadPhoto(file); setF((s) => ({ ...s, foto: up.preview, fotoRef: up.ref })); }
    catch (err) { toast(err instanceof Error ? err.message : "Erro na foto"); }
    finally { setPhotoLoading(false); e.target.value = ""; }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.modelo.trim()) { toast("Informe o modelo"); return; }
    const validNumber = (v: string) => /^\d+(?:[.,]\d+)*$/.test(v.trim()) && parseNum(v) >= 0;
    if (![f.custo, f.venda, f.estoque].every(validNumber) || (f.lucro && !validNumber(f.lucro)) || !Number.isInteger(parseNum(f.estoque))) { toast("Informe valores válidos e estoque inteiro, sem números negativos"); return; }
    if (vars.some((v) => !v.cor.trim() || ![v.custo, v.preco].every(validNumber) || (v.lucro && !/^-?\d+(?:[.,]\d+)*$/.test(v.lucro.trim())))) { toast("Revise as variações: informe a cor, custo e preço válidos"); return; }
    const variants = vars.map((v) => ({ cor: v.cor.trim(), corHex: v.corHex, custo: parseNum(v.custo), lucro: parseNum(v.lucro), preco: parseNum(v.preco), imagem: v.imagem, disponivel: v.disponivel }));
    // The product keeps the lowest available variant price as its base price.
    const base = [...variants].filter((v) => v.disponivel).sort((a, b) => a.preco - b.preco)[0];
    setSaving(true);
    try {
      await save({ data: { variants, row: editing?.row, modelo: f.modelo.trim(), variacao: f.variacao.trim(), custo: base ? base.custo : parseNum(f.custo), venda: base ? base.preco : parseNum(f.venda), estoque: Math.round(parseNum(f.estoque)), foto: f.fotoRef, lucroTipo: f.lucroTipo, lucro: parseNum(f.lucro), categoria: f.categoria.trim(), categoriaPai: f.categoriaPai.trim(), destaque: f.destaque } });
      toast(editing ? "Produto atualizado!" : "Produto salvo com sucesso!");
      setFormOpen(false); setEditing(null); setF(blank); onChanged();
    } catch (err) { toast(err instanceof Error ? err.message : "Erro ao salvar"); }
    finally { setSaving(false); }
  };
  const categories = [...new Set(products.map((p) => p.categoria).filter(Boolean))];
  const openOrder = (tab: "pai" | "sub") => { setOrderTab(tab); setOrderList(tab === "pai" ? cf.parents : categories); setOrderOpen(true); };
  const moveCat = (i: number, dir: -1 | 1) => setOrderList((l) => { const n = [...l]; const j = i + dir; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const confirmOrder = async () => {
    setOrderSaving(true);
    try {
      await saveOrder({ data: { tipo: orderTab, nomes: orderList } });
      reloadOrder();
      toast("Ordem das categorias salva!");
      setOrderOpen(false);
    } catch (err) { toast(err instanceof Error ? err.message : "Erro ao salvar"); }
    finally { setOrderSaving(false); }
  };
  const list = products.filter((p) => cf.match(p) && matchSearch(search.value, p.modelo, p.variacao, p.categoria));
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = list.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const goPage = (next: number) => { setPage(next); document.getElementById("catalog-feed")?.scrollIntoView({ block: "start" }); };

  return (
    <div className="mx-auto w-full max-w-[1180px] pb-24">
      <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0"><h1 className="text-[26px] font-semibold">Catálogo de produtos</h1><p className="mt-1 text-sm text-dim">{products.length} {products.length === 1 ? "produto" : "produtos"}</p></div>
        <Button variant="ghost" size="icon" className="size-11 rounded-xl" onClick={onChanged} disabled={refreshing} aria-label="Atualizar catálogo" title="Atualizar catálogo"><RefreshCw className={refreshing ? "animate-spin" : ""} /></Button>
      </div>
      <div className="sticky top-[72px] z-10 -mx-1 mb-4 space-y-3 bg-ground/95 px-1 py-3 backdrop-blur sm:top-[56px]">
        <SearchBar s={search} />
        <CategoryChips f={cf} chip={(c, on, click) => <Button variant={on ? "default" : "secondary"} className="h-11 shrink-0 rounded-full" aria-pressed={on} onClick={click}>{c}</Button>} />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <label className="flex min-w-0 items-center gap-2 text-xs text-dim"><input type="checkbox" aria-label="Selecionar todos" checked={list.length > 0 && list.every((p) => sel.has(p.row))} onChange={(e) => setSel(e.target.checked ? new Set([...sel, ...list.map((p) => p.row)]) : new Set([...sel].filter((r) => !list.some((p) => p.row === r))))} /><span>Selecionar todos</span></label>
          <Button variant="secondary" className="h-11 rounded-xl px-3 text-xs" onClick={() => setImporting(true)}><ClipboardList /><span>Importar lista</span></Button>
          <Button variant="secondary" className="h-11 rounded-xl px-3 text-xs" onClick={openDups} disabled={!dupCount} title={dupCount ? "Revisar produtos duplicados" : "Nenhum produto duplicado"}><Copy /><span>Duplicados{dupCount ? ` (${dupCount})` : ""}</span></Button>
          <Button variant="secondary" className="h-11 rounded-xl px-3 text-xs" onClick={() => openOrder("pai")} disabled={!cf.parents.length && !categories.length} title="Mudar a ordem das categorias"><ArrowUpDown /><span>Ordenar categorias</span></Button>
          <Button variant="secondary" className="h-11 rounded-xl px-3 text-xs" onClick={() => sel.size ? setShare(true) : toast("Marque os produtos para enviar")}><Send /><span>Enviar catálogo{sel.size ? ` (${sel.size})` : ""}</span></Button>
          {sel.size > 0 && <Button variant="ghost" className="h-11 rounded-xl px-3 text-xs" onClick={() => setSel(new Set())}><span>Limpar seleção</span></Button>}
          <Button variant="destructive" className="h-11 rounded-xl px-3 text-xs" onClick={() => sel.size ? setBulkOpen(true) : toast("Marque os produtos para excluir")} disabled={bulkDeleting} title={sel.size ? "Excluir os produtos marcados" : "Marque os produtos para excluir"}><Trash2 /><span>Excluir marcados{sel.size ? ` (${sel.size})` : ""}</span></Button>
        </div>
        {(cf.active || search.value) && <p className="text-xs text-dim" aria-live="polite">{list.length} {list.length === 1 ? "produto" : "produtos"}</p>}
      </div>
      <div id="catalog-feed" className="grid scroll-mt-64 grid-cols-2 gap-4 md:grid-cols-4" aria-busy={loading}>
        {loading ? Array.from({ length: 8 }, (_, i) => <div key={i} className="overflow-hidden rounded-2xl bg-panel2" aria-label="Carregando produto"><Skeleton className="aspect-[4/5] w-full rounded-none" /><div className="space-y-2 p-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3 w-1/3" /><Skeleton className="h-6 w-1/2" /></div></div>) : visible.map((p) => (
          <article key={p.row} className="flex flex-col overflow-hidden rounded-2xl bg-panel2">
            <div className="relative aspect-[4/5] bg-ground">
              <Button variant="ghost" className="h-full w-full rounded-none p-0" aria-label={`Editar ${p.modelo}`} onClick={() => openProduct(p)}>
                {p.foto ? <img src={p.foto} alt={p.modelo} loading="lazy" className="h-full w-full object-cover" /> : <span className="grid place-items-center gap-2 text-dim"><Camera className="size-8" /><span className="text-xs">Sem foto</span></span>}
              </Button>
              <label className="absolute left-2 top-2 grid size-9 cursor-pointer place-items-center rounded-lg bg-panel/95"><input type="checkbox" aria-label={`Selecionar ${p.modelo}`} checked={sel.has(p.row)} onChange={() => toggle(p.row)} /></label>
              {p.destaque && <span className="pointer-events-none absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-panel/95 text-acid" title="Destaque na vitrine" aria-label="Destaque">★</span>}
              <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-panel/95 px-2 py-0.5 text-[11px] font-medium tabular-nums" title={`Estoque: ${p.estoque}`}>Estoque {p.estoque}</span>
              <div className="absolute right-2 top-2">
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" size="icon" className="size-9 rounded-lg bg-panel" aria-label={`Opções de ${p.modelo}`} title="Opções do produto"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="min-h-11" onSelect={() => openProduct(p)}><Pencil />Editar</DropdownMenuItem><DropdownMenuItem className="min-h-11" onSelect={() => openProduct(p, true)}><Copy />Duplicar</DropdownMenuItem><DropdownMenuItem className="min-h-11 text-destructive" onSelect={() => setRemoving(p)}><Trash2 />Excluir</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
              </div>
            </div>
            <Button variant="ghost" className="h-auto flex-1 flex-col items-start gap-1 whitespace-normal p-3 text-left hover:bg-transparent" onClick={() => openProduct(p)} aria-label={`Editar detalhes de ${p.modelo}`}>
              <h2 className="w-full break-words text-sm font-semibold leading-snug">{p.modelo}</h2>
              {p.variacao && <span className="w-full truncate text-xs font-normal text-dim">{p.variacao}</span>}
              <span className="rounded-full bg-ground px-2 py-0.5 text-[11px] font-medium text-dim">{[p.categoriaPai, p.categoria].filter(Boolean).join(" › ") || "Sem categoria"}</span>
              {p.variants.length > 0 && <span className="flex flex-wrap gap-1" aria-label={`Cores: ${p.variants.map((v) => v.cor).join(", ")}`}>{p.variants.map((v, i) => <span key={i} title={v.cor} className={`size-3.5 rounded-full ring-1 ring-line ${v.disponivel ? "" : "opacity-40"}`} style={{ background: v.corHex }} />)}</span>}
              {(() => { const ps = p.variants.map((v) => v.preco); const differ = ps.length > 1 && Math.min(...ps) !== Math.max(...ps);
                return <span className="mt-1 w-full text-lg font-semibold tabular-nums">{differ ? <><span className="text-xs font-normal text-dim">a partir de </span>{brl(Math.min(...ps))}</> : brl(ps[0] ?? p.venda)}</span>; })()}
              <span className="text-xs font-medium text-success">Lucro: {p.lucroTipo === "margem" ? pct(p.lucro) : brl(p.lucro)}</span>
            </Button>
            <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
              <span className={`flex min-w-0 items-center gap-1.5 text-xs ${p.estoque > 0 ? "text-success" : "text-dim"}`}><span className={`size-2 shrink-0 rounded-full ${p.estoque > 0 ? "bg-success" : "bg-dim"}`} /><span className="truncate">{p.estoque > 0 ? "Disponível" : "Indisponível"}</span></span>
              <Button variant="ghost" size="icon" className="size-9 shrink-0 rounded-lg text-acid" onClick={() => onUse(p)} aria-label={`Calcular ${p.modelo}`} title={`Calcular ${p.modelo}`}><CalculatorIcon className="size-4" /></Button>
            </div>
          </article>
        ))}
        {!loading && !list.length && (products.length ? <div className="col-span-2 py-6 md:col-span-4"><NoResults onClear={() => { search.clear(); cf.choosePai(""); }} /></div> : <div className="col-span-2 grid justify-items-center gap-4 py-16 text-center md:col-span-4"><ImagePlus className="size-12 text-dim" /><h2 className="text-xl font-semibold">Seu catálogo está vazio</h2><Button className="h-11 rounded-xl" onClick={newProduct}><Plus />Cadastrar primeiro produto</Button></div>)}
      </div>
      {!loading && pageCount > 1 && <nav aria-label="Paginação do catálogo" className="mt-6 flex items-center justify-center gap-4"><Button variant="secondary" size="icon" className="size-11 rounded-xl" disabled={currentPage === 1} onClick={() => goPage(currentPage - 1)} aria-label="Página anterior"><ChevronLeft /></Button><span className="text-sm text-dim">Página {currentPage} de {pageCount}</span><Button variant="secondary" size="icon" className="size-11 rounded-xl" disabled={currentPage === pageCount} onClick={() => goPage(currentPage + 1)} aria-label="Próxima página"><ChevronRight /></Button></nav>}
      <Button onClick={newProduct} className="fixed bottom-6 right-5 z-30 h-14 w-14 rounded-full px-0 shadow-lg sm:w-auto sm:px-5" aria-label="Novo produto"><Plus className="size-5" /><span className="hidden sm:inline">Novo produto</span></Button>

      <ImportList open={importing} onClose={() => setImporting(false)} products={products} onDone={onChanged} />
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) cancel(); }}>
        <DialogContent aria-describedby={undefined} className="bottom-0 top-auto max-h-[90dvh] max-w-[640px] translate-y-0 overflow-y-auto rounded-t-2xl border-0 bg-panel p-5 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
          <DialogTitle className="pr-8 text-xl">{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
          <form onSubmit={submit} className="grid gap-4">
            <div className="flex items-center gap-4">
              <label className="relative grid size-28 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-ground text-center text-xs text-dim">
                {f.foto ? <img src={f.foto} alt="Foto do produto" className="size-full object-cover" /> : <span className="grid justify-items-center gap-2"><ImagePlus />Adicionar foto</span>}
                {photoLoading && <span className="absolute inset-0 grid place-items-center bg-panel/90">Preparando…</span>}
                <input type="file" aria-label="Foto do produto" accept="image/*" className="hidden" onChange={onPhoto} disabled={saving || photoLoading} />
              </label>
              {f.foto && <Button variant="secondary" type="button" className="h-11 rounded-xl" disabled={saving || photoLoading} onClick={() => setF((s) => ({ ...s, foto: "", fotoRef: "" }))}>Tirar foto</Button>}
            </div>
            <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
              <label className="min-w-0 sm:col-span-2"><span className="label-mono">Modelo do aparelho</span><input required maxLength={200} className="field" placeholder="iPhone 17 Pro Max 256GB" value={f.modelo} onChange={set("modelo")} /></label>
              <label className="min-w-0"><span className="label-mono">Variação / cor</span><input maxLength={200} className="field" placeholder="Laranja / Titânio" value={f.variacao} onChange={set("variacao")} /></label>
              <label className="min-w-0"><span className="label-mono">Categoria pai</span><input maxLength={100} className="field" list="cats-pai" placeholder="Ex.: Apple, Samsung" value={f.categoriaPai} onChange={set("categoriaPai")} /><datalist id="cats-pai">{cf.parents.map((c) => <option key={c} value={c} />)}</datalist></label>
              <label className="min-w-0"><span className="label-mono">Subcategoria</span><input maxLength={100} className="field" list="cats" placeholder="Ex.: iPhone, Samsung, Seminovo" value={f.categoria} onChange={set("categoria")} /><datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
              <label className="min-w-0"><span className="label-mono">Custo R$</span><input required className="field" inputMode="decimal" value={f.custo} onChange={set("custo")} /></label>
              <label className="min-w-0"><span className="label-mono">Preço de venda R$</span><input required className="field" inputMode="decimal" value={f.venda} onChange={set("venda")} /></label>
              <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.destaque} onChange={(e) => setF((s) => ({ ...s, destaque: e.target.checked }))} /><span>★ Destaque na vitrine (aparece na página inicial)</span></label>
              <label className="min-w-0"><span className="label-mono">Lucro configurado</span><div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2"><select aria-label="Tipo de lucro" className="field" value={f.lucroTipo} onChange={(e) => setF((s) => ({ ...s, lucroTipo: e.target.value as "fixo" | "margem" }))}><option value="fixo">R$</option><option value="margem">%</option></select><input aria-label="Lucro configurado" className="field" inputMode="decimal" value={f.lucro} onChange={set("lucro")} /></div></label>
              <label className="min-w-0"><span className="label-mono">Estoque / disponibilidade</span><input required className="field" inputMode="numeric" value={f.estoque} onChange={set("estoque")} /><span className={`mt-1 block text-xs ${parseNum(f.estoque) > 0 ? "text-success" : "text-dim"}`}>{parseNum(f.estoque) > 0 ? "Disponível" : "Indisponível"}</span></label>
            </fieldset>
            <fieldset disabled={saving} className="grid min-w-0 gap-2">
              <div className="flex items-center justify-between"><span className="label-mono">Variações</span><Button type="button" variant="secondary" className="h-9 rounded-xl text-xs" onClick={addVar}><Plus />Adicionar</Button></div>
              {!vars.length && <p className="text-xs text-dim">Sem variações: o produto usa o custo e o preço acima.</p>}
              {vars.map((v, i) => (
                <div key={i} className="grid gap-2 rounded-xl bg-ground p-3">
                  <div className="flex items-center gap-2">
                    <input type="color" aria-label="Cor da bolinha" value={v.corHex} onChange={(e) => setVar(i, { corHex: e.target.value })} className="size-9 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" />
                    <input aria-label="Nome da cor" maxLength={60} className="field min-w-0 flex-1" placeholder="Cor" value={v.cor} onChange={(e) => setVar(i, { cor: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label="Duplicar variação" onClick={() => setVars((l) => [...l.slice(0, i + 1), { ...v, cor: "" }, ...l.slice(i + 1)])}><Copy className="size-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 text-destructive" aria-label="Remover variação" onClick={() => setVars((l) => l.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="min-w-0"><span className="text-[11px] text-dim">Custo R$</span><input className="field" inputMode="decimal" value={v.custo} onChange={(e) => setVar(i, { custo: e.target.value })} /></label>
                    <label className="min-w-0"><span className="text-[11px] text-dim">Lucro {f.lucroTipo === "margem" ? "%" : "R$"}</span><input className="field" inputMode="decimal" value={v.lucro} onChange={(e) => setVar(i, { lucro: e.target.value })} /></label>
                    <label className="min-w-0"><span className="text-[11px] text-dim">Preço R${v.manual ? "" : " (auto)"}</span><input className="field" inputMode="decimal" value={v.preco} onChange={(e) => setVar(i, { preco: e.target.value, manual: true })} /></label>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={v.disponivel} onChange={(e) => setVar(i, { disponivel: e.target.checked })} />Disponível</label>
                    {v.manual && <button type="button" className="text-xs text-acid" onClick={() => setVar(i, { manual: false, preco: autoPrice(v.custo, v.lucro, f.lucroTipo) })}>Recalcular preço</button>}
                  </div>
                </div>
              ))}
            </fieldset>
            <div className="sticky bottom-0 flex gap-3 bg-panel py-2"><Button variant="secondary" type="button" className="h-11 rounded-xl" disabled={saving || photoLoading} onClick={cancel}>Cancelar</Button><Button type="submit" className="h-11 flex-1 rounded-xl" disabled={saving || photoLoading}><Check />{saving ? "Salvando…" : "Salvar"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!removing} onOpenChange={(open) => { if (!open && !deleting) setRemoving(null); }}>
        <DialogContent aria-describedby={undefined} className="w-[calc(100%-2rem)] rounded-2xl border-0 bg-panel">
          <DialogTitle className="pr-6">Excluir produto?</DialogTitle>
          <p className="text-sm text-dim">“{removing?.modelo}” será removido do catálogo e das vitrines. Essa ação não pode ser desfeita.</p>
          <div className="flex gap-3"><Button variant="secondary" className="h-11 flex-1 rounded-xl" disabled={deleting} onClick={() => setRemoving(null)}>Cancelar</Button><Button variant="destructive" className="h-11 flex-1 rounded-xl" disabled={deleting} onClick={confirmDelete}><Trash2 />{deleting ? "Excluindo…" : "Excluir"}</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={dupOpen} onOpenChange={(open) => { if (!open && !dupDeleting) setDupOpen(false); }}>
        <DialogContent aria-describedby={undefined} className="bottom-0 top-auto max-h-[90dvh] max-w-[640px] translate-y-0 overflow-y-auto rounded-t-2xl border-0 bg-panel p-5 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
          <DialogTitle className="pr-8 text-xl">Produtos duplicados</DialogTitle>
          <p className="text-sm text-dim">Mesmo modelo e cor. A primeira cópia fica; as marcadas serão excluídas. Essa ação não pode ser desfeita.</p>
          {!dupGroups.length ? <p className="py-6 text-center text-sm text-dim">Nenhum produto duplicado 🎉</p> : (
            <div className="grid gap-4">
              {dupGroups.map((g) => (
                <div key={dupKey(g[0]!)} className="rounded-xl bg-ground p-3">
                  <h3 className="mb-2 text-sm font-semibold">{g[0]!.modelo}{g[0]!.variacao ? ` · ${g[0]!.variacao}` : ""} <span className="font-normal text-dim">({g.length} cópias)</span></h3>
                  <div className="grid gap-2">
                    {g.map((p, i) => (
                      <label key={p.row} className="flex min-h-11 items-center gap-3 rounded-lg bg-panel px-3 py-2">
                        <input type="checkbox" aria-label={`Excluir cópia ${i + 1} de ${p.modelo}`} disabled={i === 0} checked={dupSel.has(p.row)} onChange={() => setDupSel((s) => { const n = new Set(s); if (n.has(p.row)) n.delete(p.row); else n.add(p.row); return n; })} />
                        {p.foto ? <img src={p.foto} alt="" className="size-10 shrink-0 rounded-md object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-md bg-ground text-dim"><Camera className="size-4" /></span>}
                        <span className="min-w-0 flex-1 truncate text-sm">{brl(p.venda)} · estoque {p.estoque}</span>
                        {i === 0 && <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">Manter</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="sticky bottom-0 flex gap-3 bg-panel py-2">
            <Button variant="secondary" className="h-11 flex-1 rounded-xl" disabled={dupDeleting} onClick={() => setDupOpen(false)}>Cancelar</Button>
            <Button variant="destructive" className="h-11 flex-1 rounded-xl" disabled={dupDeleting || !dupSel.size} onClick={confirmDups}><Trash2 />{dupDeleting ? "Excluindo…" : `Excluir ${dupSel.size || ""}`}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkOpen} onOpenChange={(open) => { if (!open && !bulkDeleting) setBulkOpen(false); }}>
        <DialogContent aria-describedby={undefined} className="bottom-0 top-auto max-h-[90dvh] max-w-[640px] translate-y-0 overflow-y-auto rounded-t-2xl border-0 bg-panel p-5 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
          <DialogTitle className="pr-8 text-xl">Excluir {bulkList.length} {bulkList.length === 1 ? "produto" : "produtos"}?</DialogTitle>
          <p className="text-sm text-dim">Os produtos marcados serão removidos do catálogo e das vitrines. Essa ação não pode ser desfeita.</p>
          <div className="my-3 grid max-h-[45dvh] gap-2 overflow-y-auto">
            {bulkList.map((p) => (
              <div key={p.row} className="flex min-h-11 items-center gap-3 rounded-lg bg-ground px-3 py-2">
                {p.foto ? <img src={p.foto} alt="" className="size-10 shrink-0 rounded-md object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-md bg-panel text-dim"><Camera className="size-4" /></span>}
                <span className="min-w-0 flex-1 truncate text-sm">{p.modelo}{p.variacao ? ` · ${p.variacao}` : ""}</span>
                <span className="shrink-0 text-sm tabular-nums text-dim">{brl(p.venda)}</span>
              </div>
            ))}
          </div>
          <div className="sticky bottom-0 flex gap-3 bg-panel py-2">
            <Button variant="secondary" className="h-11 flex-1 rounded-xl" disabled={bulkDeleting} onClick={() => setBulkOpen(false)}>Cancelar</Button>
            <Button variant="destructive" className="h-11 flex-1 rounded-xl" disabled={bulkDeleting || !bulkList.length} onClick={confirmBulk}><Trash2 />{bulkDeleting ? "Excluindo…" : `Excluir ${bulkList.length}`}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={share} onOpenChange={setShare}>
        <DialogContent aria-describedby={undefined} className="w-[calc(100%-2rem)] rounded-2xl border-0 bg-panel">
          <DialogTitle className="pr-6">Enviar catálogo · {sel.size} produto(s)</DialogTitle>
          <label><span className="label-mono">WhatsApp da loja</span><input className="field" inputMode="tel" placeholder="5511999999999" value={zap} onChange={(e) => saveZap(e.target.value)} /></label>
          {share && <input aria-label="Link do catálogo" className="field text-xs" readOnly value={link()} onFocus={(e) => e.target.select()} />}
          <div className="flex flex-wrap gap-2"><Button className="h-11 rounded-xl" onClick={sendZap}><Send />Enviar por WhatsApp</Button><Button variant="secondary" className="h-11 rounded-xl" onClick={copyLink}><Copy />Copiar link</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={orderOpen} onOpenChange={(open) => { if (!open && !orderSaving) setOrderOpen(false); }}>
        <DialogContent aria-describedby={undefined} className="bottom-0 top-auto max-h-[90dvh] max-w-[640px] translate-y-0 overflow-y-auto rounded-t-2xl border-0 bg-panel p-5 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
          <DialogTitle className="pr-8 text-xl">Ordem das categorias</DialogTitle>
          <p className="text-sm text-dim">Use as setas para mudar a ordem. Vale para o catálogo, as vitrines e o “Meu catálogo” dos vendedores.</p>
          <div className="flex gap-2">
            <Button variant={orderTab === "pai" ? "default" : "secondary"} className="h-11 flex-1 rounded-xl" onClick={() => openOrder("pai")}>Categorias pai</Button>
            <Button variant={orderTab === "sub" ? "default" : "secondary"} className="h-11 flex-1 rounded-xl" onClick={() => openOrder("sub")}>Subcategorias</Button>
          </div>
          {!orderList.length ? <p className="py-6 text-center text-sm text-dim">Nenhuma categoria cadastrada ainda.</p> : (
            <div className="grid gap-2">
              {orderList.map((c, i) => (
                <div key={c} className="flex min-h-11 items-center gap-2 rounded-lg bg-ground px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c}</span>
                  <Button variant="secondary" size="icon" className="size-9 shrink-0 rounded-lg" aria-label={`Subir ${c}`} disabled={i === 0 || orderSaving} onClick={() => moveCat(i, -1)}><ArrowUp className="size-4" /></Button>
                  <Button variant="secondary" size="icon" className="size-9 shrink-0 rounded-lg" aria-label={`Descer ${c}`} disabled={i === orderList.length - 1 || orderSaving} onClick={() => moveCat(i, 1)}><ArrowDown className="size-4" /></Button>
                </div>
              ))}
            </div>
          )}
          <div className="sticky bottom-0 flex gap-3 bg-panel py-2">
            <Button variant="secondary" className="h-11 flex-1 rounded-xl" disabled={orderSaving} onClick={() => setOrderOpen(false)}>Cancelar</Button>
            <Button className="h-11 flex-1 rounded-xl" disabled={orderSaving || !orderList.length} onClick={confirmOrder}><Check />{orderSaving ? "Salvando…" : "Salvar ordem"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
