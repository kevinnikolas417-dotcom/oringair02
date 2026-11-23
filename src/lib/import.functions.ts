import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProductAlias } from "./product-matching";

export type ParsedItem = { nome: string; cores: string; custo: number; categoria: string; subcategoria: string; incerto: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminCtx = { supabase: any; userId: string };

async function assertAdmin(context: unknown): Promise<AdminCtx> {
  const ctx = context as AdminCtx;
  const { data: ok } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!ok) throw new Error("Acesso restrito ao administrador");
  return ctx;
}

const schema = {
  type: "object", additionalProperties: false, required: ["itens"],
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["nome", "cores", "custo", "categoria", "subcategoria", "incerto"],
        properties: {
          nome: { type: "string" }, cores: { type: "string" }, custo: { type: "number" },
          categoria: { type: "string" }, subcategoria: { type: "string" }, incerto: { type: "boolean" },
        },
      },
    },
  },
};

const rules = `Você extrai produtos de listas de fornecedores de eletrônicos (mensagens de WhatsApp).
DESCARTE: telefones, nomes de loja, saudações, datas, logística, condições de compra, prazos, garantia do fornecedor, contatos.
Formato: uma linha iniciada por emoji (📲 ⌚️ 💻 🎧 🖱️ 🖊️ 🎯 etc.) inicia um modelo. Linhas de texto simples abaixo são cores/variações. Cada preço (💰*R$...* ou *R$...*) vale para as cores listadas logo acima dele, desde o preço anterior. Mesmo modelo com preços diferentes por cor gera itens separados, cada um com suas cores (ex.: "17 Pro Max 512gb E-sim / Laranja / R$ 8.100 / Branco / Azul / R$ 8.350" → item Laranja 8100 e item "Branco, Azul" 8350).
Seção Acessórios: nome e depois preço; ignore textos entre parênteses sobre garantia.
nome: modelo completo com especificações (armazenamento, memória, tela, conectividade, condição), mantendo "E-sim" e "CPO"; inclua a marca/linha quando óbvia (ex.: "iPhone 17 Pro Max 512GB E-sim"). cores: cores separadas por vírgula ("" se nenhuma).
custo: número em reais ("R$ 9.700,00" → 9700).
categoria (categoria pai, ex.: Celulares, Relógios, Notebooks e Mac, Tablets, Áudio, Acessórios) e subcategoria (ex.: iPhone 17, Apple Watch Ultra, MacBook Neo, AirPods, Cabos e fontes). Prefira as categorias existentes informadas; crie nova só se nenhuma servir.
incerto: true se a leitura do item (nome ou preço) for duvidosa.`;

export const parseSupplierList = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    texto: z.string().min(5).max(30000),
    categorias: z.array(z.string().max(100)).max(200),
    subcategorias: z.array(z.string().max(100)).max(500),
    modelosExistentes: z.array(z.string().max(200)).max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<ParsedItem[]> => {
    await assertAdmin(context);
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("IA não configurada");
    const modelosHint = data.modelosExistentes?.length
      ? `\nModelos já cadastrados no banco (prefira manter exatamente estes nomes quando o item da lista for o mesmo produto): ${data.modelosExistentes.slice(0, 250).join(" | ")}`
      : "";
    // The original message is only sent to the model; it is never stored.
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra", stream: true, store: false, reasoning: { effort: "low" },
        instructions: rules,
        input: `Categorias existentes: ${data.categorias.join(", ") || "(nenhuma)"}\nSubcategorias existentes: ${data.subcategorias.join(", ") || "(nenhuma)"}${modelosHint}\n\nLISTA:\n${data.texto}`,
        text: { format: { type: "json_schema", name: "lista", strict: true, schema } },
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text();
      console.error(`AI error [${res.status}]: ${body}`);
      if (res.status === 429) throw new Error("Muitas solicitações à IA. Aguarde um pouco e tente de novo.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Erro na IA [${res.status}]`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const p = line.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        try {
          const ev = JSON.parse(p);
          if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
          if (ev.type === "response.failed" || ev.type === "error") throw new Error("A IA não conseguiu ler a lista");
        } catch (e) { if (e instanceof Error && e.message.startsWith("A IA")) throw e; }
      }
    }
    try {
      const itens = (JSON.parse(out) as { itens: ParsedItem[] }).itens;
      return itens.filter((x) => x.nome && x.custo > 0);
    } catch { throw new Error("A IA não retornou uma lista válida"); }
  });

export const listProductAliases = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProductAlias[]> => {
    const ctx = await assertAdmin(context);
    const { data, error } = await ctx.supabase
      .from("product_aliases")
      .select("alias_key, product_row, raw_nome, raw_cores");
    if (error) {
      // Gracefully return empty if migration hasn't been applied yet
      console.warn("product_aliases unavailable:", error.message);
      return [];
    }
    return ((data ?? []) as { alias_key: string; product_row: number; raw_nome: string; raw_cores: string }[]).map((r) => ({
      aliasKey: r.alias_key,
      productRow: Number(r.product_row),
      rawNome: r.raw_nome ?? "",
      rawCores: r.raw_cores ?? "",
    }));
  });

const importMetadataSchema = z.object({
  aliases: z.array(z.object({
    aliasKey: z.string().min(1).max(300),
    productRow: z.number().int().min(2),
    rawNome: z.string().max(200),
    rawCores: z.string().max(200),
  })).max(500),
  history: z.array(z.object({
    productRow: z.number().int().min(2),
    custoAnterior: z.number(),
    custoNovo: z.number(),
    vendaAnterior: z.number(),
    vendaNovo: z.number(),
  })).max(500),
});

export const saveImportMetadata = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => importMetadataSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await assertAdmin(context);
    const now = new Date().toISOString();
    if (data.aliases.length) {
      // Deduplicate by aliasKey (last one wins)
      const dedup = new Map(data.aliases.map((a) => [a.aliasKey, a]));
      const rows = [...dedup.values()].map((a) => ({
        alias_key: a.aliasKey,
        product_row: a.productRow,
        raw_nome: a.rawNome,
        raw_cores: a.rawCores,
        updated_at: now,
      }));
      const { error } = await ctx.supabase.from("product_aliases").upsert(rows, { onConflict: "alias_key" });
      if (error) console.warn("product_aliases upsert warning:", error.message);
    }
    const changed = data.history.filter((h) => h.custoAnterior !== h.custoNovo || h.vendaAnterior !== h.vendaNovo);
    if (changed.length) {
      const { error } = await ctx.supabase.from("product_price_history").insert(
        changed.map((h) => ({
          product_row: h.productRow,
          custo_anterior: h.custoAnterior,
          custo_novo: h.custoNovo,
          venda_anterior: h.vendaAnterior,
          venda_novo: h.vendaNovo,
          origem: "import",
        })),
      );
      if (error) console.warn("product_price_history insert warning:", error.message);
    }
    return { ok: true };
  });
