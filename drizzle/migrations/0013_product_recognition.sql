-- Product recognition, supplier aliases, canonical keys and price history.
-- Admin-only RLS on all new tables so sellers and public pages never see costs or supplier aliases.

CREATE OR REPLACE FUNCTION public.normalize_product_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(
              translate(
                coalesce(input, ''),
                'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
              )
            ),
            '\be[\s\-]+sim\b',
            'esim',
            'g'
          ),
          '(\d+)\s*(gb|tb|mm|hz|w)\b',
          '\1\2',
          'g'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS canonical_key text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previous_custo numeric,
  ADD COLUMN IF NOT EXISTS previous_venda numeric,
  ADD COLUMN IF NOT EXISTS last_import_at timestamptz;

CREATE OR REPLACE FUNCTION public.sync_product_canonical_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.canonical_key := public.normalize_product_text(
    concat_ws(' ', NEW.modelo, NULLIF(trim(NEW.variacao), ''))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_sync_canonical_key ON public.products;
CREATE TRIGGER products_sync_canonical_key
  BEFORE INSERT OR UPDATE OF modelo, variacao ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_product_canonical_key();

UPDATE public.products
SET canonical_key = public.normalize_product_text(
  concat_ws(' ', modelo, NULLIF(trim(variacao), ''))
)
WHERE canonical_key = '' OR canonical_key IS NULL;

CREATE INDEX IF NOT EXISTS products_canonical_key_idx
  ON public.products (canonical_key);

CREATE TABLE IF NOT EXISTS public.product_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_row integer NOT NULL REFERENCES public.products("row") ON DELETE CASCADE,
  alias_key text NOT NULL,
  raw_nome text NOT NULL DEFAULT '',
  raw_cores text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_key)
);

CREATE INDEX IF NOT EXISTS product_aliases_product_idx
  ON public.product_aliases (product_row);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_aliases TO authenticated;
GRANT ALL ON public.product_aliases TO service_role;
ALTER TABLE public.product_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manages product aliases" ON public.product_aliases;
CREATE POLICY "admin manages product aliases" ON public.product_aliases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed initial aliases from existing products so current catalog items are immediately recognized.
INSERT INTO public.product_aliases (product_row, alias_key, raw_nome, raw_cores)
SELECT
  p."row",
  public.normalize_product_text(concat_ws(' ', p.modelo, NULLIF(trim(p.variacao), ''))),
  p.modelo,
  p.variacao
FROM public.products p
WHERE public.normalize_product_text(concat_ws(' ', p.modelo, NULLIF(trim(p.variacao), ''))) <> ''
ON CONFLICT (alias_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_row integer NOT NULL REFERENCES public.products("row") ON DELETE CASCADE,
  custo_anterior numeric NOT NULL DEFAULT 0,
  custo_novo numeric NOT NULL DEFAULT 0,
  venda_anterior numeric NOT NULL DEFAULT 0,
  venda_novo numeric NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'import',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_price_history_row_idx
  ON public.product_price_history (product_row, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_price_history TO authenticated;
GRANT ALL ON public.product_price_history TO service_role;
ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manages product price history" ON public.product_price_history;
CREATE POLICY "admin manages product price history" ON public.product_price_history
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
