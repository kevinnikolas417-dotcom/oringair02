import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FoundImage = { ref: string; url: string } | null;
const libKey = (nome: string, cores: string) => `${nome} ${cores}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const itemSchema = z.object({ nome: z.string().min(1).max(200), cores: z.string().max(200) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };
async function assertAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Acesso restrito ao administrador");
}

// Searches one image per item (model + color) unless the image library already has it.
// Never throws per item: failures return null so the import keeps going.
export const findProductImages = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ items: z.array(itemSchema).min(1).max(150) }).parse(d))
  .handler(async ({ data, context }): Promise<FoundImage[]> => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolvePhotos } = await import("./catalog.server");
    const keys = data.items.map((i) => libKey(i.nome, i.cores));
    const { data: lib } = await ctx.supabase.from("image_library").select("key, foto").in("key", [...new Set(keys)]);
    const known = new Map<string, string>((lib ?? []).map((r: { key: string; foto: string }) => [r.key, r.foto]));
    const apiKey = process.env["IMAGE_SEARCH_API_KEY"];
    const searched = new Map<string, Promise<string | null>>();

    const search = async (nome: string, cores: string): Promise<string | null> => {
      if (!apiKey) return null;
      try {
        const res = await fetch("https://google.serper.dev/images", {
          method: "POST", signal: AbortSignal.timeout(10000),
          headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: `${nome} ${cores}`.trim(), num: 10, gl: "br", hl: "pt-br" }),
        });
        if (!res.ok) { console.error(`Image search failed [${res.status}]: ${await res.text()}`); return null; }
        const imgs = ((await res.json()).images ?? []) as { imageUrl?: string }[];
        for (const c of imgs.slice(0, 5)) {
          if (!c.imageUrl?.startsWith("https://")) continue;
          try {
            const r = await fetch(c.imageUrl, { signal: AbortSignal.timeout(8000) });
            const type = r.headers.get("content-type") ?? "";
            if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type)) continue;
            const buf = await r.arrayBuffer();
            if (buf.byteLength < 5000 || buf.byteLength > 5_000_000) continue;
            const path = `auto/${crypto.randomUUID()}.${type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg"}`;
            const { error } = await supabaseAdmin.storage.from("product-photos").upload(path, buf, { contentType: type.split(";")[0]!, cacheControl: "31536000" });
            if (error) { console.error("Image upload failed", error.message); continue; }
            return `sb:${path}`;
          } catch { /* try next candidate */ }
        }
      } catch (e) { console.error("Image search error", e); }
      return null;
    };

    const refs: (string | null)[] = [];
    for (let i = 0; i < data.items.length; i += 4) {
      const chunk = data.items.slice(i, i + 4).map((it, j) => {
        const k = keys[i + j]!;
        if (known.has(k)) return Promise.resolve(known.get(k)!);
        if (!searched.has(k)) searched.set(k, search(it.nome, it.cores).then(async (ref) => {
          if (ref) await ctx.supabase.from("image_library").upsert({ key: k, foto: ref, updated_at: new Date().toISOString() });
          return ref;
        }));
        return searched.get(k)!;
      });
      refs.push(...(await Promise.all(chunk)));
    }
    const urls = await resolvePhotos(refs.filter((r): r is string => !!r));
    return refs.map((r) => (r ? { ref: r, url: r.startsWith("sb:") ? urls.get(r) ?? "" : r } : null));
  });

// Manual "Trocar" in the review screen also feeds the library for future imports.
export const saveLibraryImage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => itemSchema.extend({ ref: z.string().startsWith("sb:").max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const { error } = await ctx.supabase.from("image_library").upsert({ key: libKey(data.nome, data.cores), foto: data.ref, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
