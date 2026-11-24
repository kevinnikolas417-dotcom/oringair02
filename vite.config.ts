import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const supabaseUrl =
    env["VITE_SUPABASE_URL"] ||
    env["NEXT_PUBLIC_SUPABASE_URL"] ||
    env["SUPABASE_URL"] ||
    "";
  const supabaseKey =
    env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    env["VITE_SUPABASE_ANON_KEY"] ||
    env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ||
    env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ||
    env["SUPABASE_PUBLISHABLE_KEY"] ||
    env["SUPABASE_ANON_KEY"] ||
    "";
  const siteUrl =
    env["VITE_SITE_URL"] ||
    env["NEXT_PUBLIC_SITE_URL"] ||
    (env["VERCEL_PROJECT_PRODUCTION_URL"] ? `https://${env["VERCEL_PROJECT_PRODUCTION_URL"]}` : "") ||
    "";

  return {
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    define: {
      __APP_SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __APP_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabaseKey),
      __APP_SITE_URL__: JSON.stringify(siteUrl),
    },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart({
        server: { entry: "server" },
      }),
      ...(command === "build"
        ? [nitro({ preset: process.env["NITRO_PRESET"] ?? "vercel" })]
        : []),
      viteReact(),
    ],
  };
});
