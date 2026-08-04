-- Atualiza trigger para sincronizar lancamentos mesmo sem custo_total (usa 0 como valor)
CREATE OR REPLACE FUNCTION public.sync_racao_to_caixa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.caixa_lancamentos WHERE lancamento_id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.caixa_lancamentos
    (user_id, viveiro_id, data_lancamento, descricao, categoria, valor, observacao, lancamento_id)
  VALUES
    (NEW.user_id, NEW.viveiro_id, NEW.data_lancamento,
     'Insumo: ' || NEW.produto_nome, NEW.tipo,
     COALESCE(NEW.custo_total, 0),
     'Auto · ' || NEW.quantidade || ' ' || NEW.unidade,
     NEW.id)
  ON CONFLICT (lancamento_id) DO UPDATE SET
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
