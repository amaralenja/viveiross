CREATE OR REPLACE FUNCTION public.sync_despesa_to_caixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  ON CONFLICT (despesa_id) WHERE despesa_id IS NOT NULL DO UPDATE SET
    user_id = EXCLUDED.user_id,
    viveiro_id = EXCLUDED.viveiro_id,
    data_lancamento = EXCLUDED.data_lancamento,
    descricao = EXCLUDED.descricao,
    categoria = EXCLUDED.categoria,
    tipo = EXCLUDED.tipo,
    valor = EXCLUDED.valor,
    observacao = EXCLUDED.observacao,
    updated_at = now();

  RETURN NEW;
END;
$function$;