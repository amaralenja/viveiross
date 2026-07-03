CREATE TABLE public.despescas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  viveiro_id UUID REFERENCES public.viveiros(id) ON DELETE SET NULL,
  data_despesca DATE NOT NULL DEFAULT CURRENT_DATE,
  quantidade_kg NUMERIC NOT NULL,
  preco_kg NUMERIC NOT NULL,
  valor_total NUMERIC NOT NULL,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  caixa_lancamento_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.despescas TO authenticated;
GRANT ALL ON public.despescas TO service_role;

ALTER TABLE public.despescas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select" ON public.despescas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_insert" ON public.despescas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update" ON public.despescas FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_delete" ON public.despescas FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_despescas BEFORE UPDATE ON public.despescas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();