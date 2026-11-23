import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { createSeller, listSellers, resetSellerPassword, updateSeller, type Seller } from "@/lib/sellers.functions";
import type { Product } from "@/lib/sheets.functions";
import { maskPhone, toast } from "@/lib/format";
import { serializeRates } from "@/lib/rates";
import { publicOrigin } from "@/lib/publicUrl";
import { Button } from "@/components/ui/button";

const blank = { nome: "", email: "", senha: "", whatsapp: "", slug: "" };
const toSlug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const currentRates = () => {
  try { return serializeRates(JSON.parse(localStorage.getItem("taxas-cartao") ?? "null")); }
  catch { return serializeRates(null); }
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro");

export function Sellers({ products }: { products: Product[] }) {
  const fetchSellers = useServerFn(listSellers);
  const create = useServerFn(createSeller);
  const update = useServerFn(updateSeller);
  const reset = useServerFn(resetSellerPassword);
  const q = useQuery({ queryKey: ["sellers"], queryFn: () => fetchSellers() });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Seller | null>(null);
  const [ef, setEf] = useState({ nome: "", whatsapp: "", slug: "" });
  const [pick, setPick] = useState<Seller | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [cats, setCats] = useState<Set<string>>(new Set());
  const parents = [...new Set(products.map((p) => p.categoriaPai.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const catOk = (p: Product) => !cats.size || cats.has(p.categoriaPai.trim());
  const visibleProducts = products.filter(catOk);
  const selectedRows = visibleProducts.filter((p) => sel.has(p.row)).map((p) => p.row);
  const toggleCategory = (category: string) => {
    const next = new Set(cats);
    if (next.has(category)) next.delete(category); else next.add(category);
    setCats(next);
    setSel((selected) => new Set(products.filter((p) => selected.has(p.row) && (!next.size || next.has(p.categoriaPai.trim()))).map((p) => p.row)));
  };

  const link = (s: Seller) => `${publicOrigin()}/vitrine/${s.slug}`;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok); await q.refetch(); return true; } catch (e) { toast(errMsg(e)); return false; } finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(() => create({ data: f }), "Vendedor criado!")) setF(blank);
  };
  const saveEdit = async () => {
    if (!edit) return;
    if (await run(() => update({ data: { id: edit.id, ...ef } }), "Vendedor atualizado!")) setEdit(null);
  };
  const resetPw = async (s: Seller) => {
    const senha = window.prompt(`Nova senha para ${s.nome} (mínimo 6 caracteres):`);
    if (!senha) return;
    if (senha.length < 6) { toast("A senha precisa ter pelo menos 6 caracteres"); return; }
    await run(() => reset({ data: { id: s.id, senha } }), "Senha redefinida!");
  };
  const openPick = (s: Seller) => { setPick(s); setSel(new Set(s.product_rows)); setCats(new Set(s.categorias ?? [])); };
  const savePick = async () => {
    if (!pick) return;
    if (await run(() => update({ data: { id: pick.id, product_rows: selectedRows, categorias: [...cats], rates: currentRates() } }), "Catálogo do vendedor salvo!")) setPick(null);
  };
  const copy = async (s: Seller) => { await navigator.clipboard.writeText(link(s)); toast("Link copiado!"); };
  const sendZap = (s: Seller) => window.open(`https://wa.me/${s.whatsapp}?text=${encodeURIComponent(`Olá ${s.nome}! Este é o seu catálogo para enviar aos clientes: ${link(s)}`)}`, "_blank");
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = k === "whatsapp" ? maskPhone(e.target.value) : k === "slug" ? toSlug(e.target.value) : e.target.value;
    setF((s) => ({ ...s, [k]: v, ...(k === "nome" && (!s.slug || s.slug === toSlug(s.nome)) ? { slug: toSlug(v) } : {}) }));
  };

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[26px] font-semibold tracking-tight">Vendedores</h1>
        <p className="mt-1 font-mono text-[11px] text-dim">acessos, catálogos e links de cada vendedor</p>
      </div>

      <form onSubmit={submit} className="rounded-xl bg-panel2">
        <div className="panel-head">Criar vendedor</div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <label><span className="label-mono">Nome</span><input className="field" required value={f.nome} onChange={set("nome")} /></label>
          <label><span className="label-mono">E-mail</span><input className="field" type="email" required value={f.email} onChange={set("email")} /></label>
          <label><span className="label-mono">Senha inicial</span><input className="field" type="text" required minLength={6} value={f.senha} onChange={set("senha")} /></label>
          <label><span className="label-mono">WhatsApp (com DDD)</span><input className="field" inputMode="tel" required placeholder="(11) 99999-9999" value={f.whatsapp} onChange={set("whatsapp")} /></label>
          <label><span className="label-mono">Apelido do link</span><input className="field" required placeholder="joao" value={f.slug} onChange={set("slug")} /></label>
          <div className="flex items-end"><button disabled={busy} className="btn-acid w-full">{busy ? "Aguarde…" : "Criar vendedor"}</button></div>
        </div>
        {f.slug && <p className="px-4 pb-4 font-mono text-[11px] text-dim">Link: {publicOrigin()}/vitrine/{f.slug}</p>}
      </form>

      <section className="mt-6 rounded-xl bg-panel2">
        <div className="panel-head">Vendedores cadastrados</div>
        {q.isLoading && <p className="p-6 text-center font-mono text-xs text-dim">Carregando…</p>}
        {q.isError && <p className="p-6 text-center font-mono text-xs text-destructive">{errMsg(q.error)}</p>}
        {q.data && !q.data.length && <p className="p-6 text-center font-mono text-xs text-dim">Nenhum vendedor ainda.</p>}
        <div className="divide-y divide-line">
          {q.data?.map((s) => (
            <div key={s.id} className="grid gap-3 p-4">
              {edit?.id === s.id ? (
                <div className="grid gap-3 md:grid-cols-4">
                  <input className="field" value={ef.nome} onChange={(e) => setEf({ ...ef, nome: e.target.value })} />
                  <input className="field" value={ef.whatsapp} onChange={(e) => setEf({ ...ef, whatsapp: maskPhone(e.target.value) })} />
                  <input className="field" value={ef.slug} onChange={(e) => setEf({ ...ef, slug: toSlug(e.target.value) })} />
                  <div className="flex gap-2"><button disabled={busy} className="btn-acid flex-1" onClick={saveEdit}>Salvar</button><button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button></div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{s.nome} {!s.active && <span className="ml-2 rounded bg-line px-2 py-0.5 font-mono text-[10px] text-dim">desativado</span>}</div>
                    <div className="font-mono text-[11px] text-dim">{s.email} · {maskPhone(s.whatsapp)} · {s.product_rows.length} produto(s){s.categorias?.length ? ` · ${s.categorias.join(", ")}` : ""}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button className="btn-ghost !py-1 text-xs" onClick={() => openPick(s)}>Produtos</button>
                    <button className="btn-ghost !py-1 text-xs" onClick={() => { setEdit(s); setEf({ nome: s.nome, whatsapp: maskPhone(s.whatsapp), slug: s.slug }); }}>Editar</button>
                    <button className="btn-ghost !py-1 text-xs" onClick={() => resetPw(s)}>Redefinir senha</button>
                    <button className="btn-ghost !py-1 text-xs" onClick={() => run(() => update({ data: { id: s.id, active: !s.active } }), s.active ? "Vendedor desativado" : "Vendedor ativado")}>{s.active ? "Desativar" : "Ativar"}</button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input className="field !w-auto flex-1 !py-1 !text-[11px]" readOnly value={link(s)} onFocus={(e) => e.target.select()} />
                <button className="btn-ghost !py-1 text-xs" onClick={() => copy(s)}>Copiar link</button>
                <button className="btn-acid !py-1 text-xs" onClick={() => sendZap(s)}>Enviar por WhatsApp</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {pick && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ground/80 p-4" onClick={() => setPick(null)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-panel2 ring-1 ring-line" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">Produtos de {pick.nome} · {selectedRows.length} selecionado(s)</div>
            {parents.length > 0 && (
              <div className="border-b border-line px-4 py-3">
                <div className="label-mono">Categorias visíveis para o vendedor</div>
                <p className="mb-2 font-mono text-[11px] text-dim">{cats.size ? "Só os produtos dessas categorias aparecem para ele e na vitrine dele." : "Nenhuma marcada = todas as categorias."}</p>
                <div className="flex flex-wrap gap-2">
                  {parents.map((c) => (
                    <Button key={c} type="button" variant="ghost" size="sm" aria-pressed={cats.has(c)} onClick={() => toggleCategory(c)}
                      className={`rounded-full px-3 py-1 text-xs ring-1 ${cats.has(c) ? "bg-acid/15 text-acid ring-acid/40" : "ring-line text-dim"}`}>{c}</Button>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 border-b border-line px-4 py-2 text-sm">
              <input type="checkbox" checked={visibleProducts.length > 0 && visibleProducts.every((p) => sel.has(p.row))}
                onChange={(e) => setSel(e.target.checked ? new Set(visibleProducts.map((p) => p.row)) : new Set())} /> Selecionar todos
            </label>
            <div className="flex-1 divide-y divide-line overflow-auto">
              {visibleProducts.map((p) => (
                <label key={p.row} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <input type="checkbox" checked={sel.has(p.row)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(p.row)) n.delete(p.row); else n.add(p.row); return n; })} />
                  {p.foto ? <img src={p.foto} alt="" className="size-8 rounded object-cover" /> : <span className="size-8 rounded bg-ground ring-1 ring-line" />}
                  <span>{p.modelo} {p.variacao && <span className="text-dim">· {p.variacao}</span>}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 border-t border-line p-4">
              <button disabled={busy} className="btn-acid flex-1" onClick={savePick}>Salvar catálogo</button>
              <button className="btn-ghost" onClick={() => setPick(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
