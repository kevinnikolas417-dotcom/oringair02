import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_SHEET_ID = "1huxhMTbeokws8sTU9W0LOw65vRRRt8DBhPh_nGqhw-8";
const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4";

async function sheets(path: string, init?: RequestInit) {
  const sheetId = process.env["GOOGLE_SHEETS_ID"] || DEFAULT_SHEET_ID;
  const accessToken = process.env["GOOGLE_SHEETS_ACCESS_TOKEN"];
  const apiKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!accessToken && !apiKey) {
    throw new Error("Planilha não configurada. Defina GOOGLE_SHEETS_ACCESS_TOKEN ou GOOGLE_SHEETS_API_KEY na Vercel.");
  }
  const sep = path.includes("?") ? "&" : "?";
  const url = `${GOOGLE_SHEETS_API}/spreadsheets/${sheetId}${path}${!accessToken && apiKey ? `${sep}key=${encodeURIComponent(apiKey)}` : ""}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Sheets error [${res.status}]: ${body}`);
    throw new Error(`Erro na planilha [${res.status}]: ${body}`);
  }
  return res.json();
}

type AuthCtx = { supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "vendedor" }) => PromiseLike<{ data: boolean | null }> }; userId: string };
// Store data (costs, clients) is admin-only; sellers never reach it.
async function assertAdmin(ctx: AuthCtx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Acesso restrito ao administrador");
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export type Product = { row: number; modelo: string; variacao: string; custo: number; venda: number; estoque: number; foto: string; fotoRef: string; lucroTipo: "fixo" | "margem"; lucro: number; categoria: string; categoriaPai: string; destaque: boolean; variants: Variant[] };
// Admin-only: color variants with their own cost, profit and price.
export type Variant = { cor: string; corHex: string; custo: number; lucro: number; preco: number; imagem: string | null; disponivel: boolean };
export type Client = {
  row: number; nome: string; cpf: string; telefone: string; email: string; cep: string;
  endereco: string; bairro: string; cidade: string; uf: string; valor: number; pagamento: string; parcelas: string;
  pagas: number; entrada: number;
};

// Products live in the Cloud database (public.products, admin-only RLS); "row" keeps the old sheet row ids.
type ProductRow = { row: number; modelo: string; variacao: string; custo: number; venda: number; estoque: number; foto: string; lucro_tipo: string; lucro: number; categoria: string; categoria_pai: string; destaque: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbCtx = { supabase: any };

export const listProducts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<Product[]> => {
  await assertAdmin(context as unknown as AuthCtx);
  const { data, error } = await (context as unknown as DbCtx).supabase.from("products").select("*").order("row");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ProductRow[];
  const { resolvePhotos, photoUrl } = await import("./catalog.server");
  const m = await resolvePhotos(rows.map((r) => r.foto));
  const { data: vs, error: ve } = await (context as unknown as DbCtx).supabase.from("product_variants").select("*").order("ordem");
  if (ve) throw new Error(ve.message);
  const byProd = new Map<number, Variant[]>();
  for (const v of (vs ?? []) as { product_id: number; cor: string; cor_hex: string; custo: number; lucro: number; preco_venda: number; imagem_url: string | null; disponivel: boolean }[]) {
    const l = byProd.get(v.product_id) ?? []; l.push({ cor: v.cor, corHex: v.cor_hex, custo: Number(v.custo), lucro: Number(v.lucro), preco: Number(v.preco_venda), imagem: v.imagem_url, disponivel: v.disponivel }); byProd.set(v.product_id, l);
  }
  return rows.map((r) => ({ variants: byProd.get(r.row) ?? [],
    row: r.row, modelo: r.modelo, variacao: r.variacao, custo: Number(r.custo), venda: Number(r.venda), estoque: Number(r.estoque),
    foto: photoUrl(r.foto, m), fotoRef: r.foto, lucroTipo: r.lucro_tipo === "margem" ? "margem" : "fixo", lucro: Number(r.lucro),
    categoria: r.categoria, categoriaPai: r.categoria_pai, destaque: !!r.destaque,
  }));
});

const safePhotoRef = z
  .string()
  .max(60000)
  .refine(
    (v) =>
      v === "" ||
      v.startsWith("sb:") ||
      /^https:\/\/[^\s]+$/i.test(v) ||
      /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(v),
    "Referência de foto inválida",
  );

const productSchema = z.object({
  row: z.number().int().min(2).optional(),
  modelo: z.string().min(1).max(200), variacao: z.string().max(200),
  custo: z.number(), venda: z.number(), estoque: z.number().int(),
  foto: safePhotoRef,
  lucroTipo: z.enum(["fixo", "margem"]), lucro: z.number(), categoria: z.string().max(100).default(""), categoriaPai: z.string().max(100).default(""), destaque: z.boolean().optional(),
  fromImport: z.boolean().optional(),
  previousCusto: z.number().optional(),
  previousVenda: z.number().optional(),
  variants: z.array(z.object({ cor: z.string().min(1).max(60), corHex: z.string().regex(/^#[0-9a-fA-F]{6}$/), custo: z.number().min(0), lucro: z.number(), preco: z.number().min(0), imagem: z.string().max(2000).nullable(), disponivel: z.boolean() })).max(50).optional(),
});

export const saveProduct = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => productSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthCtx);
    const db = (context as unknown as DbCtx).supabase;
    const now = new Date().toISOString();
    const v = { modelo: data.modelo, variacao: data.variacao, custo: data.custo, venda: data.venda, estoque: data.estoque, foto: data.foto,
      lucro_tipo: data.lucroTipo, lucro: data.lucro, categoria: data.categoria, categoria_pai: data.categoriaPai,
      ...(data.destaque !== undefined ? { destaque: data.destaque } : {}),
      ...(data.fromImport ? { last_import_at: now } : {}),
      ...(data.previousCusto !== undefined ? { previous_custo: data.previousCusto } : {}),
      ...(data.previousVenda !== undefined ? { previous_venda: data.previousVenda } : {}),
      updated_at: now };
    const res = data.row ? await db.from("products").update(v).eq("row", data.row).select('"row"').single() : await db.from("products").insert(v).select('"row"').single();
    if (res.error) throw new Error(res.error.message);
    const id = res.data.row as number;
    if (data.variants) {
      const d = await db.from("product_variants").delete().eq("product_id", id);
      if (d.error) throw new Error(d.error.message);
      if (data.variants.length) {
        const ins = await db.from("product_variants").insert(data.variants.map((x, i) => ({ product_id: id, cor: x.cor, cor_hex: x.corHex, custo: x.custo, lucro: x.lucro, preco_venda: x.preco, imagem_url: x.imagem, disponivel: x.disponivel, ordem: i })));
        if (ins.error) throw new Error(ins.error.message);
      }
    }
    return { ok: true, row: id };
  });

// Row ids come from a sequence and are never reused, so seller catalogs / sent links stay correct.
export const deleteProduct = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ row: z.number().int().min(2) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthCtx);
    const { error } = await (context as unknown as DbCtx).supabase.from("products").delete().eq("row", data.row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listClients = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<Client[]> => {
  await assertAdmin(context as unknown as AuthCtx);
  const data = await sheets(`/values/Clientes!A2:N?valueRenderOption=UNFORMATTED_VALUE`);
  const rows: unknown[][] = data.values ?? [];
  return rows
    .map((r, i) => {
      const s = (k: number) => String(r[k] ?? "");
      return {
        row: i + 2, nome: s(0), cpf: s(1), telefone: s(2), email: s(3), cep: s(4), endereco: s(5),
        bairro: s(6), cidade: s(7), uf: s(8), valor: num(r[9]), pagamento: s(10), parcelas: s(11), pagas: num(r[12]), entrada: num(r[13]),
      };
    })
    .filter((c) => c.nome);
});

const clientSchema = z.object({
  row: z.number().int().min(2).optional(),
  nome: z.string().min(1).max(200), cpf: z.string().min(11).max(20), telefone: z.string().min(10).max(20),
  email: z.string().max(200), cep: z.string().min(8).max(10), endereco: z.string().max(300),
  bairro: z.string().max(200), cidade: z.string().max(200), uf: z.string().max(2),
  valor: z.number(), pagamento: z.string().max(30), parcelas: z.string().max(10), pagas: z.number().int().min(0).max(99),
  entrada: z.number().min(0).default(0),
});

export const saveClient = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => clientSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthCtx);
    const v = [[data.nome, data.cpf, data.telefone, data.email, data.cep, data.endereco, data.bairro,
      data.cidade, data.uf, data.valor, data.pagamento, data.parcelas, data.pagas, data.entrada]];
    if (data.row) {
      await sheets(`/values/Clientes!A${data.row}:N${data.row}?valueInputOption=RAW`, {
        method: "PUT", body: JSON.stringify({ values: v }),
      });
    } else {
      const r = await sheets(`/values/Clientes!A:N:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: "POST", body: JSON.stringify({ values: v }),
      });
      const m = /![A-Z]+(\d+)/.exec(String(r?.updates?.updatedRange ?? ""));
      return { ok: true, row: m ? Number(m[1]) : undefined };
    }
    return { ok: true, row: data.row };
  });

const paidSchema = z.object({ row: z.number().int().min(2), pagas: z.number().int().min(0).max(99) });
export const setPaidInstallments = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => paidSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthCtx);
    await sheets(`/values/Clientes!M${data.row}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [[data.pagas]] }) });
    return { ok: true };
  });

