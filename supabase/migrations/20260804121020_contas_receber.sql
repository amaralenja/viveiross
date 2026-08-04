ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS tipo_operacao TEXT NOT NULL DEFAULT 'pagar' CHECK (tipo_operacao IN ('pagar', 'receber'));
