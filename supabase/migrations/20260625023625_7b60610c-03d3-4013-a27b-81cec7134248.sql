ALTER TABLE public.caixa_lancamentos
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'despesa'
  CHECK (tipo IN ('despesa', 'receita'));

CREATE INDEX IF NOT EXISTS caixa_lancamentos_tipo_idx ON public.caixa_lancamentos(tipo);