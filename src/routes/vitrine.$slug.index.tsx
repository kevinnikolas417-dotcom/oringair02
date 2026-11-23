import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSellerStorefront } from "@/lib/sheets.functions";
import { SellerHome } from "@/components/SellerHome";

export const Route = createFileRoute("/vitrine/$slug/")({
  head: () => ({
    meta: [
      { title: "Vitrine do vendedor — celulares com Pix ou até 12x" },
      { name: "description", content: "Destaques, novidades e atendimento direto no WhatsApp do seu vendedor." },
      { property: "og:title", content: "Vitrine do vendedor" },
      { property: "og:description", content: "Aparelhos em destaque, novidades e pagamento em Pix ou até 12x." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  const { slug } = Route.useParams();
  const fetchStore = useServerFn(getSellerStorefront);
  const q = useQuery({ queryKey: ["vitrine-seller", slug], queryFn: () => fetchStore({ data: { slug } }) });
  if (q.data === null) return <div className="grid min-h-screen place-items-center bg-ground font-mono text-xs text-dim">Catálogo não encontrado.</div>;
  return <SellerHome slug={slug} data={q.data} loading={q.isLoading} error={q.isError} />;
}
