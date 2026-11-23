import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/sheets.functions";
import { deleteBanners, duplicateBanner, listBannersAdmin, reorderBanners, saveBanner, setBannerMode, type AdminBanner } from "@/lib/banners.functions";
import { Carousel } from "./SellerHome";
import { publicOrigin } from "@/lib/publicUrl";

const toast = (m: string) => window.dispatchEvent(new CustomEvent("app-toast", { detail: m }));

export type ImgInfo = { w: number; h: number; size: number };
// Banner images: resized client-side to max 1600px wide (keeping proportion), WebP 0.85, stored privately like product photos.
async function uploadBannerImage(file: File): Promise<{ ref: string; preview: string; info: ImgInfo }> {
  const img = await createImageBitmap(file);
  const info = { w: img.width, h: img.height, size: file.size };
  let blob: Blob | null;
  try {
    const scale = Math.min(1, 1600 / img.width);
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); if (!g) throw new Error("Não foi possível preparar a imagem");
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, w, h);
    blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.85));
    if (!blob || blob.type !== "image/webp") blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
  } finally { img.close(); }
  if (!blob) throw new Error("Não foi possível preparar a imagem");
  const path = `banners/${crypto.randomUUID()}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
  const { error } = await supabase.storage.from("product-photos").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw new Error(`Erro ao enviar imagem: ${error.message}`);
  return { ref: `sb:${path}`, preview: URL.createObjectURL(blob), info };
}

const today = () => new Date().toISOString();
const status = (b: AdminBanner) => !b.ativo ? "Inativo" : b.inicio && b.inicio > today() ? "Agendado" : b.fim && b.fim < today() ? "Expirado" : "Ativo";
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "";
const toInput = (d: string | null) => d ? d.slice(0, 10) : "";
const fromInput = (v: string, end = false) => v ? new Date(`${v}T${end ? "23:59:59" : "00:00:00"}`).toISOString() : null;

type Form = Omit<AdminBanner, "ordem"> & { id: string };
const blank = (vendedor_id: string | null): Form => ({ id: "", vendedor_id, imagem_url: "", preview: "", titulo: "", subtitulo: "", link_tipo: "nenhum", link_valor: "", ativo: true, inicio: null, fim: null });

export function Banners({ products }: { products: Product[] }) {
  const list = useServerFn(listBannersAdmin);
  const save = useServerFn(saveBanner);
  const del = useServerFn(deleteBanners);
  const reorder = useServerFn(reorderBanners);
  const setMode = useServerFn(setBannerMode);
  const dup = useServerFn(duplicateBanner);
  const q = useQuery({ queryKey: ["banners-admin"], queryFn: () => list() });
  const [ctx, setCtx] = useState<string>(""); // "" = padrão
  const [form, setForm] = useState<Form | null>(null);
  const [removing, setRemoving] = useState<AdminBanner[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dupOf, setDupOf] = useState<AdminBanner | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sellers = (q.data?.sellers ?? []).filter((s) => s.active);
  const seller = sellers.find((s) => s.id === ctx) ?? null;
  const all = q.data?.banners ?? [];
  const items = all.filter((b) => (b.vendedor_id ?? "") === ctx).sort((a, b) => a.ordem - b.ordem);
  const defaults = all.filter((b) => !b.vendedor_id);
  const showList = !seller || seller.banner_modo === "proprios";

  const live = (arr: AdminBanner[]) => arr.filter((b) => status(b) === "Ativo").sort((a, b) => a.ordem - b.ordem);
  const previewBanners = useMemo(() => {
    const own = seller?.banner_modo === "proprios" ? live(items) : [];
    const use = own.length ? own : live(defaults);
    return use.length ? use.map((b) => ({ ...b, imagem_url: b.preview })) : [];
  }, [seller, items, defaults]);

  const scopeProducts = seller ? products.filter((p) => seller.product_rows.includes(p.row)) : products;
  const categories = [...new Set(scopeProducts.flatMap((p) => [p.categoriaPai, p.categoria]).filter(Boolean))].sort();

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); await q.refetch(); if (ok) toast(ok); } catch (e) { toast(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  };
  const persistOrder = (arr: AdminBanner[]) => run(() => reorder({ data: { ids: arr.map((b) => b.id) } }));
  const move = (from: number, to: number) => { if (to < 0 || to >= items.length) return; const a = [...items]; const [x] = a.splice(from, 1); a.splice(to, 0, x!); persistOrder(a); };
  const link = seller ? `${publicOrigin()}/vitrine/${seller.slug}` : "";

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <div className="no-scrollbar flex gap-2 overflow-x-auto" role="tablist" aria-label="Contexto dos banners">
        {[{ id: "", nome: "Padrão (todos os vendedores)" }, ...sellers].map((s) => (
          <button key={s.id || "_"} role="tab" aria-selected={ctx === s.id} onClick={() => { setCtx(s.id); setSel(new Set()); }}
            className={`h-11 shrink-0 rounded-full px-4 text-sm font-medium ${ctx === s.id ? "bg-acid text-white" : "bg-panel2 text-dim ring-1 ring-line"}`}>{s.nome}</button>
        ))}
      </div>

      {seller && (
        <div className="space-y-3 rounded-2xl bg-panel2 p-4">
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span className="font-medium">Usar banners próprios</span>
            <input type="checkbox" checked={seller.banner_modo === "proprios"} disabled={busy}
              onChange={(e) => run(() => setMode({ data: { sellerId: seller.id, modo: e.target.checked ? "proprios" : "padrao" } }))} />
          </label>
          {seller.banner_modo !== "proprios" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ground p-3 text-sm">
              <span className="text-dim">Este vendedor usa os banners padrão</span>
              <button className="btn-ghost min-h-11" disabled={busy} onClick={() => run(() => setMode({ data: { sellerId: seller.id, modo: "proprios", copyDefaults: true } }), "Banners padrão copiados")}>Personalizar a partir do padrão</button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <a href={link} target="_blank" rel="noreferrer" className="btn-ghost flex min-h-11 items-center">Abrir vitrine do vendedor</a>
            <button className="btn-ghost min-h-11" onClick={() => { navigator.clipboard.writeText(link); toast("Link copiado"); }}>Copiar link</button>
          </div>
        </div>
      )}

      <section className="space-y-2">
        <span className="label-mono">Pré-visualização{seller ? ` — vitrine de ${seller.nome}` : " — banners padrão"}</span>
        <div className="rounded-2xl bg-ground p-3 ring-1 ring-line">{previewBanners.length ? <Carousel banners={previewBanners} onClick={() => {}} /> : <p className="p-6 text-center text-sm text-dim">Sem banners ativos — a página inicial começa pelos atalhos de categoria.</p>}</div>
      </section>

      {showList && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Banners {seller ? `de ${seller.nome}` : "padrão"}</h2>
            <button className="btn-acid min-h-11" onClick={() => setForm(blank(ctx || null))}>+ Novo banner</button>
          </div>
          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={items.every((b) => sel.has(b.id))}
                onChange={(e) => setSel(e.target.checked ? new Set(items.map((b) => b.id)) : new Set())} />Selecionar todos</label>
              {items.some((b) => sel.has(b.id)) && <button className="btn-ghost min-h-11 text-destructive" onClick={() => setRemoving(items.filter((b) => sel.has(b.id)))}>Excluir selecionados ({items.filter((b) => sel.has(b.id)).length})</button>}
            </div>
          )}
          {q.isLoading && <p className="text-sm text-dim">Carregando…</p>}
          {!q.isLoading && !items.length && <p className="rounded-2xl bg-panel2 p-6 text-center text-sm text-dim">Nenhum banner aqui ainda.</p>}
          <ul className="space-y-2">
            {items.map((b, i) => (
              <li key={b.id} draggable onDragStart={() => setDrag(b.id)} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag && drag !== b.id) move(items.findIndex((x) => x.id === drag), i); setDrag(null); }}
                className={`flex items-center gap-3 rounded-2xl bg-panel2 p-3 ${drag === b.id ? "opacity-50" : ""}`}>
                <input type="checkbox" aria-label="Selecionar banner" checked={sel.has(b.id)} onChange={() => { const n = new Set(sel); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); setSel(n); }} />
                <span className="cursor-grab select-none px-1 text-dim" aria-hidden title="Arraste para reordenar">⋮⋮</span>
                <div className="aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-ground">
                  {b.preview ? <img src={b.preview} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-[10px] text-dim">sem imagem</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{b.titulo || "(sem título)"}</div>
                  <div className="text-xs text-dim">#{i + 1} · <span className={status(b) === "Ativo" ? "text-success" : ""}>{status(b)}</span>{(b.inicio || b.fim) && ` · ${fmt(b.inicio) || "…"} – ${fmt(b.fim) || "…"}`}</div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <button aria-label="Subir" className="btn-ghost size-9 !p-0" onClick={() => move(i, i - 1)} disabled={i === 0 || busy}>↑</button>
                  <button aria-label="Descer" className="btn-ghost size-9 !p-0" onClick={() => move(i, i + 1)} disabled={i === items.length - 1 || busy}>↓</button>
                  <button className="btn-ghost h-9 px-2 text-xs" onClick={() => run(() => save({ data: { ...strip(b), ativo: !b.ativo } }))}>{b.ativo ? "Desativar" : "Ativar"}</button>
                  <button className="btn-ghost h-9 px-2 text-xs" onClick={() => setForm({ ...b })}>Editar</button>
                  <button className="btn-ghost h-9 px-2 text-xs" onClick={() => run(() => dup({ data: { id: b.id, targets: [b.vendedor_id] } }), "Banner duplicado")}>Duplicar</button>
                  <button className="btn-ghost h-9 px-2 text-xs" onClick={() => setDupOf(b)}>Para outro vendedor</button>
                  <button className="btn-ghost h-9 px-2 text-xs text-destructive" onClick={() => setRemoving([b])}>Excluir</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {form && <BannerForm f={form} categories={categories} products={scopeProducts} onClose={() => setForm(null)}
        onSave={(f) => run(async () => { await save({ data: strip(f) }); setForm(null); }, "Banner salvo")} busy={busy} />}

      {removing && (
        <Modal title={removing.length > 1 ? `Excluir ${removing.length} banners?` : "Excluir banner?"} onClose={() => setRemoving(null)}>
          <p className="text-sm text-dim">{removing.length > 1 ? `Excluir estes ${removing.length} banners? Esta ação não pode ser desfeita.` : "Excluir este banner? Esta ação não pode ser desfeita."}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost min-h-11" onClick={() => setRemoving(null)}>Cancelar</button>
            <button className="btn-acid min-h-11 !bg-destructive" disabled={busy} onClick={() => run(async () => { await del({ data: { ids: removing.map((b) => b.id) } }); setRemoving(null); setSel(new Set()); }, removing.length > 1 ? `${removing.length} banners excluídos` : "Banner excluído")}>Excluir{removing.length > 1 ? ` ${removing.length}` : ""}</button>
          </div>
        </Modal>
      )}

      {dupOf && <DupModal sellers={sellers.filter((s) => s.id !== dupOf.vendedor_id)} includeDefault={!!dupOf.vendedor_id} onClose={() => setDupOf(null)} busy={busy}
        onConfirm={(t) => run(async () => { await dup({ data: { id: dupOf.id, targets: t } }); setDupOf(null); }, "Banner duplicado")} />}
    </div>
  );
}

const strip = (b: Form | AdminBanner) => ({ id: b.id || undefined, vendedor_id: b.vendedor_id, imagem_url: b.imagem_url, titulo: b.titulo, subtitulo: b.subtitulo, link_tipo: b.link_tipo, link_valor: b.link_tipo === "nenhum" ? "" : b.link_valor, ativo: b.ativo, inicio: b.inicio, fim: b.fim });

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ground/80 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-panel2 p-5 ring-1 ring-line sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><button aria-label="Fechar" className="grid size-11 place-items-center text-xl text-dim" onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  );
}

function BannerForm({ f: init, categories, products, onClose, onSave, busy }: { f: Form; categories: string[]; products: Product[]; onClose: () => void; onSave: (f: Form) => void; busy: boolean }) {
  const [f, setF] = useState(init);
  const [up, setUp] = useState(false);
  const [info, setInfo] = useState<ImgInfo | null>(null);
  const ratio = info ? info.w / info.h : 0;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal title={init.id ? "Editar banner" : "Novo banner"} onClose={onClose}>
      <div className="grid gap-3">
        <p className="rounded-xl bg-ground p-3 text-xs text-dim ring-1 ring-line">Tamanho ideal: 1600 × 900 px (proporção 16:9). Formato JPG ou WebP, até 300 KB. Mantenha textos e produto dentro da área segura (centro da imagem): no desktop as bordas superior e inferior podem ser cortadas.</p>
        <div className="relative aspect-video overflow-hidden rounded-[20px] bg-ground ring-1 ring-line">
          {f.preview ? <img src={f.preview} alt="" className="size-full object-cover object-center" /> : <div className="grid size-full place-items-center text-xs text-dim">1600 × 900 px</div>}
          {f.preview && <div aria-hidden className="pointer-events-none absolute left-[10%] top-[20%] h-[60%] w-[80%] rounded-lg border-2 border-dashed border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.35)]" />}
          {f.preview && <span className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">Área segura</span>}
        </div>
        {info && (
          <div className="flex flex-wrap gap-2 text-xs">
            {ratio >= 1.7 && ratio <= 1.85
              ? <span className="rounded-full bg-success/15 px-3 py-1 font-medium text-success">Proporção ideal</span>
              : <span className="rounded-full bg-warning/20 px-3 py-1 font-medium text-warning">Proporção diferente: a imagem será cortada</span>}
            {info.w < 1200 && <span className="rounded-full bg-warning/20 px-3 py-1 text-warning">Resolução baixa, pode ficar borrada</span>}
            {info.size > 500 * 1024 && <span className="rounded-full bg-warning/20 px-3 py-1 text-warning">Arquivo grande ({Math.round(info.size / 1024)} KB) — foi comprimido no envio</span>}
            <span className="px-1 py-1 text-dim">{info.w} × {info.h} px</span>
          </div>
        )}
        <div className="flex gap-2">
          <label className="btn-ghost flex min-h-11 flex-1 cursor-pointer items-center justify-center">{up ? "Enviando…" : f.preview ? "Trocar imagem" : "Enviar imagem"}
            <input type="file" accept="image/jpeg,image/webp,image/png" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return; setUp(true);
              try { const r = await uploadBannerImage(file); setF((s) => ({ ...s, imagem_url: r.ref, preview: r.preview })); setInfo(r.info); } catch (err) { toast(err instanceof Error ? err.message : "Erro"); } finally { setUp(false); }
            }} />
          </label>
          {f.preview && <button className="btn-ghost min-h-11" onClick={() => { setF((s) => ({ ...s, imagem_url: "", preview: "" })); setInfo(null); }}>Remover</button>}
        </div>
        <label><span className="label-mono">Título</span><input className="field" value={f.titulo} maxLength={120} onChange={(e) => set("titulo", e.target.value)} /></label>
        <label><span className="label-mono">Subtítulo</span><input className="field" value={f.subtitulo} maxLength={200} onChange={(e) => set("subtitulo", e.target.value)} /></label>
        <label><span className="label-mono">Destino do clique</span>
          <select className="field" value={f.link_tipo} onChange={(e) => setF((s) => ({ ...s, link_tipo: e.target.value as Form["link_tipo"], link_valor: "" }))}>
            <option value="nenhum">Nenhum</option><option value="categoria">Categoria</option><option value="produto">Produto</option><option value="url">URL externa</option>
          </select>
        </label>
        {f.link_tipo === "categoria" && <select aria-label="Categoria" className="field" value={f.link_valor} onChange={(e) => set("link_valor", e.target.value)}><option value="">Escolha…</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>}
        {f.link_tipo === "produto" && <select aria-label="Produto" className="field" value={f.link_valor} onChange={(e) => set("link_valor", e.target.value)}><option value="">Escolha…</option>{products.map((p) => <option key={p.row} value={String(p.row)}>{[p.modelo, p.variacao].filter(Boolean).join(" · ")}</option>)}</select>}
        {f.link_tipo === "url" && <input aria-label="URL" className="field" placeholder="https://…" value={f.link_valor} onChange={(e) => set("link_valor", e.target.value)} />}
        <div className="grid grid-cols-2 gap-3">
          <label><span className="label-mono">Início (opcional)</span><input type="date" className="field" value={toInput(f.inicio)} onChange={(e) => set("inicio", fromInput(e.target.value))} /></label>
          <label><span className="label-mono">Fim (opcional)</span><input type="date" className="field" value={toInput(f.fim)} onChange={(e) => set("fim", fromInput(e.target.value, true))} /></label>
        </div>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={f.ativo} onChange={(e) => set("ativo", e.target.checked)} />Ativo</label>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost min-h-11" onClick={onClose}>Cancelar</button>
          <button className="btn-acid min-h-11" disabled={busy || up || (!f.titulo.trim() && !f.imagem_url)} onClick={() => onSave(f)}>Salvar</button>
        </div>
      </div>
    </Modal>
  );
}

function DupModal({ sellers, includeDefault, onClose, onConfirm, busy }: { sellers: { id: string; nome: string }[]; includeDefault: boolean; onClose: () => void; onConfirm: (t: (string | null)[]) => void; busy: boolean }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const opts = [...(includeDefault ? [{ id: "_default", nome: "Padrão (todos os vendedores)" }] : []), ...sellers];
  return (
    <Modal title="Duplicar para outro vendedor" onClose={onClose}>
      <div className="grid gap-1">
        {opts.map((s) => (
          <label key={s.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-ground">
            <input type="checkbox" checked={sel.has(s.id)} onChange={() => { const n = new Set(sel); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); setSel(n); }} />{s.nome}
          </label>
        ))}
        {!opts.length && <p className="text-sm text-dim">Nenhum outro vendedor ativo.</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost min-h-11" onClick={onClose}>Cancelar</button>
        <button className="btn-acid min-h-11" disabled={!sel.size || busy} onClick={() => onConfirm([...sel].map((id) => id === "_default" ? null : id))}>Duplicar ({sel.size})</button>
      </div>
    </Modal>
  );
}
