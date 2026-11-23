ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS banners_vendedor_idx ON public.banners(vendedor_id, ordem);
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS banner_modo text NOT NULL DEFAULT 'padrao' CHECK (banner_modo IN ('padrao','proprios'));
DROP POLICY IF EXISTS "public reads active banners" ON public.banners;
REVOKE SELECT ON public.banners FROM anon;