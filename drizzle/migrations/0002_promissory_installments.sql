CREATE TABLE public.promissory_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_row integer NOT NULL,
  numero integer NOT NULL,
  vencimento date NOT NULL,
  valor numeric NOT NULL,
  data_pagamento date,
  valor_pago numeric,
  forma_pagamento text NOT NULL DEFAULT '',
  periodicidade text NOT NULL DEFAULT 'mensal',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_row, numero)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promissory_installments TO authenticated;
GRANT ALL ON public.promissory_installments TO service_role;
ALTER TABLE public.promissory_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages installments" ON public.promissory_installments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX ON public.promissory_installments (client_row);