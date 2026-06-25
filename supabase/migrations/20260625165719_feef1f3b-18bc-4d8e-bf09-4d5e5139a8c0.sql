CREATE TABLE public.despesas_gerais (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  viveiro_id uuid REFERENCES public.viveiros(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  categoria text,
  valor numeric NOT NULL DEFAULT 0,
  data_despesa date NOT NULL DEFAULT CURRENT_DATE,
  rateio text NOT NULL DEFAULT 'todos',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesas_gerais TO authenticated;
GRANT ALL ON public.despesas_gerais TO service_role;

ALTER TABLE public.despesas_gerais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own despesas" ON public.despesas_gerais FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER despesas_gerais_updated_at BEFORE UPDATE ON public.despesas_gerais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();