-- Causa-raiz do bug "estimou R$192, salvou R$7,68" (lançamento em saco):
-- a trigger recalc_lancamento_custo sobrescrevia custo_total = preco * quantidade
-- em TODO insert/update, ignorando a embalagem (saco/g). Como o app já calcula
-- o custo certo (embalagem-aware) e o envia, a trigger só deve preencher quando
-- o custo NÃO veio (NULL). Assim o valor correto do app nunca é apagado.

CREATE OR REPLACE FUNCTION public.recalc_lancamento_custo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.custo_total IS NULL
     AND NEW.preco_unidade IS NOT NULL
     AND NEW.quantidade IS NOT NULL THEN
    NEW.custo_total := ROUND((NEW.preco_unidade * NEW.quantidade)::numeric, 2);
  END IF;
  RETURN NEW;
END;
$function$;
