import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Seller = {
  id: string; user_id: string; nome: string; email: string; whatsapp: string; slug: string;
  active: boolean; product_rows: number[]; rates: string; categorias: string[];
};
export type Access = { role: "admin" | "vendedor" | null; seller: Seller | null };

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function isAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
}
async function requireAdmin(ctx: Ctx) {
  if (!(await isAdmin(ctx))) throw new Error("Acesso restrito ao administrador");
}

export const getMyAccess = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Access> => {
    const ctx = context as unknown as Ctx;
    if (await isAdmin(ctx)) return { role: "admin", seller: null };
    const { data } = await ctx.supabase.from("sellers").select("*").eq("user_id", ctx.userId).maybeSingle();
    if (data && data.active) return { role: "vendedor", seller: data as Seller };
    return { role: null, seller: null };
  });

export const listSellers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Seller[]> => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    const { data, error } = await ctx.supabase.from("sellers").select("*").order("created_at");
    if (error) throw new Error(error.message);
    return data as Seller[];
  });

const slug = z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z0-9-]+$/, "Apelido: só letras minúsculas, números e hífen");
const phone = z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().min(10).max(13));

export const createSeller = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    nome: z.string().trim().min(1).max(120), email: z.string().trim().email().max(200),
    senha: z.string().min(6).max(72), whatsapp: phone, slug,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: taken } = await supabaseAdmin.from("sellers").select("id").eq("slug", data.slug).maybeSingle();
    if (taken) throw new Error("Esse apelido de link já está em uso");
    const { data: u, error } = await supabaseAdmin.auth.admin.createUser({ email: data.email, password: data.senha, email_confirm: true });
    if (error || !u.user) throw new Error(error?.message.includes("already") ? "Esse e-mail já tem conta" : error?.message ?? "Erro ao criar usuário");
    const uid = u.user.id;
    const { error: e2 } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "vendedor" });
    const { error: e3 } = await supabaseAdmin.from("sellers").insert({ user_id: uid, nome: data.nome, email: data.email, whatsapp: data.whatsapp, slug: data.slug });
    if (e2 || e3) { await supabaseAdmin.auth.admin.deleteUser(uid); throw new Error((e2 ?? e3)!.message); }
    return { ok: true };
  });

export const updateSeller = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    nome: z.string().trim().min(1).max(120).optional(), whatsapp: phone.optional(), slug: slug.optional(),
    active: z.boolean().optional(),
    product_rows: z.array(z.number().int().min(2).max(100000)).max(500).optional(),
    rates: z.string().max(200).regex(/^[\d.:,]*$/).optional(),
    categorias: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    const { id, ...rest } = data;
    const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as { nome?: string; whatsapp?: string; slug?: string; active?: boolean; product_rows?: number[]; rates?: string; categorias?: string[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (patch.slug) {
      const { data: taken } = await supabaseAdmin.from("sellers").select("id").eq("slug", patch.slug).neq("id", id).maybeSingle();
      if (taken) throw new Error("Esse apelido de link já está em uso");
    }
    const { data: s, error } = await supabaseAdmin.from("sellers").update(patch).eq("id", id).select("user_id").single();
    if (error) throw new Error(error.message);
    if (patch.active !== undefined) {
      await supabaseAdmin.auth.admin.updateUserById(s.user_id, { ban_duration: patch.active ? "none" : "876000h" });
    }
    return { ok: true };
  });

export const resetSellerPassword = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), senha: z.string().min(6).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s, error } = await supabaseAdmin.from("sellers").select("user_id").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const { error: e2 } = await supabaseAdmin.auth.admin.updateUserById(s.user_id, { password: data.senha });
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
