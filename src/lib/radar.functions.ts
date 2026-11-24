import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { quantile, type RadarOffer, type RadarSettings } from "./radar";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };
async function admin(context: unknown) {
  const ctx = context as Ctx;
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Acesso restrito ao administrador");
  return ctx.supabase;
}
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); };

export type RadarResult = { product_row: number; consulta: string; ofertas: RadarOffer[]; analyzed_at: string };
export type RadarSnapshot = { product_row: number; created_at: string; menor: number | null; mediana: number | null; n: number; meu_preco: number };

export const getRadar = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const sb = await admin(context);
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const [s, r, h, u] = await Promise.all([
    sb.from("radar_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("radar_results").select("*"),
    sb.from("radar_snapshots").select("product_row,created_at,menor,mediana,n,meu_preco").gte("created_at", since).order("created_at"),
    sb.from("radar_usage").select("consultas").gte("created_at", monthStart()),
  ]);
  const num = (v: unknown) => Number(v ?? 0);
  const st = s.data ?? {};
  const settings: RadarSettings = { estrategia: st.estrategia ?? "mediana", delta_menor: num(st.delta_menor ?? 50), lucro_min: num(st.lucro_min ?? 500), imposto: num(st.imposto ?? 1.5), frete: num(st.frete ?? 20), folga: num(st.folga ?? 5), limite: num(st.limite ?? 20) };
  return {
    settings,
    results: (r.data ?? []) as RadarResult[],
    snapshots: ((h.data ?? []) as RadarSnapshot[]).map((x) => ({ ...x, menor: x.menor == null ? null : Number(x.menor), mediana: x.mediana == null ? null : Number(x.mediana), meu_preco: Number(x.meu_preco) })),
    usoMes: ((u.data ?? []) as { consultas: number }[]).reduce((a, b) => a + b.consultas, 0),
    temChave: !!process.env["SERPAPI_API_KEY"],
  };
});

export const saveRadarSettings = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    estrategia: z.enum(["mediana", "abaixo5", "menor"]), delta_menor: z.number().min(0).max(100000), lucro_min: z.number().min(0).max(1e6),
    imposto: z.number().min(0).max(99), frete: z.number().min(0).max(1e5), folga: z.number().min(0).max(90), limite: z.number().int().min(1).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin(context);
    const { error } = await sb.from("radar_settings").upsert({ id: 1, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const classifySchema = {
  type: "object", additionalProperties: false, required: ["itens"],
  properties: { itens: { type: "array", items: { type: "object", additionalProperties: false, required: ["i", "mesmo_modelo", "condicao", "acessorio"],
    properties: { i: { type: "integer" }, mesmo_modelo: { type: "boolean" }, condicao: { type: "string", enum: ["novo", "usado", "cpo", "vitrine"] }, acessorio: { type: "boolean" } } } } },
};

async function classify(produto: string, items: { titulo: string; condicao: string }[]) {
  const { callStructuredAi } = await import("./ai.server");
  const parsed = await callStructuredAi<{
    itens: { i: number; mesmo_modelo: boolean; condicao: string; acessorio: boolean }[];
  }>({
    instructions: `Você classifica ofertas do Google Shopping. Para cada oferta diga: mesmo_modelo = true só se for exatamente o mesmo modelo E o mesmo armazenamento do produto de referência (cor não importa); condicao (novo, usado, cpo = recondicionado/seminovo certificado, vitrine = mostruário/open box); acessorio = true se for capa, película, tela, bateria, peça, cabo ou qualquer item que não seja o aparelho.`,
    input: `Produto de referência: ${produto}\n\nOfertas:\n${items.map((x, i) => `${i}. ${x.titulo}${x.condicao ? ` [${x.condicao}]` : ""}`).join("\n")}`,
    schemaName: "ofertas",
    schema: classifySchema,
    errorLabel: "A IA não conseguiu classificar as ofertas",
  });
  return parsed.itens ?? [];
}

export const analyzeProduct = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ row: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin(context);
    const serp = process.env["SERPAPI_API_KEY"];
    if (!serp) throw new Error("Chave da busca de preços não configurada");
    const { data: p } = await sb.from("products").select("row,modelo,venda").eq("row", data.row).maybeSingle();
    if (!p) throw new Error("Produto não encontrado");
    // Name + storage only; color (variacao) is left out of the search.
    const consulta = String(p.modelo).replace(/\b(e-?sim|chip f[ií]sico)\b/gi, "").replace(/\s+/g, " ").trim();
    const url = `https://serpapi.com/search.json?engine=google_shopping&gl=br&hl=pt-br&google_domain=google.com.br&num=40&q=${encodeURIComponent(consulta)}&api_key=${serp}`;
    const res = await fetch(url);
    await sb.from("radar_usage").insert({ consultas: 1 });
    if (!res.ok) { const t = await res.text(); console.error(`SerpApi [${res.status}]: ${t}`); throw new Error(`Erro na busca de preços [${res.status}]`); }
    const json = await res.json() as { shopping_results?: { title?: string; source?: string; extracted_price?: number; product_link?: string; link?: string; second_hand_condition?: string }[] };
    const raw = (json.shopping_results ?? []).filter((x) => x.title && Number(x.extracted_price) > 0).slice(0, 30)
      .map((x) => {
        const candidateLink = x.product_link ?? x.link ?? "";
        const safeLink = /^https?:\/\//i.test(candidateLink) ? candidateLink : "";
        return { loja: x.source ?? "", titulo: x.title!, preco: Number(x.extracted_price), link: safeLink, condicao: x.second_hand_condition ?? "" };
      });
    let ofertas: RadarOffer[] = [];
    if (raw.length) {
      const cls = await classify(p.modelo, raw);
      const cpo = /\bcpo\b/i.test(p.modelo);
      ofertas = cls.filter((c) => raw[c.i] && c.mesmo_modelo && !c.acessorio && (cpo ? c.condicao === "cpo" : c.condicao === "novo"))
        .map((c) => ({ ...raw[c.i]!, condicao: c.condicao, suspeito: false })).slice(0, 10);
      const sorted = ofertas.map((o) => o.preco).sort((a, b) => a - b);
      const med = quantile(sorted, 0.5);
      ofertas = ofertas.map((o) => ({ ...o, suspeito: o.preco < med * 0.6 }));
    }
    const valid = ofertas.filter((o) => !o.suspeito).map((o) => o.preco).sort((a, b) => a - b);
    const mediana = valid.length ? quantile(valid, 0.5) : null;
    const now = new Date().toISOString();
    await sb.from("radar_results").upsert({ product_row: p.row, consulta, ofertas, analyzed_at: now });
    await sb.from("radar_snapshots").insert({ product_row: p.row, menor: valid[0] ?? null, mediana, n: valid.length, meu_preco: Number(p.venda) });
    await sb.from("radar_snapshots").delete().lt("created_at", new Date(Date.now() - 90 * 864e5).toISOString());
    return { ok: true, n: valid.length };
  });

export const applySuggestedPrices = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ itens: z.array(z.object({ row: z.number().int(), venda: z.number().positive().max(1e7) })).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin(context);
    for (const it of data.itens) {
      const { error } = await sb.from("products").update({ venda: it.venda, updated_at: new Date().toISOString() }).eq("row", it.row);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
