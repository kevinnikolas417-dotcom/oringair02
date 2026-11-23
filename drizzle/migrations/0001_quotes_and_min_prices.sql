CREATE TABLE public.product_min_prices (
  product_row integer PRIMARY KEY,
  min_price numeric NOT NULL CHECK (min_price >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_min_prices TO authenticated;
GRANT ALL ON public.product_min_prices TO service_role;
ALTER TABLE public.product_min_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages min prices" ON public.product_min_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "authenticated reads min prices" ON public.product_min_prices FOR SELECT TO authenticated USING (true);

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  cliente_nome text NOT NULL,
  cliente_whatsapp text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text NOT NULL DEFAULT '',
  validade date NOT NULL,
  status text NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado','aceito')),
  rates text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller reads own quotes" ON public.quotes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "seller creates own quotes" ON public.quotes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "seller updates own quotes" ON public.quotes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "seller deletes own quotes" ON public.quotes FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admin manages quotes" ON public.quotes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));