CREATE TABLE public.contas_pagar (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  data_vencimento DATE NOT NULL DEFAULT CURRENT_DATE,
  data_pagamento DATE,
  pago BOOLEAN NOT NULL DEFAULT false,
  categoria TEXT,
  observacao TEXT,
  socio_id UUID REFERENCES public.socios(id) ON DELETE SET NULL,
  viveiro_id UUID REFERENCES public.viveiros(id) ON DELETE SET NULL,
  recorrencia TEXT NOT NULL DEFAULT 'none',
  parent_id UUID REFERENCES public.contas_pagar(id) ON DELETE SET NULL,
  caixa_lancamento_id UUID REFERENCES public.caixa_lancamentos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contas_pagar_recorrencia_check CHECK (recorrencia IN ('none','diaria','semanal','mensal','anual'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_pagar TO authenticated;
GRANT ALL ON public.contas_pagar TO service_role;

ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contas_pagar"
  ON public.contas_pagar FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER contas_pagar_set_updated_at
  BEFORE UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX contas_pagar_user_venc_idx ON public.contas_pagar(user_id, data_vencimento DESC);
CREATE INDEX contas_pagar_user_pago_idx ON public.contas_pagar(user_id, pago);