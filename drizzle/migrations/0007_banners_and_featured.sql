ALTER TABLE public.products ADD COLUMN IF NOT EXISTS destaque boolean NOT NULL DEFAULT false;
CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imagem_url text NOT NULL DEFAULT '',
  titulo text NOT NULL DEFAULT '',
  subtitulo text NOT NULL DEFAULT '',
  link_tipo text NOT NULL DEFAULT 'nenhum' CHECK (link_tipo IN ('categoria','produto','url','nenhum')),
  link_valor text NOT NULL DEFAULT '',
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  inicio timestamptz,
  fim timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT ALL ON public.banners TO service_role;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads active banners" ON public.banners FOR SELECT TO anon, authenticated USING (ativo AND (inicio IS NULL OR inicio <= now()) AND (fim IS NULL OR fim >= now()));
CREATE POLICY "admin manages banners" ON public.banners FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));