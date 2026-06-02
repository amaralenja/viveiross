ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS preco_unidade numeric;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS preco_unidade numeric;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS custo_total numeric;