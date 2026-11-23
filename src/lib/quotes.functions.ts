import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchSaleProducts } from "./catalog.server";
import { normalizeEntrada } from "./quote-entrada";
import { serializeRates } from "@/lib/rates";

// Seller-facing data: sale price + admin-defined minimum only. Never cost/profit/margin/tax.
export type SellerProduct = { row: number; modelo: string; venda: number; minimo: number; foto: string };
export type QuoteItem = { row: number; modelo: string; qtd: number; preco: number };
export type Quote = {
  id: string; cliente_nome: string; cliente_whatsapp: string; items: QuoteItem[]; observacoes: string;
  validade: string; status: "enviado" | "aceito"; rates: string; created_at: string; vendedor?: string; entrada: number;
};

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
const isAdmin = async (ctx: Ctx) => !!(await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" })).data;
async function mySeller(ctx: Ctx) {
  const { data } = await ctx.supabase.from("sellers").select("id, nome, whatsapp, rates, product_rows, categorias, active").eq("user_id", ctx.userId).maybeSingle();
  if (!data || !data.active) throw new Error("Acesso de vendedor não liberado");
  return data as { id: string; nome: string; whatsapp: string; rates: string; product_rows: number[]; categorias: string[] };
}
async function withMinimums(ctx: Ctx, rows: number[], pais?: string[]): Promise<SellerProduct[]> {
  if (!rows.length) return [];
  const [products, mins] = await Promise.all([
    fetchSaleProducts(rows, pais),
    ctx.supabase.from("product_min_prices").select("product_row, min_price").in("product_row", rows),
  ]);
  const m = new Map<number, number>((mins.data ?? []).map((x: { product_row: number; min_price: number }) => [x.product_row, Number(x.min_price)]));
  return products.map((p) => ({ row: p.row, modelo: p.modelo, venda: p.venda, foto: p.foto, minimo: m.get(p.row) ?? p.venda }));
}

export const getSellerProducts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const s = await mySeller(ctx);
    return { rates: s.rates, products: await withMinimums(ctx, s.product_rows, s.categorias) };
  });

const itemSchema = z.object({ row: z.number().int().min(2), qtd: z.number().int().min(1).max(999), preco: z.number().positive().max(10_000_000) });
export const createQuote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    cliente_nome: z.string().trim().min(1).max(120),
    cliente_whatsapp: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().min(10).max(13)),
    items: z.array(itemSchema).min(1).max(30),
    observacoes: z.string().max(1000).default(""),
    validade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    entrada: z.number().min(0).max(10_000_000).default(0),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const s = await mySeller(ctx);
    const products = await withMinimums(ctx, s.product_rows, s.categorias);
    const byRow = new Map(products.map((p) => [p.row, p]));
    const items: QuoteItem[] = data.items.map((i) => {
      const p = byRow.get(i.row);
      if (!p) throw new Error("Produto fora do seu catálogo");
      if (i.preco < p.minimo - 0.005) throw new Error(`Abaixo do valor mínimo: ${p.modelo}`);
      return { row: i.row, modelo: p.modelo, qtd: i.qtd, preco: Math.round(i.preco * 100) / 100 };
    });
    const totalGeral = items.reduce((s, i) => s + i.preco * i.qtd, 0);
    // Entrada abate do total: precisa deixar algo a pagar (mesma regra da promissória).
    const entrada = normalizeEntrada(data.entrada, totalGeral);
    const { data: q, error } = await ctx.supabase.from("quotes").insert({
      user_id: ctx.userId, seller_id: s.id, cliente_nome: data.cliente_nome, cliente_whatsapp: data.cliente_whatsapp,
      items, observacoes: data.observacoes, validade: data.validade, rates: serializeRates(s.rates), entrada,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: q.id as string };
  });

export const listQuotes = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Quote[]> => {
    const ctx = context as unknown as Ctx;
    // RLS: sellers only get their own rows; admin gets all.
    const { data, error } = await ctx.supabase.from("quotes").select("*, sellers(nome)").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((q: Quote & { sellers?: { nome: string } | null }) => ({ ...q, vendedor: q.sellers?.nome ?? "", sellers: undefined }));
  });

export const setQuoteStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(["enviado", "aceito"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase.from("quotes").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin: minimum price per product.
export const listMinPrices = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ row: number; min: number }[]> => {
    const ctx = context as unknown as Ctx;
    if (!(await isAdmin(ctx))) throw new Error("Acesso restrito ao administrador");
    const { data } = await ctx.supabase.from("product_min_prices").select("product_row, min_price");
    return (data ?? []).map((x: { product_row: number; min_price: number }) => ({ row: x.product_row, min: Number(x.min_price) }));
  });

export const setMinPrice = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ row: z.number().int().min(2), min: z.number().min(0).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    if (!(await isAdmin(ctx))) throw new Error("Acesso restrito ao administrador");
    const r = data.min === null
      ? await ctx.supabase.from("product_min_prices").delete().eq("product_row", data.row)
      : await ctx.supabase.from("product_min_prices").upsert({ product_row: data.row, min_price: data.min, updated_at: new Date().toISOString() });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });

// Public quote page (no login): client-facing fields + seller name/WhatsApp only.
export const getPublicQuote = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: q } = await supabaseAdmin.from("quotes")
      .select("id, cliente_nome, items, observacoes, validade, status, rates, created_at, entrada, sellers(nome, whatsapp)")
      .eq("id", data.id).maybeSingle();
    if (!q) return null;
    const s = q.sellers as unknown as { nome: string; whatsapp: string } | null;
    const items = q.items as unknown as QuoteItem[];
    // Photos come from the catalog, read server-side: the quote row itself never stores or exposes cost/profit.
    const photos = new Map<number, string>();
    try { for (const p of await fetchSaleProducts(items.map((i) => i.row))) photos.set(p.row, p.foto); } catch { /* photo is optional */ }
    return {
      id: q.id, cliente_nome: q.cliente_nome, items: items.map((i) => ({ ...i, foto: photos.get(i.row) ?? "" })), observacoes: q.observacoes,
      validade: q.validade, status: q.status, rates: q.rates, created_at: q.created_at, entrada: Number(q.entrada ?? 0),
      vendedor: s?.nome ?? "", whatsapp: (s?.whatsapp ?? "").replace(/\D/g, ""),
    };
  });

export const acceptPublicQuote = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    await supabaseAdmin.from("quotes").update({ status: "aceito" }).eq("id", data.id).gte("validade", today);
    return { ok: true };
  });
