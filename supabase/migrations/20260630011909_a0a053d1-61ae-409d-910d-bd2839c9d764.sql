REVOKE ALL ON FUNCTION public.get_relatorio_share_bundle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_relatorio_share_bundle(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_relatorio_share_bundle(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_relatorio_share_bundle(text) FROM service_role;

GRANT SELECT ON public.relatorio_shares TO anon;
GRANT SELECT ON public.viveiros TO anon;
GRANT SELECT ON public.fazendas TO anon;
GRANT SELECT ON public.lancamentos TO anon;
GRANT SELECT ON public.biometrias TO anon;
GRANT SELECT ON public.despesas_gerais TO anon;
GRANT SELECT ON public.funcionarios TO anon;
GRANT SELECT ON public.vales TO anon;
GRANT SELECT ON public.caixa_lancamentos TO anon;

DROP POLICY IF EXISTS "Public can read report share by token" ON public.relatorio_shares;
CREATE POLICY "Public can read report share by token"
ON public.relatorio_shares
FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS "Public report token reads viveiros" ON public.viveiros;
CREATE POLICY "Public report token reads viveiros"
ON public.viveiros
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.user_id = viveiros.user_id
      AND (
        rs.viveiro_ids IS NULL
        OR cardinality(rs.viveiro_ids) = 0
        OR viveiros.id = ANY(rs.viveiro_ids)
      )
  )
);

DROP POLICY IF EXISTS "Public report token reads fazendas" ON public.fazendas;
CREATE POLICY "Public report token reads fazendas"
ON public.fazendas
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.user_id = fazendas.user_id
  )
);

DROP POLICY IF EXISTS "Public report token reads lancamentos" ON public.lancamentos;
CREATE POLICY "Public report token reads lancamentos"
ON public.lancamentos
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.user_id = lancamentos.user_id
      AND (
        rs.viveiro_ids IS NULL
        OR cardinality(rs.viveiro_ids) = 0
        OR lancamentos.viveiro_id = ANY(rs.viveiro_ids)
      )
  )
);

DROP POLICY IF EXISTS "Public report token reads biometrias" ON public.biometrias;
CREATE POLICY "Public report token reads biometrias"
ON public.biometrias
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.user_id = biometrias.user_id
      AND (
        rs.viveiro_ids IS NULL
        OR cardinality(rs.viveiro_ids) = 0
        OR biometrias.viveiro_id = ANY(rs.viveiro_ids)
      )
  )
);

DROP POLICY IF EXISTS "Public report token reads despesas" ON public.despesas_gerais;
CREATE POLICY "Public report token reads despesas"
ON public.despesas_gerais
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.user_id = despesas_gerais.user_id
      AND (
        rs.viveiro_ids IS NULL
        OR cardinality(rs.viveiro_ids) = 0
        OR despesas_gerais.rateio = 'todos'
        OR despesas_gerais.viveiro_id IS NULL
        OR despesas_gerais.viveiro_id = ANY(rs.viveiro_ids)
      )
  )
);

DROP POLICY IF EXISTS "Public report token reads funcionarios" ON public.funcionarios;
CREATE POLICY "Public report token reads funcionarios"
ON public.funcionarios
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.user_id = funcionarios.user_id
      AND (
        rs.viveiro_ids IS NULL
        OR cardinality(rs.viveiro_ids) = 0
        OR funcionarios.viveiro_id IS NULL
        OR funcionarios.viveiro_id = ANY(rs.viveiro_ids)
      )
  )
);

DROP POLICY IF EXISTS "Public report token reads vales" ON public.vales;
CREATE POLICY "Public report token reads vales"
ON public.vales
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    JOIN public.funcionarios f ON f.id = vales.funcionario_id
    WHERE rs.user_id = vales.user_id
      AND f.user_id = vales.user_id
      AND (
        rs.viveiro_ids IS NULL
        OR cardinality(rs.viveiro_ids) = 0
        OR f.viveiro_id IS NULL
        OR f.viveiro_id = ANY(rs.viveiro_ids)
      )
  )
);

DROP POLICY IF EXISTS "Public report token reads caixa" ON public.caixa_lancamentos;
CREATE POLICY "Public report token reads caixa"
ON public.caixa_lancamentos
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.user_id = caixa_lancamentos.user_id
      AND (
        rs.viveiro_ids IS NULL
        OR cardinality(rs.viveiro_ids) = 0
        OR caixa_lancamentos.viveiro_id = ANY(rs.viveiro_ids)
      )
  )
);