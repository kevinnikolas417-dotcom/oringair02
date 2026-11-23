import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { createQuote, getSellerProducts, listQuotes, setQuoteStatus, type Quote } from "@/lib/quotes.functions";
import { brl, maskPhone, parseNum, toast } from "@/lib/format";
import { cardOptions, fillRates, parseRates } from "@/lib/rates";
import { publicOrigin } from "@/lib/publicUrl";

type Status = "enviado" | "aceito" | "expirado";
const today = () => new Date().toISOString().slice(0, 10);
export const quoteStatus = (q: { status: string; validade: string }): Status =>
  q.status === "aceito" ? "aceito" : q.validade < today() ? "expirado" : "enviado";
const quoteLink = (id: string) => `${publicOrigin()}/orcamento/${id}`;
const total = (q: Pick<Quote, "items">) => q.items.reduce((s, i) => s + i.preco * i.qtd, 0);
const fmtDate = (d: string) => d.split("-").reverse().join("/");

export function Quotes({ admin }: { admin: boolean }) {
  const fetchList = useServerFn(listQuotes);
  const list = useQuery({ queryKey: ["quotes"], queryFn: () => fetchList() });
  const [filter, setFilter] = useState<"todos" | Status>("todos");
  const [search, setSearch] = useState("");
  const rows = (list.data ?? []).filter((q) => (filter === "todos" || quoteStatus(q) === filter)
    && (!search || `${q.cliente_nome} ${q.vendedor}`.toLowerCase().includes(search.toLowerCase())));

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[26px] font-semibold tracking-tight">Orçamentos</h1>
        <p className="mt-1 font-mono text-[11px] text-dim">{admin ? "todos os orçamentos dos vendedores" : "crie e envie orçamentos aos seus clientes"}</p>
      </div>
      {!admin && <NewQuote onCreated={() => list.refetch()} />}
      <section className="mt-6 rounded-xl bg-panel2">
        <div className="panel-head">Lista · {rows.length}</div>
        <div className="flex flex-wrap items-center gap-2 p-4">
          <div className="segmented">
            {(["todos", "enviado", "aceito", "expirado"] as const).map((f) => (
              <button key={f} className="segment capitalize" data-active={filter === f} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
          <input className="field !w-auto flex-1" placeholder={admin ? "Buscar cliente ou vendedor" : "Buscar cliente"} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {list.isLoading && <p className="p-6 text-center font-mono text-xs text-dim">Carregando…</p>}
        {list.data && !rows.length && <p className="p-6 text-center font-mono text-xs text-dim">Nenhum orçamento.</p>}
        <div className="divide-y divide-line">
          {rows.map((q) => <QuoteRow key={q.id} q={q} admin={admin} onChanged={() => list.refetch()} />)}
        </div>
      </section>
    </>
  );
}

function QuoteRow({ q, admin, onChanged }: { q: Quote; admin: boolean; onChanged: () => void }) {
  const setStatus = useServerFn(setQuoteStatus);
  const st = quoteStatus(q);
  const link = quoteLink(q.id);
  const copy = async () => { await navigator.clipboard.writeText(link); toast("Link copiado!"); };
  const send = () => window.open(`https://wa.me/55${q.cliente_whatsapp.replace(/^55(?=\d{10,11}$)/, "")}?text=${encodeURIComponent(`Olá, ${q.cliente_nome}! Segue seu orçamento (válido até ${fmtDate(q.validade)}): ${link}`)}`, "_blank");
  const toggle = async () => { await setStatus({ data: { id: q.id, status: q.status === "aceito" ? "enviado" : "aceito" } }); onChanged(); };
  const color = st === "aceito" ? "bg-success/15 text-success" : st === "expirado" ? "bg-destructive/10 text-destructive" : "bg-acid/10 text-acid";
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{q.cliente_nome} {admin && q.vendedor && <span className="text-dim">· {q.vendedor}</span>}</div>
        <div className="text-xs text-dim">{q.items.map((i) => `${i.qtd}× ${i.modelo}`).join(", ")} · válido até {fmtDate(q.validade)}</div>
      </div>
      <span className="tabular-nums font-semibold">{brl(total(q))}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs capitalize ${color}`}>{st}</span>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost !py-1.5 text-xs" onClick={copy}>Copiar link</button>
        <button className="btn-ghost !py-1.5 text-xs" onClick={send}>Enviar por WhatsApp</button>
        <button className="btn-ghost !py-1.5 text-xs" onClick={() => window.open(`${link}?pdf=1`, "_blank")}>Baixar PDF</button>
        <button className="btn-ghost !py-1.5 text-xs" onClick={toggle}>{q.status === "aceito" ? "Marcar enviado" : "Marcar aceito"}</button>
      </div>
    </div>
  );
}

type Line = { row: number | ""; qtd: string; preco: string };
function NewQuote({ onCreated }: { onCreated: () => void }) {
  const fetchP = useServerFn(getSellerProducts);
  const create = useServerFn(createQuote);
  const pq = useQuery({ queryKey: ["seller-products"], queryFn: () => fetchP() });
  const products = pq.data?.products ?? [];
  const rates = Object.entries(fillRates(parseRates(pq.data?.rates ?? ""))).map(([n, v]) => [Number(n), v] as [number, number]);
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [nome, setNome] = useState(""); const [wa, setWa] = useState("");
  const [obs, setObs] = useState(""); const [validade, setValidade] = useState(in7);
  const [entrada, setEntrada] = useState("");
  const [lines, setLines] = useState<Line[]>([{ row: "", qtd: "1", preco: "" }]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ id: string; nome: string; wa: string; validade: string } | null>(null);

  const calc = lines.map((l) => {
    const p = products.find((x) => x.row === l.row);
    const preco = l.preco.trim() ? parseNum(l.preco) : p?.venda ?? 0;
    const qtd = Math.max(1, Math.floor(parseNum(l.qtd) || 1));
    return { p, preco, qtd, below: !!p && preco < p.minimo - 0.005 };
  });
  const sum = calc.reduce((s, c) => s + (c.p ? c.preco * c.qtd : 0), 0);
  const entradaVal = entrada.trim() ? parseNum(entrada) : 0;
  const saldo = Math.max(0, sum - entradaVal);
  const entradaOk = entradaVal >= 0 && entradaVal < sum;
  const anyBelow = calc.some((c) => c.below);
  const valid = nome.trim() && wa.replace(/\D/g, "").length >= 10 && calc.some((c) => c.p) && !anyBelow && validade && entradaOk;
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const items = calc.filter((c) => c.p).map((c) => ({ row: c.p!.row, qtd: c.qtd, preco: c.preco }));
      const r = await create({ data: { cliente_nome: nome, cliente_whatsapp: wa, items, observacoes: obs, validade, entrada: entradaVal } });
      setCreated({ id: r.id, nome, wa: wa.replace(/\D/g, ""), validade });
      setNome(""); setWa(""); setObs(""); setEntrada(""); setLines([{ row: "", qtd: "1", preco: "" }]);
      toast("Orçamento criado"); onCreated();
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao criar"); } finally { setSaving(false); }
  };

  return (
    <section className="rounded-xl bg-panel2">
      <div className="panel-head">Novo orçamento</div>
      <div className="grid gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5 text-sm">Nome do cliente<input className="field" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label className="grid gap-1.5 text-sm">WhatsApp do cliente<input className="field" inputMode="tel" placeholder="(11) 90000-0000" value={wa} onChange={(e) => setWa(maskPhone(e.target.value))} /></label>
          <label className="grid gap-1.5 text-sm">Validade<input type="date" className="field" min={today()} value={validade} onChange={(e) => setValidade(e.target.value)} /></label>
        </div>
        {lines.map((l, i) => {
          const c = calc[i]!;
          return (
            <div key={i} className="grid gap-2 rounded-lg bg-ground p-3 sm:grid-cols-[1fr_90px_150px_auto] sm:items-end">
              <label className="grid gap-1.5 text-sm">Produto
                <select className="field" value={l.row} onChange={(e) => upd(i, { row: e.target.value ? Number(e.target.value) : "", preco: "" })}>
                  <option value="">{pq.isLoading ? "Carregando…" : "Selecione…"}</option>
                  {products.map((x) => <option key={x.row} value={x.row}>{x.modelo}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">Qtd<input className="field" inputMode="numeric" value={l.qtd} onChange={(e) => upd(i, { qtd: e.target.value.replace(/\D/g, "") })} /></label>
              <label className="grid gap-1.5 text-sm">Preço unit. (R$)<input className="field" inputMode="decimal" disabled={!c.p} placeholder={c.p ? String(c.p.venda).replace(".", ",") : ""} value={l.preco} onChange={(e) => upd(i, { preco: e.target.value })} /></label>
              <button className="btn-ghost" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, k) => k !== i) : ls)} disabled={lines.length === 1}>Remover</button>
              {c.p && <p className={`text-xs sm:col-span-4 ${c.below ? "font-medium text-destructive" : "text-dim"}`}>{c.below ? "Abaixo do valor mínimo" : `mínimo ${brl(c.p.minimo)}`} · subtotal {brl(c.preco * c.qtd)}</p>}
            </div>
          );
        })}
        <button className="btn-ghost justify-self-start" onClick={() => setLines((ls) => [...ls, { row: "", qtd: "1", preco: "" }])}>+ Adicionar produto</button>
        {sum > 0 && (
          <label className="grid max-w-[300px] gap-1.5 text-sm">Valor de entrada (opcional)
            <input className="field" inputMode="decimal" placeholder="0" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
            <span className={`text-xs ${entradaOk ? "text-dim" : "text-destructive"}`}>{entradaOk ? `abate do total: sobra ${brl(saldo)} a pagar` : "a entrada deve ser menor que o valor total"}</span>
          </label>
        )}
        <label className="grid gap-1.5 text-sm">Observações<textarea className="field min-h-20" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} /></label>
        {sum > 0 && !anyBelow && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-ground p-3">
              <div className="text-xs text-dim">Pix · à vista</div>
              <div className="text-xl font-semibold tabular-nums text-acid">{brl(entradaVal > 0 ? saldo : sum)}</div>
              {entradaVal > 0 && <div className="mt-0.5 text-xs text-dim">total {brl(sum)} − entrada {brl(entradaVal)}</div>}
            </div>
            <div className="rounded-lg bg-ground p-3 text-sm">
              {cardOptions(entradaVal > 0 ? saldo : sum, rates).map((o) => <div key={o.n} className="flex justify-between tabular-nums"><span>{o.n}x de {brl(o.parcela)}</span><span className="text-dim">{brl(o.total)}</span></div>)}
              {entradaVal > 0 && <p className="mt-1 text-xs text-dim">parcelas sobre o saldo após a entrada de {brl(entradaVal)}</p>}
            </div>
          </div>
        )}
        <button className="btn-acid justify-self-start" disabled={!valid || saving} onClick={submit}>{saving ? "Gerando…" : "Gerar orçamento"}</button>
        {created && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-ground p-3">
            <input className="field !w-auto flex-1" readOnly value={quoteLink(created.id)} onFocus={(e) => e.target.select()} />
            <button className="btn-ghost" onClick={async () => { await navigator.clipboard.writeText(quoteLink(created.id)); toast("Link copiado!"); }}>Copiar link</button>
            <button className="btn-acid" onClick={() => window.open(`https://wa.me/55${created.wa.replace(/^55(?=\d{10,11}$)/, "")}?text=${encodeURIComponent(`Olá, ${created.nome}! Segue seu orçamento (válido até ${fmtDate(created.validade)}): ${quoteLink(created.id)}`)}`, "_blank")}>Enviar por WhatsApp</button>
            <button className="btn-ghost" onClick={() => window.open(`${quoteLink(created.id)}?pdf=1`, "_blank")}>Baixar PDF</button>
          </div>
        )}
      </div>
    </section>
  );
}
