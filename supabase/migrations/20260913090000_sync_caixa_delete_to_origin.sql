-- Exclusão bidirecional Caixa <-> origem.
-- Já existia: apagar em despesas_gerais/lancamentos apaga o espelho em caixa_lancamentos
-- (triggers trg_sync_despesa_to_caixa / trg_sync_racao_to_caixa no evento DELETE).
-- Faltava o inverso: apagar a linha ESPELHADA direto no caixa não apagava a origem,
-- então o item sumia do Caixa mas continuava no Relatório/Viveiros ("apaga num canto e no outro não").
-- Este trigger fecha o ciclo. É idempotente e não recursiona: quando a origem já está sendo
-- apagada, o DELETE não encontra a linha e vira no-op.

CREATE OR REPLACE FUNCTION public.sync_caixa_delete_to_origin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.despesa_id IS NOT NULL THEN
    DELETE FROM public.despesas_gerais WHERE id = OLD.despesa_id;
  ELSIF OLD.lancamento_id IS NOT NULL THEN
    DELETE FROM public.lancamentos WHERE id = OLD.lancamento_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_caixa_delete_to_origin ON public.caixa_lancamentos;
CREATE TRIGGER trg_sync_caixa_delete_to_origin
  AFTER DELETE ON public.caixa_lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_caixa_delete_to_origin();
