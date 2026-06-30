DROP POLICY IF EXISTS "Public can read report share by token" ON public.relatorio_shares;
DROP POLICY IF EXISTS "Public report token reads viveiros" ON public.viveiros;
DROP POLICY IF EXISTS "Public report token reads fazendas" ON public.fazendas;
DROP POLICY IF EXISTS "Public report token reads lancamentos" ON public.lancamentos;
DROP POLICY IF EXISTS "Public report token reads biometrias" ON public.biometrias;
DROP POLICY IF EXISTS "Public report token reads despesas" ON public.despesas_gerais;
DROP POLICY IF EXISTS "Public report token reads funcionarios" ON public.funcionarios;
DROP POLICY IF EXISTS "Public report token reads vales" ON public.vales;
DROP POLICY IF EXISTS "Public report token reads caixa" ON public.caixa_lancamentos;

REVOKE SELECT ON public.relatorio_shares FROM anon;
REVOKE SELECT ON public.viveiros FROM anon;
REVOKE SELECT ON public.fazendas FROM anon;
REVOKE SELECT ON public.lancamentos FROM anon;
REVOKE SELECT ON public.biometrias FROM anon;
REVOKE SELECT ON public.despesas_gerais FROM anon;
REVOKE SELECT ON public.funcionarios FROM anon;
REVOKE SELECT ON public.vales FROM anon;
REVOKE SELECT ON public.caixa_lancamentos FROM anon;

REVOKE ALL ON FUNCTION public.get_relatorio_share_bundle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_relatorio_share_bundle(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_relatorio_share_bundle(text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_relatorio_share_bundle(text) TO anon;