import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { acceptPublicQuote, getPublicQuote } from "@/lib/quotes.functions";
import { brl } from "@/lib/format";
import { cardOptionsFrom } from "@/lib/rates";

export const Route = createFileRoute("/orcamento/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ pdf: s["pdf"] ? 1 : undefined }),
  head: () => ({
    meta: [
      { title: "Seu orçamento — celulares" },
      { name: "description", content: "Orçamento personalizado com produtos, valores, Pix e parcelas no cartão." },
      { property: "og:title", content: "Seu orçamento" },
      { property: "og:description", content: "Confira os produtos, valores e validade do seu orçamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicQuote,
});

function PublicQuote() {
  const { id } = Route.useParams();
  const { pdf } = Route.useSearch();
  const fetchQ = useServerFn(getPublicQuote);
  const accept = useServerFn(acceptPublicQuote);
  const q = useQuery({ queryKey: ["orcamento", id], queryFn: () => fetchQ({ data: { id } }) });
  const d = q.data;
  useEffect(() => { if (pdf && d) setTimeout(() => window.print(), 400); }, [pdf, d]);
  if (q.isLoading) return <div className="grid min-h-screen place-items-center bg-ground font-mono text-xs text-dim">Carregando…</div>;
  if (!d) return <div className="grid min-h-screen place-items-center bg-ground font-mono text-xs text-dim">Orçamento não encontrado.</div>;
  const total = d.items.reduce((s, i) => s + i.preco * i.qtd, 0);
  const entrada = Math.min(d.entrada ?? 0, total);
  const saldo = Math.max(0, total - entrada);
  const expired = d.status !== "aceito" && d.validade < new Date().toISOString().slice(0, 10);
  const validade = d.validade.split("-").reverse().join("/");
  const onAccept = async () => {
    await accept({ data: { id } }).catch(() => {});
    const entradaLinha = entrada > 0 ? `\nEntrada: ${brl(entrada)}\nSaldo: ${brl(saldo)}` : "";
    const msg = `Olá, ${d.vendedor}! Aceito o orçamento:${entradaLinha}\n${d.items.map((i) => `• ${i.qtd}× ${i.modelo} — ${brl(i.preco * i.qtd)}`).join("\n")}\nTotal: ${brl(total)}\nCliente: ${d.cliente_nome}`;
    window.open(`https://wa.me/${d.whatsapp.startsWith("55") ? d.whatsapp : `55${d.whatsapp}`}?text=${encodeURIComponent(msg)}`, "_blank");
  };
  return (
    <div className="print-modal min-h-screen bg-ground text-ink">
      <div id="proposta" className="mx-auto max-w-[560px] px-4 py-8">
        <p className="text-xs text-dim">Orçamento para</p>
        <h1 className="text-[26px] font-semibold tracking-tight">{d.cliente_nome}</h1>
        <p className="mt-1 text-sm text-dim">Vendedor: {d.vendedor} · válido até {validade}{expired && " · expirado"}</p>
        <section className="mt-6 rounded-xl bg-panel p-4">
          {d.items.map((i, k) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                {i.foto
                  ? <img src={i.foto} alt={i.modelo} width={56} height={56} className="size-14 shrink-0 rounded-lg object-cover" />
                  : <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-panel2 text-center text-[10px] leading-tight text-dim">sem foto</div>}
                <span className="min-w-0">{i.qtd}× {i.modelo}<span className="block text-xs text-dim">{brl(i.preco)} cada</span></span>
              </div>
              <b className="shrink-0 tabular-nums">{brl(i.preco * i.qtd)}</b>
            </div>
          ))}
        </section>
        <section className="mt-4 rounded-xl bg-panel p-4">
          <div className="text-xs text-dim">Pix · à vista</div>
          {entrada > 0 ? (
            <>
              <div className="mt-1 grid gap-1 text-sm tabular-nums">
                <div className="flex justify-between"><span>Valor de entrada</span><b>{brl(entrada)}</b></div>
                <div className="flex justify-between"><span>Saldo restante</span><b className="text-acid">{brl(saldo)}</b></div>
              </div>
              <div className="mt-2 text-xs text-dim">Valor total: {brl(total)}</div>
            </>
          ) : (
            <div className="text-2xl font-semibold tabular-nums text-acid">{brl(total)}</div>
          )}
          <div className="mt-3 grid gap-1.5 text-sm">
            {cardOptionsFrom(entrada > 0 ? saldo : total, d.rates).map((o) => (
              <div key={o.n} className="flex justify-between tabular-nums"><span>{o.n}x de {brl(o.parcela)}</span><span className="text-dim">total {brl(o.total)}</span></div>
            ))}
            {entrada > 0 && <p className="text-xs text-dim">parcelas sobre o saldo após a entrada de {brl(entrada)}</p>}
          </div>
        </section>
        {d.observacoes && <section className="mt-4 whitespace-pre-wrap rounded-xl bg-panel p-4 text-sm"><div className="mb-1 text-xs text-dim">Observações</div>{d.observacoes}</section>}
        {!expired && d.whatsapp && <button className="btn-acid no-print mt-6 w-full" onClick={onAccept}>Aceitar pelo WhatsApp</button>}
        {d.status === "aceito" && <p className="mt-3 text-center text-sm text-success">Orçamento aceito</p>}
      </div>
    </div>
  );
}
