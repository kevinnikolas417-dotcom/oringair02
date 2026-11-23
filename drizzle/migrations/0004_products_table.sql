CREATE SEQUENCE IF NOT EXISTS public.products_row_seq START 2;
CREATE TABLE public.products (
  "row" integer PRIMARY KEY DEFAULT nextval('public.products_row_seq'),
  modelo text NOT NULL,
  variacao text NOT NULL DEFAULT '',
  custo numeric NOT NULL DEFAULT 0,
  venda numeric NOT NULL DEFAULT 0,
  estoque integer NOT NULL DEFAULT 0,
  foto text NOT NULL DEFAULT '',
  lucro_tipo text NOT NULL DEFAULT 'fixo',
  lucro numeric NOT NULL DEFAULT 0,
  categoria text NOT NULL DEFAULT '',
  categoria_pai text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE public.products_row_seq OWNED BY public.products."row";
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.products_row_seq TO authenticated, service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages products" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Public read product photos" ON storage.objects;
CREATE POLICY "Admins read product photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'product-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update product photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-photos' AND public.has_role(auth.uid(), 'admin'));