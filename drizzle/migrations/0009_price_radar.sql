CREATE TABLE public.radar_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  estrategia text NOT NULL DEFAULT 'mediana',
  delta_menor numeric NOT NULL DEFAULT 50,
  lucro_min numeric NOT NULL DEFAULT 500,
  imposto numeric NOT NULL DEFAULT 1.5,
  frete numeric NOT NULL DEFAULT 20,
  folga numeric NOT NULL DEFAULT 5,
  limite int NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.radar_settings (id) VALUES (1);
CREATE TABLE public.radar_results (
  product_row int PRIMARY KEY,
  consulta text NOT NULL DEFAULT '',
  ofertas jsonb NOT NULL DEFAULT '[]',
  analyzed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.radar_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_row int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  menor numeric, mediana numeric, n int NOT NULL DEFAULT 0, meu_preco numeric NOT NULL DEFAULT 0
);
CREATE INDEX radar_snapshots_row_idx ON public.radar_snapshots(product_row, created_at);
CREATE TABLE public.radar_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  consultas int NOT NULL DEFAULT 1
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.radar_settings, public.radar_results, public.radar_snapshots, public.radar_usage TO authenticated;
GRANT ALL ON public.radar_settings, public.radar_results, public.radar_snapshots, public.radar_usage TO service_role;
ALTER TABLE public.radar_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin radar settings" ON public.radar_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin radar results" ON public.radar_results FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin radar snapshots" ON public.radar_snapshots FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin radar usage" ON public.radar_usage FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));