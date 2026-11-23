import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildSchedule, fmtBR, suggestFirst, todaySP, addDays, type Periodicidade } from "@/lib/schedule";
import { ScheduleModal, loadInstallments } from "@/components/PromissoriaSchedule";
import { useServerFn } from "@tanstack/react-start";
import { saveClient, setPaidInstallments, type Client } from "@/lib/sheets.functions";
import { brl, digits, maskCEP, maskCPF, maskPhone, parseNum, toast } from "@/lib/format";

const PAGAMENTOS = ["Pix", "Dinheiro", "Débito", "Crédito", "Promissória"];
const PARCELAS = ["1x", "2x", "3x", "4x", "5x", "6x", "7x", "8x", "9x", "10x", "11x", "12x", "18x", "24x"];
const empty = { nome: "", cpf: "", telefone: "", email: "", cep: "", endereco: "", bairro: "", cidade: "", uf: "", valor: "", pagamento: "Pix", parcelas: "1x", pagas: "0", entrada: "" };
const payColor: Record<string, string> = { Pix: "bg-acid/15 text-acid", Dinheiro: "bg-acid/15 text-acid", Crédito: "bg-violet/15 text-violet", Débito: "bg-violet/15 text-violet", Promissória: "bg-amber/15 text-amber" };

export function Clients({ clients, onChanged, refreshing }: { clients: Client[]; onChanged: () => void; refreshing: boolean }) {
  const save = useServerFn(saveClient);
  const setPaid = useServerFn(setPaidInstallments);
  const changePaid = async (c: Client, n: number) => {
    const total = parseInt(c.parcelas) || 1;
    const v = Math.max(0, Math.min(total, n));
    try { await setPaid({ data: { row: c.row, pagas: v } }); toast(`${v}/${total} parcelas pagas`); onChanged(); }
    catch (err) { toast(err instanceof Error ? err.message : "Erro ao salvar"); }
  };
  const [f, setF] = useState(empty);
  const [per, setPer] = useState<Periodicidade>("mensal");
  const [dia, setDia] = useState(10);
  const [primeira, setPrimeira] = useState(() => suggestFirst(10));
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [hasSchedule, setHasSchedule] = useState(false);
  const [regen, setRegen] = useState(true);
  const [viewing, setViewing] = useState<Client | null>(null);
  useEffect(() => { setOverrides({}); }, [per, dia, primeira, f.parcelas, f.valor, f.entrada]);
  const nParc = parseInt(f.parcelas) || 1;
  const preview = f.pagamento === "Promissória" && primeira
    ? buildSchedule(parseNum(f.valor) || 0, parseNum(f.entrada) || 0, nParc, primeira, per, dia).map((p) => ({ ...p, vencimento: overrides[p.numero] ?? p.vencimento }))
    : [];
  const [editing, setEditing] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, mask?: (s: string) => string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: mask ? mask(e.target.value) : e.target.value });

  const lookupCep = async () => {
    const c = digits(f.cep);
    if (c.length !== 8) return;
    try {
      const d = await (await fetch(`https://viacep.com.br/ws/${c}/json/`)).json();
      if (d.erro) { toast("CEP não encontrado"); return; }
      setF((s) => ({ ...s, endereco: d.logradouro || s.endereco, bairro: d.bairro || s.bairro, cidade: d.localidade || s.cidade, uf: d.uf || s.uf }));
    } catch { /* ignore */ }
  };

  const startEdit = (c: Client) => {
    setEditing(c);
    setHasSchedule(false); setRegen(true);
    if (c.pagamento === "Promissória") loadInstallments(c.row).then((l) => { if (l.length) { setHasSchedule(true); setRegen(false); } }).catch(() => {});
    setF({ ...c, valor: String(c.valor).replace(".", ","), pagas: String(c.pagas), entrada: c.entrada ? String(c.entrada).replace(".", ",") : "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancel = () => { setEditing(null); setF(empty); setHasSchedule(false); setRegen(true); };
  const persistSchedule = async (row: number, entrada: number) => {
    const { error: e1 } = await supabase.from("promissory_installments").delete().eq("client_row", row);
    if (e1) throw e1;
    const rows = [
      ...(entrada > 0 ? [{ client_row: row, numero: 0, vencimento: todaySP(), valor: entrada, data_pagamento: todaySP(), valor_pago: entrada, forma_pagamento: "Entrada", periodicidade: per }] : []),
      ...preview.map((p) => ({ client_row: row, numero: p.numero, vencimento: p.vencimento, valor: p.valor, data_pagamento: null, valor_pago: null, forma_pagamento: "", periodicidade: per })),
    ];
    const { error } = await supabase.from("promissory_installments").insert(rows);
    if (error) throw error;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.pagamento === "Promissória" && parseNum(f.entrada) > parseNum(f.valor)) { toast("A entrada não pode ser maior que o valor da compra"); return; }
    if (!f.nome.trim() || digits(f.cpf).length !== 11 || digits(f.telefone).length < 10 || digits(f.cep).length !== 8)
      { toast("Preencha nome, CPF, telefone e CEP corretamente"); return; }
    setSaving(true);
    try {
      const r = await save({ data: { ...f, nome: f.nome.trim(), valor: parseNum(f.valor), pagas: f.pagamento === "Promissória" && regen ? 0 : f.pagamento === "Promissória" ? Math.min(parseInt(f.parcelas) || 1, Math.max(0, parseInt(f.pagas) || 0)) : 0, entrada: f.pagamento === "Promissória" ? Math.max(0, parseNum(f.entrada) || 0) : 0, row: editing?.row } });
      if (f.pagamento === "Promissória" && regen && r.row) await persistSchedule(r.row, Math.max(0, parseNum(f.entrada) || 0));
      toast(editing ? "Cliente atualizado!" : "Cliente salvo com sucesso!");
      cancel();
      onChanged();
    } catch (err) { toast(err instanceof Error ? err.message : "Erro ao salvar"); }
    setSaving(false);
  };

  return (
    <>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 font-mono text-[11px] text-dim">cadastro, compra e contato</p>
        </div>
        {editing && <span className="rounded-full bg-amber/15 px-3 py-1 font-mono text-[11px] text-amber">Modo de edição</span>}
      </div>

      <form onSubmit={submit} className="rounded-xl bg-panel2">
        <div className="panel-head">{editing ? `Editando: ${editing.nome}` : "Cadastrar novo cliente na planilha"}</div>
        <div className="grid gap-3 p-4 md:grid-cols-4">
          <label className="md:col-span-2"><span className="label-mono">Nome completo *</span><input className="field" value={f.nome} onChange={set("nome")} /></label>
          <label><span className="label-mono">CPF *</span><input className="field" placeholder="000.000.000-00" value={f.cpf} onChange={set("cpf", maskCPF)} /></label>
          <label><span className="label-mono">Telefone / WhatsApp *</span><input className="field" placeholder="(00) 00000-0000" value={f.telefone} onChange={set("telefone", maskPhone)} /></label>
          <label className="md:col-span-2"><span className="label-mono">E-mail</span><input className="field" type="email" value={f.email} onChange={set("email")} /></label>
          <label><span className="label-mono">CEP *</span><input className="field" placeholder="00000-000" value={f.cep} onChange={set("cep", maskCEP)} onBlur={lookupCep} /></label>
          <label><span className="label-mono">Bairro</span><input className="field" value={f.bairro} onChange={set("bairro")} /></label>
          <label className="md:col-span-2"><span className="label-mono">Endereço</span><input className="field" value={f.endereco} onChange={set("endereco")} /></label>
          <label><span className="label-mono">Cidade</span><input className="field" value={f.cidade} onChange={set("cidade")} /></label>
          <label><span className="label-mono">UF</span><input className="field" maxLength={2} value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value.toUpperCase() })} /></label>

          <div className="grid gap-3 rounded-lg bg-ground p-3 ring-1 ring-line md:col-span-4 md:grid-cols-4">
            <label><span className="label-mono">Valor da compra R$</span><input className="field !bg-panel" inputMode="decimal" value={f.valor} onChange={set("valor")} /></label>
            <label><span className="label-mono">Forma de pagamento</span>
              <select className="field !bg-panel" value={f.pagamento} onChange={set("pagamento")}>{PAGAMENTOS.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label><span className="label-mono">Parcelas</span>
              <select className="field !bg-panel" value={f.parcelas} onChange={set("parcelas")}>{PARCELAS.map((p) => <option key={p} value={p}>{p === "1x" ? "1x à vista" : p}</option>)}</select></label>
            {f.pagamento === "Promissória" && (
              <label><span className="label-mono">Valor de entrada R$</span><input className="field !bg-panel" inputMode="decimal" value={f.entrada} onChange={set("entrada")} /></label>
            )}
            {f.pagamento === "Promissória" && (() => {
              const rest = Math.max(0, parseNum(f.valor) - (parseNum(f.entrada) || 0));
              const n = parseInt(f.parcelas) || 1;
              return <p className="text-sm text-dim md:col-span-4">Restante a pagar: <b className="text-ink tabular-nums">{brl(rest)}</b> · {n}x de {brl(rest / n)}</p>;
            })()}
            {f.pagamento === "Promissória" && (
              <div className="grid gap-3 md:col-span-4 md:grid-cols-4">
                {hasSchedule && <label className="flex items-center gap-2 text-sm md:col-span-4"><input type="checkbox" checked={regen} onChange={(e) => setRegen(e.target.checked)} /> Recalcular cronograma (apaga os pagamentos registrados)</label>}
                {regen && <>
                  <label><span className="label-mono">Periodicidade</span>
                    <select className="field !bg-panel" value={per} onChange={(e) => { const v = e.target.value as Periodicidade; setPer(v); if (v === "mensal") setPrimeira(suggestFirst(dia)); else setPrimeira(addDays(todaySP(), v === "semanal" ? 7 : 14)); }}>
                      <option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option>
                    </select></label>
                  {per === "mensal" && <label><span className="label-mono">Dia fixo de vencimento</span>
                    <input className="field !bg-panel" type="number" min={1} max={31} value={dia} onChange={(e) => { const d = Math.min(31, Math.max(1, parseInt(e.target.value) || 1)); setDia(d); setPrimeira(suggestFirst(d)); }} /></label>}
                  <label><span className="label-mono">Data da 1ª parcela</span>
                    <input className="field !bg-panel" type="date" value={primeira} onChange={(e) => e.target.value && setPrimeira(e.target.value)} /></label>
                </>}
                {regen && preview.length > 0 && (
                  <div className="overflow-x-auto md:col-span-4">
                    <table className="w-full text-sm tabular-nums">
                      <thead className="text-left text-xs text-dim"><tr><th className="py-1">Parcela</th><th>Vencimento</th><th>Valor</th></tr></thead>
                      <tbody className="divide-y divide-line">
                        {parseNum(f.entrada) > 0 && <tr><td className="py-1">Entrada</td><td>{fmtBR(todaySP())} (paga)</td><td>{brl(parseNum(f.entrada))}</td></tr>}
                        {preview.map((p) => (
                          <tr key={p.numero}><td className="py-1">{p.numero}/{nParc}</td>
                            <td><input type="date" className="field !h-9 !w-40 !bg-panel !py-1" value={p.vencimento} onChange={(e) => e.target.value && setOverrides((o) => ({ ...o, [p.numero]: e.target.value }))} /></td>
                            <td>{brl(p.valor)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-xs text-dim">Entrada {brl(parseNum(f.entrada) || 0)} · Saldo devedor {brl(Math.max(0, parseNum(f.valor) - (parseNum(f.entrada) || 0)))} · Soma das parcelas {brl(preview.reduce((a, p) => a + p.valor, 0))}</p>
                  </div>
                )}
              </div>
            )}
            {f.pagamento === "Promissória" && !regen && (
              <label><span className="label-mono">Parcelas pagas</span>
                <select className="field !bg-panel" value={f.pagas} onChange={set("pagas")}>
                  {Array.from({ length: (parseInt(f.parcelas) || 1) + 1 }, (_, i) => <option key={i} value={i}>{i} de {parseInt(f.parcelas) || 1}</option>)}
                </select></label>
            )}
          </div>
          <div className="flex gap-2 md:col-span-4">
            <button disabled={saving} className="btn-acid">{saving ? "Salvando…" : editing ? "Salvar alterações na planilha" : "Salvar cliente na planilha"}</button>
            {editing && <button type="button" className="btn-ghost" onClick={cancel}>Cancelar edição</button>}
          </div>
        </div>
      </form>

      <section className="mt-6 rounded-xl bg-panel2">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-dim">Clientes registrados na planilha</span>
          <button onClick={onChanged} className="btn-ghost !py-1 text-xs">{refreshing ? "…" : "Atualizar"}</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[12px]">
            <thead className="bg-panel text-[10px] uppercase tracking-wider text-dim">
              <tr>{["Nome", "Telefone", "CPF", "Valor", "Pagamento", "Cidade / CEP", "Ações"].map((h) => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clients.map((c) => (
                <tr key={c.row}>
                  <td className="px-4 py-2 font-sans">{c.nome}</td>
                  <td className="px-4 py-2 text-dim">{c.telefone}</td>
                  <td className="px-4 py-2 text-dim">{c.cpf}</td>
                  <td className="px-4 py-2">{brl(c.valor)}{c.pagamento === "Promissória" && c.entrada > 0 && <div className="text-[10px] text-dim">entrada {brl(c.entrada)} · resta {brl(Math.max(0, c.valor - c.entrada))}</div>}</td>
                  <td className="px-4 py-2"><span className={`rounded px-2 py-0.5 ${payColor[c.pagamento] ?? "bg-line text-dim"}`}>{c.pagamento} · {c.parcelas}</span>
                    {c.pagamento === "Promissória" && (() => {
                      const total = parseInt(c.parcelas) || 1;
                      return (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <button aria-label="Desmarcar parcela" className="grid size-5 place-items-center rounded bg-panel ring-1 ring-line hover:text-acid" onClick={() => changePaid(c, c.pagas - 1)}>−</button>
                          <div className="h-1.5 w-16 overflow-hidden rounded bg-line"><div className="h-full bg-amber" style={{ width: `${(c.pagas / total) * 100}%` }} /></div>
                          <button aria-label="Marcar parcela paga" className="grid size-5 place-items-center rounded bg-panel ring-1 ring-line hover:text-acid" onClick={() => changePaid(c, c.pagas + 1)}>+</button>
                          <span className={`text-[10px] ${c.pagas >= total ? "text-acid" : "text-dim"}`}>{c.pagas}/{total}{c.pagas >= total ? " quitado" : ""}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2 text-dim">{[c.cidade, c.uf].filter(Boolean).join("/")} · {c.cep}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <button className="mr-3 text-ink hover:text-acid" onClick={() => startEdit(c)}>Editar</button>
                    {c.pagamento === "Promissória" && <button className="mr-3 text-ink hover:text-acid" onClick={() => setViewing(c)}>Cronograma</button>}
                    <a className="text-acid hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/55${digits(c.telefone)}`}>WhatsApp</a>
                  </td>
                </tr>
              ))}
              {!clients.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-dim">Nenhum cliente cadastrado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {viewing && <ScheduleModal client={viewing} onClose={() => setViewing(null)} onChanged={onChanged} />}
    </>
  );
}
