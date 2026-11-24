import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminBanner = {
  id: string; vendedor_id: string | null; imagem_url: string; preview: string; titulo: string; subtitulo: string;
  link_tipo: "categoria" | "produto" | "url" | "nenhum"; link_valor: string; ordem: number; ativo: boolean; inicio: string | null; fim: string | null;
};
export type BannerSeller = { id: string; nome: string; slug: string; active: boolean; banner_modo: "padrao" | "proprios"; product_rows: number[] };

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function requireAdmin(context: unknown) {
  const ctx = context as Ctx;
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Acesso restrito ao administrador");
  return ctx.supabase;
}
const COLS = "id, vendedor_id, imagem_url, titulo, subtitulo, link_tipo, link_valor, ordem, ativo, inicio, fim";

export const listBannersAdmin = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ banners: AdminBanner[]; sellers: BannerSeller[] }> => {
    const db = await requireAdmin(context);
    const [{ data: b, error }, { data: s, error: e2 }] = await Promise.all([
      db.from("banners").select(COLS).order("ordem"),
      db.from("sellers").select("id, nome, slug, active, banner_modo, product_rows").order("nome"),
    ]);
    if (error || e2) throw new Error((error ?? e2).message);
    const { resolvePhotos, photoUrl } = await import("./catalog.server");
    const m = await resolvePhotos((b ?? []).map((x: AdminBanner) => x.imagem_url));
    return { banners: (b ?? []).map((x: AdminBanner) => ({ ...x, preview: photoUrl(x.imagem_url, m) })), sellers: s ?? [] };
  });

const safeBannerImg = z
  .string()
  .max(2000)
  .refine((v) => v === "" || v.startsWith("sb:") || /^https:\/\/[^\s]+$/i.test(v), "URL de imagem inválida");

const bannerSchema = z.object({
  id: z.string().uuid().optional(), vendedor_id: z.string().uuid().nullable(),
  imagem_url: safeBannerImg, titulo: z.string().max(120), subtitulo: z.string().max(200),
  link_tipo: z.enum(["categoria", "produto", "url", "nenhum"]), link_valor: z.string().max(500),
  ativo: z.boolean(), inicio: z.string().nullable(), fim: z.string().nullable(), ordem: z.number().int().optional(),
});

export const saveBanner = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => bannerSchema.parse(d))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    if (data.link_tipo === "url" && data.link_valor && !/^https?:\/\//.test(data.link_valor)) throw new Error("URL precisa começar com http:// ou https://");
    const { id, ...v } = data;
    if (id) {
      const { error } = await db.from("banners").update(v).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      let q = db.from("banners").select("ordem").order("ordem", { ascending: false }).limit(1);
      q = v.vendedor_id ? q.eq("vendedor_id", v.vendedor_id) : q.is("vendedor_id", null);
      const { data: last } = await q;
      const { error } = await db.from("banners").insert({ ...v, ordem: v.ordem ?? ((last?.[0]?.ordem ?? -1) + 1) });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// Deletes banners and removes their image files, unless another banner or product still uses the same file.
export const deleteBanners = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    const { data: rows, error: e0 } = await db.from("banners").select("id, imagem_url").in("id", data.ids);
    if (e0) throw new Error(e0.message);
    const { error } = await db.from("banners").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    const refs = [...new Set((rows ?? []).map((r: { imagem_url: string }) => r.imagem_url).filter((u: string) => u?.startsWith("sb:")))] as string[];
    if (refs.length) {
      const [{ data: stillB }, { data: stillP }] = await Promise.all([
        db.from("banners").select("imagem_url").in("imagem_url", refs),
        db.from("products").select("foto").in("foto", refs),
      ]);
      const used = new Set([...(stillB ?? []).map((x: { imagem_url: string }) => x.imagem_url), ...(stillP ?? []).map((x: { foto: string }) => x.foto)]);
      const paths = refs.filter((r) => !used.has(r)).map((r) => r.slice(3));
      if (paths.length) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.storage.from("product-photos").remove(paths);
      }
    }
    return { ok: true, count: rows?.length ?? 0 };
  });

export const reorderBanners = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    for (const [i, id] of data.ids.entries()) {
      const { error } = await db.from("banners").update({ ordem: i }).eq("id", id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setBannerMode = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sellerId: z.string().uuid(), modo: z.enum(["padrao", "proprios"]), copyDefaults: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    if (data.copyDefaults) {
      const { data: defs, error } = await db.from("banners").select(COLS).is("vendedor_id", null).order("ordem");
      if (error) throw new Error(error.message);
      if (defs?.length) {
        const rows = defs.map(({ id: _id, ...b }: AdminBanner) => ({ ...b, vendedor_id: data.sellerId })); // eslint-disable-line @typescript-eslint/no-unused-vars
        const { error: e2 } = await db.from("banners").insert(rows);
        if (e2) throw new Error(e2.message);
      }
    }
    const { error } = await db.from("sellers").update({ banner_modo: data.modo }).eq("id", data.sellerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateBanner = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), targets: z.array(z.string().uuid().nullable()).min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    const { data: b, error } = await db.from("banners").select(COLS).eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const { id: _id, ...rest } = b as AdminBanner; // eslint-disable-line @typescript-eslint/no-unused-vars
    const { error: e2 } = await db.from("banners").insert(data.targets.map((t) => ({ ...rest, vendedor_id: t, ordem: 999 })));
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
