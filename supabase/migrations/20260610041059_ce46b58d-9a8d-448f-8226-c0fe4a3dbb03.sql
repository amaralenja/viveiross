
CREATE TABLE public.caixa_lancamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE,
  categoria TEXT NOT NULL DEFAULT 'geral',
  viveiro_id UUID REFERENCES public.viveiros(id) ON DELETE SET NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.caixa_lancamentos TO authenticated;
GRANT ALL ON public.caixa_lancamentos TO service_role;

ALTER TABLE public.caixa_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own caixa" ON public.caixa_lancamentos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own caixa" ON public.caixa_lancamentos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own caixa" ON public.caixa_lancamentos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own caixa" ON public.caixa_lancamentos FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER caixa_set_updated_at BEFORE UPDATE ON public.caixa_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX caixa_user_data_idx ON public.caixa_lancamentos(user_id, data_lancamento DESC);
