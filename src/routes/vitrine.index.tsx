import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { listPublicProducts } from "@/lib/sheets.functions";
import { Storefront } from "@/components/Storefront";

const str = z.union([z.string(), z.number()]).optional().transform((v) => (v == null ? undefined : String(v)));

export const Route = createFileRoute("/vitrine/")({
  validateSearch: z.object({ p: str, w: str, t: str }),
  head: () => ({
    meta: [
      { title: "Vitrine de celulares — ofertas selecionadas" },
      { name: "description", content: "Confira os aparelhos selecionados para você, com foto e preço." },
      { property: "og:title", content: "Vitrine de celulares" },
      { property: "og:description", content: "Aparelhos selecionados para você, com foto e preço." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Vitrine,
});

function Vitrine() {
  const { p = "", w = "", t = "" } = Route.useSearch();
  const rows = p.split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 2).slice(0, 200);
  const fetchList = useServerFn(listPublicProducts);
  const q = useQuery({ queryKey: ["vitrine", p], queryFn: () => fetchList({ data: { rows } }), enabled: rows.length > 0 });
  return <Storefront products={rows.length ? q.data : []} loading={q.isLoading && rows.length > 0} error={q.isError} phone={w.replace(/\D/g, "")} rates={t} />;
}
