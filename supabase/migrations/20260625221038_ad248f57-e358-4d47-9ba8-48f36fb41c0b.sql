REVOKE EXECUTE ON FUNCTION public.sync_despesa_to_caixa() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_despesa_to_caixa() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_despesa_to_caixa() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_despesa_to_caixa() TO service_role;