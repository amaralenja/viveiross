CREATE TABLE IF NOT EXISTS public.financeiro_pessoal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa', 'receita')),
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'geral',
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.financeiro_pessoal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select" ON public.financeiro_pessoal FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner insert" ON public.financeiro_pessoal FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update" ON public.financeiro_pessoal FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner delete" ON public.financeiro_pessoal FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_pessoal TO authenticated;
