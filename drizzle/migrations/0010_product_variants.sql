CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id integer NOT NULL REFERENCES public.products("row") ON DELETE CASCADE,
  cor text NOT NULL DEFAULT 'Única',
  cor_hex text NOT NULL DEFAULT '#d1d5db',
  custo numeric NOT NULL DEFAULT 0,
  lucro numeric NOT NULL DEFAULT 0,
  preco_venda numeric NOT NULL DEFAULT 0,
  imagem_url text,
  disponivel boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_variants_product_idx ON public.product_variants(product_id, ordem);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages variants" ON public.product_variants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.product_variants (product_id, cor, custo, lucro, preco_venda, disponivel, ordem)
SELECT p."row", COALESCE(NULLIF(trim(c.cor), ''), 'Única'), p.custo, p.lucro, p.venda, p.estoque > 0, (c.ord - 1)::int
FROM public.products p
CROSS JOIN LATERAL (
  SELECT x AS cor, ord FROM unnest(CASE WHEN trim(p.variacao) = '' THEN ARRAY['Única'] ELSE regexp_split_to_array(p.variacao, '\s*[,;/]\s*') END) WITH ORDINALITY AS t(x, ord)
  WHERE trim(x) <> '' OR trim(p.variacao) = ''
) c;