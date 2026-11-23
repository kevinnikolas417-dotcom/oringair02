CREATE TABLE public.image_library (
  key text PRIMARY KEY,
  foto text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_library TO authenticated;
GRANT ALL ON public.image_library TO service_role;
ALTER TABLE public.image_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages image library" ON public.image_library FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));