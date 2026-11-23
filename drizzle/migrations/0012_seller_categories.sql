ALTER TABLE public.sellers ADD COLUMN categorias text[] NOT NULL DEFAULT '{}'::text[];
COMMENT ON COLUMN public.sellers.categorias IS 'Parent categories visible to the seller; empty = all';