// Server-only product store (Lovable Cloud database + private photo storage).
// Photos are stored as "sb:<path>" (storage object) or a legacy data: URL and resolved to signed URLs here.
export const PHOTO_BUCKET = "product-photos";
const PHOTO_TTL = 60 * 60 * 24 * 7; // 7 days

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function resolvePhotos(refs: string[]): Promise<Map<string, string>> {
  const paths = [...new Set(refs.filter((r) => r.startsWith("sb:")).map((r) => r.slice(3)))];
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data } = await (await admin()).storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_TTL);
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(`sb:${d.path}`, d.signedUrl);
  return out;
}
export const photoUrl = (ref: string, m: Map<string, string>) => (ref.startsWith("sb:") ? m.get(ref) ?? "" : ref);

export type SaleProduct = { row: number; modelo: string; cor: string; venda: number; foto: string; categoria: string; categoriaPai: string; destaque: boolean; disponivel: boolean };

// Sale-facing fields only — never cost/profit/margin/tax.
// Seller category restriction: empty list = all parent categories allowed.
export const allowedByCategory = (categoriaPai: string, pais?: string[] | null) =>
  !pais || !pais.length || pais.some((c) => c.trim().toLowerCase() === categoriaPai.trim().toLowerCase());

export async function fetchSaleProducts(wantedRows?: number[], pais?: string[] | null): Promise<SaleProduct[]> {
  if (wantedRows && !wantedRows.length) return [];
  let q = (await admin()).from("products").select('"row", modelo, variacao, venda, foto, categoria, categoria_pai, destaque, estoque').order("row");
  if (wantedRows) q = q.in("row", wantedRows);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const m = await resolvePhotos((data ?? []).filter((p) => allowedByCategory(p.categoria_pai, pais)).map((p) => p.foto));
  const rows = (data ?? []).filter((p) => allowedByCategory(p.categoria_pai, pais));
  return rows.map((p) => ({
    row: p.row, modelo: [p.modelo, p.variacao].filter(Boolean).join(" · "), cor: p.variacao.trim(), venda: Number(p.venda),
    foto: photoUrl(p.foto, m), categoria: p.categoria.trim(), categoriaPai: p.categoria_pai.trim(),
    destaque: !!p.destaque, disponivel: Number(p.estoque) > 0,
  }));
}
