CREATE TABLE public.category_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('pai', 'sub')),
  nome TEXT NOT NULL,
  posicao INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tipo, nome)
);
GRANT SELECT ON public.category_order TO anon;
GRANT SELECT ON public.category_order TO authenticated;
GRANT ALL ON public.category_order TO service_role;
ALTER TABLE public.category_order ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Qualquer um pode ler a ordem das categorias" ON public.category_order FOR SELECT TO anon, authenticated USING (true);