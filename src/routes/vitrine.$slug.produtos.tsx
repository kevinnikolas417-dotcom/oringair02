import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { getSellerStorefront } from "@/lib/sheets.functions";
import { Storefront } from "@/components/Storefront";

const searchSchema = z.object({
  pai: fallback(z.string(), "").optional(),
  sub: fallback(z.string(), "").optional(),
  busca: fallback(z.boolean(), false).optional(),
});

export const Route = createFileRoute("/vitrine/$slug/produtos")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Todos os produtos — catálogo do vendedor" },
      { name: "description", content: "Busque, filtre e compre aparelhos do catálogo do vendedor com Pix ou cartão em até 12x." },
      { property: "og:title", content: "Todos os produtos do vendedor" },
      { property: "og:description", content: "Catálogo completo com busca, filtros e parcelas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SellerProducts,
});

function SellerProducts() {
  const { slug } = Route.useParams();
  const { pai, sub, busca } = Route.useSearch();
  const fetchStore = useServerFn(getSellerStorefront);
  const q = useQuery({ queryKey: ["vitrine-seller", slug], queryFn: () => fetchStore({ data: { slug } }) });
  if (q.data === null) return <div className="grid min-h-screen place-items-center bg-ground font-mono text-xs text-dim">Catálogo não encontrado.</div>;
  return <Storefront products={q.data?.products} loading={q.isLoading} error={q.isError} phone={q.data?.whatsapp ?? ""} rates={q.data?.rates ?? ""}
    seller={q.data?.nome} slug={slug} initial={{ pai, sub, focus: busca }} />;
}
