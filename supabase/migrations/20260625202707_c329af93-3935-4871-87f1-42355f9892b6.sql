
-- Coluna pra ligar caixa_lancamentos a despesas_gerais
ALTER TABLE public.caixa_lancamentos
  ADD COLUMN IF NOT EXISTS despesa_id UUID REFERENCES public.despesas_gerais(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS caixa_lancamentos_despesa_id_key
  ON public.caixa_lancamentos(despesa_id) WHERE despesa_id IS NOT NULL;

-- Trigger pra sincronizar despesas_gerais -> caixa_lancamentos
CREATE OR REPLACE FUNCTION public.sync_despesa_to_caixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.caixa_lancamentos WHERE despesa_id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.caixa_lancamentos
    (user_id, viveiro_id, data_lancamento, descricao, categoria, tipo, valor, observacao, despesa_id)
  VALUES
    (NEW.user_id,
     CASE WHEN NEW.rateio = 'individual' THEN NEW.viveiro_id ELSE NULL END,
     NEW.data_despesa,
     NEW.descricao,
     COALESCE(NEW.categoria, 'despesa'),
     'despesa',
     NEW.valor,
     NEW.observacao,
     NEW.id)
  ON CONFLICT (despesa_id) DO UPDATE SET
    viveiro_id = EXCLUDED.viveiro_id,
    data_lancamento = EXCLUDED.data_lancamento,
    descricao = EXCLUDED.descricao,
    categoria = EXCLUDED.categoria,
    valor = EXCLUDED.valor,
    observacao = EXCLUDED.observacao,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_despesa_to_caixa ON public.despesas_gerais;
CREATE TRIGGER trg_sync_despesa_to_caixa
AFTER INSERT OR UPDATE OR DELETE ON public.despesas_gerais
FOR EACH ROW EXECUTE FUNCTION public.sync_despesa_to_caixa();

-- Backfill: sincroniza despesas existentes
INSERT INTO public.caixa_lancamentos
  (user_id, viveiro_id, data_lancamento, descricao, categoria, tipo, valor, observacao, despesa_id)
SELECT
  d.user_id,
  CASE WHEN d.rateio = 'individual' THEN d.viveiro_id ELSE NULL END,
  d.data_despesa,
  d.descricao,
  COALESCE(d.categoria, 'despesa'),
  'despesa',
  d.valor,
  d.observacao,
  d.id
FROM public.despesas_gerais d
LEFT JOIN public.caixa_lancamentos c ON c.despesa_id = d.id
WHERE c.id IS NULL;
