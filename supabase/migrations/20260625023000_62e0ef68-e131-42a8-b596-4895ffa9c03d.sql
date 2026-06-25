
ALTER TABLE public.caixa_lancamentos
  ADD COLUMN IF NOT EXISTS lancamento_id uuid UNIQUE REFERENCES public.lancamentos(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.sync_racao_to_caixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.caixa_lancamentos WHERE lancamento_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.tipo = 'racao' AND NEW.custo_total IS NOT NULL AND NEW.custo_total > 0 THEN
    INSERT INTO public.caixa_lancamentos
      (user_id, viveiro_id, data_lancamento, descricao, categoria, valor, observacao, lancamento_id)
    VALUES
      (NEW.user_id, NEW.viveiro_id, NEW.data_lancamento,
       'Ração: ' || NEW.produto_nome,
       'racao',
       NEW.custo_total,
       'Auto · ' || NEW.quantidade || ' ' || NEW.unidade,
       NEW.id)
    ON CONFLICT (lancamento_id) DO UPDATE SET
      viveiro_id = EXCLUDED.viveiro_id,
      data_lancamento = EXCLUDED.data_lancamento,
      descricao = EXCLUDED.descricao,
      valor = EXCLUDED.valor,
      observacao = EXCLUDED.observacao,
      updated_at = now();
  ELSE
    DELETE FROM public.caixa_lancamentos WHERE lancamento_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_racao_to_caixa ON public.lancamentos;
CREATE TRIGGER trg_sync_racao_to_caixa
AFTER INSERT OR UPDATE OR DELETE ON public.lancamentos
FOR EACH ROW EXECUTE FUNCTION public.sync_racao_to_caixa();

-- Backfill existing rações com custo
INSERT INTO public.caixa_lancamentos
  (user_id, viveiro_id, data_lancamento, descricao, categoria, valor, observacao, lancamento_id)
SELECT l.user_id, l.viveiro_id, l.data_lancamento,
       'Ração: ' || l.produto_nome,
       'racao',
       l.custo_total,
       'Auto · ' || l.quantidade || ' ' || l.unidade,
       l.id
FROM public.lancamentos l
WHERE l.tipo = 'racao' AND l.custo_total IS NOT NULL AND l.custo_total > 0
ON CONFLICT (lancamento_id) DO NOTHING;
