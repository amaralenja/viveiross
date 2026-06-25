DROP TRIGGER IF EXISTS trg_sync_despesa_to_caixa ON public.despesas_gerais;

CREATE TRIGGER trg_sync_despesa_to_caixa
AFTER INSERT OR UPDATE OR DELETE ON public.despesas_gerais
FOR EACH ROW
EXECUTE FUNCTION public.sync_despesa_to_caixa();