// Public storefront: no login. Returns ONLY photo, model and sale price — never cost/profit/margin/tax.
export type PublicProduct = { row: number; modelo: string; venda: number; foto: string; cor: string; categoria: string; categoriaPai: string; destaque: boolean; disponivel: boolean };
const publicSchema = z.object({ rows: z.array(z.number().int().min(2).max(100000)).min(1).max(200) });
export const listPublicProducts = createServerFn({ method: "POST" })
  .inputValidator((d) => publicSchema.parse(d))
  .handler(async ({ data }): Promise<PublicProduct[]> => fetchPublic(data.rows));

async function fetchPublic(wantedRows: number[], pais?: string[] | null): Promise<PublicProduct[]> {
  const { fetchSaleProducts } = await import("./catalog.server");
  return (await fetchSaleProducts(wantedRows, pais)).map((p) => ({ row: p.row, modelo: p.modelo, venda: p.venda, foto: p.foto, cor: p.cor, categoria: p.categoria, categoriaPai: p.categoriaPai, destaque: p.destaque, disponivel: p.disponivel }));
}

// Public seller storefront: only seller name/WhatsApp, rates and photo/model/price.
export type Banner = { id: string; imagem_url: string; titulo: string; subtitulo: string; link_tipo: string; link_valor: string };
export const getSellerStorefront = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin.from("sellers").select("id, nome, whatsapp, rates, product_rows, categorias, active, banner_modo").eq("slug", data.slug.toLowerCase()).maybeSingle();
    if (!s || !s.active) return null;
    const products = s.product_rows.length ? await fetchPublic(s.product_rows, s.categorias) : [];
    // Seller's own active in-period banners when in "proprios" mode, otherwise the default ones.
    const now = new Date().toISOString();
    const load = async (sellerId: string | null) => {
      let q = supabaseAdmin.from("banners").select("id, imagem_url, titulo, subtitulo, link_tipo, link_valor")
        .eq("ativo", true).or(`inicio.is.null,inicio.lte.${now}`).or(`fim.is.null,fim.gte.${now}`).order("ordem");
      q = sellerId ? q.eq("vendedor_id", sellerId) : q.is("vendedor_id", null);
      return ((await q).data ?? []) as Banner[];
    };
    let banners = s.banner_modo === "proprios" ? await load(s.id) : [];
    if (!banners.length) banners = await load(null);
    const { resolvePhotos, photoUrl } = await import("./catalog.server");
    const m = await resolvePhotos(banners.map((b) => b.imagem_url));
    banners = banners.map((b) => ({ ...b, imagem_url: photoUrl(b.imagem_url, m) }));
    return { nome: s.nome, whatsapp: s.whatsapp.replace(/\D/g, ""), rates: s.rates, products, banners };
  });
