CREATE OR REPLACE FUNCTION public.recalc_lancamento_custo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.preco_unidade IS NOT NULL AND NEW.quantidade IS NOT NULL THEN
    NEW.custo_total := ROUND((NEW.preco_unidade * NEW.quantidade)::numeric, 2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_lancamento_custo ON public.lancamentos;
CREATE TRIGGER trg_recalc_lancamento_custo
  BEFORE INSERT OR UPDATE OF preco_unidade, quantidade ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.recalc_lancamento_custo();