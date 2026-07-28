-- Atualiza trigger pra sincronizar TODOS os tipos de lancamento no caixa, não só ração
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

  IF NEW.custo_total IS NOT NULL AND NEW.custo_total > 0 THEN
    INSERT INTO public.caixa_lancamentos
      (user_id, viveiro_id, data_lancamento, descricao, categoria, valor, observacao, lancamento_id)
    VALUES
      (NEW.user_id, NEW.viveiro_id, NEW.data_lancamento,
       'Insumo: ' || NEW.produto_nome,
       NEW.tipo,
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

-- Backfill: sincroniza lancamentos de outros tipos (não ração) que ainda não estão no caixa
INSERT INTO public.caixa_lancamentos
  (user_id, viveiro_id, data_lancamento, descricao, categoria, valor, observacao, lancamento_id)
SELECT l.user_id, l.viveiro_id, l.data_lancamento,
       'Insumo: ' || l.produto_nome,
       l.tipo,
       l.custo_total,
       'Auto · ' || l.quantidade || ' ' || l.unidade,
       l.id
FROM public.lancamentos l
WHERE l.tipo != 'racao' AND l.custo_total IS NOT NULL AND l.custo_total > 0
  AND NOT EXISTS (SELECT 1 FROM public.caixa_lancamentos c WHERE c.lancamento_id = l.id)
ON CONFLICT (lancamento_id) DO NOTHING;
