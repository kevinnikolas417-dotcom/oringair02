import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type CategoryOrder = { pai: string[]; sub: string[] };

// Public read: category names are already public on the storefront.
export const listCategoryOrder = createServerFn({ method: "GET" }).handler(async (): Promise<CategoryOrder> => {
  const { data, error } = await (await admin()).from("category_order").select("tipo, nome, posicao").order("posicao");
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    pai: rows.filter((r) => r.tipo === "pai").map((r) => r.nome),
    sub: rows.filter((r) => r.tipo === "sub").map((r) => r.nome),
  };
});

export const saveCategoryOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ tipo: z.enum(["pai", "sub"]), nomes: z.array(z.string().max(100)).max(200) }))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as { supabase: { rpc: (fn: string, args: Record<string, string>) => PromiseLike<{ data: boolean | null }> }; userId: string };
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas o admin pode reordenar categorias");
    const db = await admin();
    const { error: delErr } = await db.from("category_order").delete().eq("tipo", data.tipo);
    if (delErr) throw new Error(delErr.message);
    const nomes = [...new Set(data.nomes.map((n) => n.trim()).filter(Boolean))];
    if (!nomes.length) return;
    const { error } = await db.from("category_order").insert(nomes.map((nome, i) => ({ tipo: data.tipo, nome, posicao: i })));
    if (error) throw new Error(error.message);
  });
