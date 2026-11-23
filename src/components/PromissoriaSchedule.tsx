import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { setPaidInstallments, type Client } from "@/lib/sheets.functions";
import { brl, digits, parseNum, toast } from "@/lib/format";
import { fmtBR, statusOf, summary, todaySP, type Installment } from "@/lib/schedule";

const FORMAS = ["Pix", "Dinheiro", "Débito", "Crédito"];
const stColor = { pago: "bg-success/15 text-success", atrasado: "bg-destructive/10 text-destructive", pendente: "bg-acid/10 text-acid" };

export async function loadInstallments(row: number): Promise<Installment[]> {
  const { data, error } = await supabase.from("promissory_installments").select("*").eq("client_row", row).order("numero");
  if (error) throw error;
  return (data ?? []).map((d) => ({ ...d, valor: Number(d.valor), valor_pago: d.valor_pago == null ? null : Number(d.valor_pago) }));
}

export function cobrarMsg(c: Client, list: Installment[]) {
  const s = summary(list);
  if (!s.next) return `Olá, ${c.nome}! Sua promissória está quitada. Obrigado!`;
  const st = statusOf(s.next);
  return `Olá, ${c.nome}! Lembrete da parcela ${s.next.numero}/${s.total} no valor de ${brl(s.next.valor)}, com vencimento em ${fmtBR(s.next.vencimento)}${st.s === "atrasado" ? ` (em atraso há ${st.dias} dia(s))` : ""}. Saldo restante: ${brl(s.saldo)}.`;
}

export function ScheduleModal({ client, onClose, onChanged }: { client: Client; onClose: () => void; onChanged: () => void }) {
  const [list, setList] = useState<Installment[] | null>(null);
  const setPaid = useServerFn(setPaidInstallments);
  const reload = () => loadInstallments(client.row).then(setList).catch((e) => toast(e.message));
  useEffect(() => { reload(); }, [client.row]);

  const update = async (i: Installment, patch: Partial<Installment>) => {
    const { error } = await supabase.from("promissory_installments").update(patch).eq("id", i.id!);
    if (error) { toast(error.message); return; }
    const next = (list ?? []).map((x) => (x.id === i.id ? { ...x, ...patch } : x));
    setList(next);
    const pagas = next.filter((x) => x.numero > 0 && x.data_pagamento).length;
    if (pagas !== client.pagas) { try { await setPaid({ data: { row: client.row, pagas } }); onChanged(); } catch { /* ignore */ } }
  };
  const togglePaid = (i: Installment) => update(i, i.data_pagamento
    ? { data_pagamento: null, valor_pago: null, forma_pagamento: "" }
    : { data_pagamento: todaySP(), valor_pago: i.valor, forma_pagamento: i.forma_pagamento || "Pix" });

  const s = list ? summary(list) : null;
  return createPortal(
    <div className="print-modal fixed inset-0 z-50 grid place-items-center bg-ground/80 p-4" onClick={onClose}>
      <div className="print-panel max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-panel2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Promissória · {client.nome}</h2>
            <p className="text-sm text-dim">Compra {brl(client.valor)} · CPF {client.cpf} · {client.telefone}</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button className="btn-ghost" onClick={() => list && window.open(`https://wa.me/55${digits(client.telefone)}?text=${encodeURIComponent(cobrarMsg(client, list))}`, "_blank")}>Cobrar</button>
            <button className="btn-ghost" onClick={() => window.print()}>PDF / Recibo</button>
            <button className="btn-ghost" onClick={onClose}>Fechar</button>
          </div>
        </div>
        {!list && <p className="text-center text-sm text-dim">Carregando…</p>}
        {list && !list.length && <p className="text-center text-sm text-dim">Nenhum cronograma salvo. Edite o cliente e salve para gerar.</p>}
        {s && list && list.length > 0 && (
          <>
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              <Box k="Status" v={s.quitado ? `Quitado em ${fmtBR(s.quitacao)}` : "Em aberto"} />
              <Box k="Próximo vencimento" v={s.next ? `${fmtBR(s.next.vencimento)} · ${brl(s.next.valor)}` : "—"} />
              <Box k="Parcelas pagas" v={`${s.pagas} de ${s.total}`} />
              <Box k="Total pago" v={brl(s.totalPago)} />
              <Box k="Saldo restante" v={brl(s.saldo)} />
              <Box k="Última parcela" v={fmtBR(s.ultima)} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-dim"><tr><th className="py-2">Parcela</th><th>Vencimento</th><th>Valor</th><th>Pagamento</th><th>Valor pago</th><th>Forma</th><th>Status</th><th className="print:hidden" /></tr></thead>
                <tbody className="divide-y divide-line">
                  {list.map((i) => {
                    const st = statusOf(i);
                    const ent = i.numero === 0;
                    return (
                      <tr key={i.id}>
                        <td className="py-2">{ent ? "Entrada" : `${i.numero}/${s.total}`}</td>
                        <td>{fmtBR(i.vencimento)}</td>
                        <td>{brl(i.valor)}</td>
                        <td>{i.data_pagamento && !ent
                          ? <input type="date" className="field !h-9 !w-36 !py-1 print:hidden" value={i.data_pagamento} onChange={(e) => e.target.value && update(i, { data_pagamento: e.target.value })} />
                          : null}<span className={i.data_pagamento && !ent ? "hidden print:inline" : ""}>{fmtBR(i.data_pagamento)}</span></td>
                        <td>{i.data_pagamento && !ent
                          ? <input className="field !h-9 !w-24 !py-1 print:hidden" inputMode="decimal" defaultValue={String(i.valor_pago ?? i.valor).replace(".", ",")} onBlur={(e) => update(i, { valor_pago: parseNum(e.target.value) })} />
                          : null}<span className={i.data_pagamento && !ent ? "hidden print:inline" : ""}>{i.valor_pago != null ? brl(i.valor_pago) : "—"}</span></td>
                        <td>{i.data_pagamento && !ent
                          ? <select className="field !h-9 !w-28 !py-1 print:hidden" value={i.forma_pagamento} onChange={(e) => update(i, { forma_pagamento: e.target.value })}>{FORMAS.map((f) => <option key={f}>{f}</option>)}</select>
                          : null}<span className={i.data_pagamento && !ent ? "hidden print:inline" : ""}>{i.forma_pagamento || "—"}</span></td>
                        <td><span className={`rounded-full px-2 py-0.5 text-xs ${stColor[st.s]}`}>{st.s}{st.s === "atrasado" ? ` · ${st.dias}d` : ""}</span></td>
                        <td className="print:hidden">{!ent && <button className="text-xs text-acid hover:underline" onClick={() => togglePaid(i)}>{i.data_pagamento ? "Desfazer" : "Marcar pago"}</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg bg-ground p-3"><div className="text-xs text-dim">{k}</div><div className="font-semibold tabular-nums">{v}</div></div>;
}
