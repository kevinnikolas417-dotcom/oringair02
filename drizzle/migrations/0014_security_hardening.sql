-- Security hardening:
-- 1. Restrict product_min_prices SELECT policy to admins and active sellers (not any unassigned authenticated user).
-- 2. Lock search_path on product recognition helper functions (prevents search_path hijacking).
-- 3. Add explicit admin-only write RLS policy on category_order.

DROP POLICY IF EXISTS "authenticated reads min prices" ON public.product_min_prices;
CREATE POLICY "admin or active seller reads min prices" ON public.product_min_prices
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.user_id = auth.uid() AND s.active = true
    )
  );

ALTER FUNCTION public.normalize_product_text(text) SET search_path = public;
ALTER FUNCTION public.sync_product_canonical_key() SET search_path = public;

DROP POLICY IF EXISTS "admin manages category order" ON public.category_order;
CREATE POLICY "admin manages category order" ON public.category_order
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
