REVOKE ALL ON FUNCTION public.get_relatorio_share_bundle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_relatorio_share_bundle(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_relatorio_share_bundle(text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_relatorio_share_bundle(text) TO anon;