// Base pública para links compartilháveis (vitrine, orçamentos).
// O endereço de pré-visualização do Lovable exige login; links enviados a
// clientes devem sempre apontar para o site publicado.
const PUBLISHED_ORIGIN = "https://pixel-perfect-render-40934.lovable.app";

export function publicOrigin(): string {
  if (typeof window === "undefined") return PUBLISHED_ORIGIN;
  const host = window.location.host;
  if (host.includes("localhost") || host.startsWith("id-preview--")) return PUBLISHED_ORIGIN;
  return window.location.origin;
}
