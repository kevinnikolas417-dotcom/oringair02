// Base pública para links compartilháveis (vitrine, orçamentos e redefinição de senha).
// Prioriza VITE_SITE_URL (configurado na Vercel), seguido pela origem atual do navegador
// ou pelo domínio de produção da Vercel no SSR.
declare const __APP_SITE_URL__: string | undefined;

export function publicOrigin(): string {
  const injected = typeof __APP_SITE_URL__ !== "undefined" ? __APP_SITE_URL__ : "";
  const configured = (injected || (import.meta.env.VITE_SITE_URL as string | undefined) || "").trim().replace(/\/+$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  if (typeof process !== "undefined") {
    const vercelHost =
      process.env["VERCEL_PROJECT_PRODUCTION_URL"] ||
      process.env["VERCEL_URL"];
    if (vercelHost) {
      return vercelHost.startsWith("http") ? vercelHost.replace(/\/+$/, "") : `https://${vercelHost.replace(/\/+$/, "")}`;
    }
  }

  return "";
}
