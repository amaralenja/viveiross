CREATE OR REPLACE FUNCTION public.get_relatorio_share_bundle(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _share record;
  _viveiro_ids uuid[];
BEGIN
  PERFORM set_config('app.relatorio_token', _token, true);

  SELECT rs.user_id, rs.viveiro_ids, rs.titulo, rs.created_at
    INTO _share
  FROM public.relatorio_shares rs
  WHERE rs.token = _token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(array_agg(v.id), ARRAY[]::uuid[])
    INTO _viveiro_ids
  FROM public.viveiros v
  WHERE v.user_id = _share.user_id
    AND (
      _share.viveiro_ids IS NULL
      OR cardinality(_share.viveiro_ids) = 0
      OR v.id = ANY(_share.viveiro_ids)
    );

  RETURN jsonb_build_object(
    'titulo', _share.titulo,
    'createdAt', _share.created_at,
    'viveiros', COALESCE((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v.nome)
      FROM (
        SELECT
          v.id,
          v.nome,
          v.qtd_povoada,
          v.data_povoamento,
          v.status,
          v.fornecedor,
          CASE
            WHEN f.id IS NULL THEN NULL
            ELSE jsonb_build_object('nome', f.nome)
          END AS fazendas
        FROM public.viveiros v
        LEFT JOIN public.fazendas f ON f.id = v.fazenda_id
        WHERE v.user_id = _share.user_id
          AND v.id = ANY(_viveiro_ids)
        ORDER BY v.nome
      ) v
    ), '[]'::jsonb),
    'lancamentos', COALESCE((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.data_lancamento DESC)
      FROM (
        SELECT id, viveiro_id, produto_nome, quantidade, unidade, tipo, custo_total, preco_unidade, data_lancamento
        FROM public.lancamentos
        WHERE user_id = _share.user_id
          AND viveiro_id = ANY(_viveiro_ids)
      ) l
    ), '[]'::jsonb),
    'biometrias', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.data_biometria DESC)
      FROM (
        SELECT id, viveiro_id, data_biometria, peso_medio_g, amostras, sobrevivencia_percent
        FROM public.biometrias
        WHERE user_id = _share.user_id
          AND viveiro_id = ANY(_viveiro_ids)
      ) b
    ), '[]'::jsonb),
    'despesas', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.data_despesa DESC)
      FROM (
        SELECT id, viveiro_id, descricao, categoria, valor, data_despesa, rateio
        FROM public.despesas_gerais
        WHERE user_id = _share.user_id
          AND (
            _share.viveiro_ids IS NULL
            OR cardinality(_share.viveiro_ids) = 0
            OR rateio = 'todos'
            OR viveiro_id IS NULL
            OR viveiro_id = ANY(_viveiro_ids)
          )
      ) d
    ), '[]'::jsonb),
    'funcionarios', COALESCE((
      SELECT jsonb_agg(to_jsonb(fn) ORDER BY fn.nome)
      FROM (
        SELECT id, nome, salario, ativo, viveiro_id, observacao
        FROM public.funcionarios
        WHERE user_id = _share.user_id
          AND (
            _share.viveiro_ids IS NULL
            OR cardinality(_share.viveiro_ids) = 0
            OR viveiro_id IS NULL
            OR viveiro_id = ANY(_viveiro_ids)
          )
      ) fn
    ), '[]'::jsonb),
    'vales', COALESCE((
      SELECT jsonb_agg(to_jsonb(va) ORDER BY va.data_vale DESC)
      FROM (
        SELECT va.id, va.funcionario_id, va.valor, va.motivo, va.data_vale
        FROM public.vales va
        JOIN public.funcionarios fn ON fn.id = va.funcionario_id
        WHERE va.user_id = _share.user_id
          AND (
            _share.viveiro_ids IS NULL
            OR cardinality(_share.viveiro_ids) = 0
            OR fn.viveiro_id IS NULL
            OR fn.viveiro_id = ANY(_viveiro_ids)
          )
      ) va
    ), '[]'::jsonb),
    'caixa', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.data_lancamento DESC)
      FROM (
        SELECT id, viveiro_id, data_lancamento, descricao, categoria, tipo, valor, quantidade, unidade, observacao
        FROM public.caixa_lancamentos
        WHERE user_id = _share.user_id
          AND viveiro_id = ANY(_viveiro_ids)
      ) c
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_relatorio_share_bundle(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_relatorio_share_bundle(text) TO anon;
GRANT SELECT ON public.relatorio_shares TO anon;
GRANT SELECT ON public.viveiros TO anon;
GRANT SELECT ON public.fazendas TO anon;
GRANT SELECT ON public.lancamentos TO anon;
GRANT SELECT ON public.biometrias TO anon;
GRANT SELECT ON public.despesas_gerais TO anon;
GRANT SELECT ON public.funcionarios TO anon;
GRANT SELECT ON public.vales TO anon;
GRANT SELECT ON public.caixa_lancamentos TO anon;

DROP POLICY IF EXISTS "Public relatorio token reads share" ON public.relatorio_shares;
CREATE POLICY "Public relatorio token reads share"
ON public.relatorio_shares
FOR SELECT
TO anon
USING (token = current_setting('app.relatorio_token', true));

DROP POLICY IF EXISTS "Public relatorio token reads viveiros" ON public.viveiros;
CREATE POLICY "Public relatorio token reads viveiros"
ON public.viveiros
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.token = current_setting('app.relatorio_token', true)
      AND rs.user_id = viveiros.user_id
      AND (rs.viveiro_ids IS NULL OR cardinality(rs.viveiro_ids) = 0 OR viveiros.id = ANY(rs.viveiro_ids))
  )
);

DROP POLICY IF EXISTS "Public relatorio token reads fazendas" ON public.fazendas;
CREATE POLICY "Public relatorio token reads fazendas"
ON public.fazendas
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.token = current_setting('app.relatorio_token', true)
      AND rs.user_id = fazendas.user_id
  )
);

DROP POLICY IF EXISTS "Public relatorio token reads lancamentos" ON public.lancamentos;
CREATE POLICY "Public relatorio token reads lancamentos"
ON public.lancamentos
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.token = current_setting('app.relatorio_token', true)
      AND rs.user_id = lancamentos.user_id
      AND (rs.viveiro_ids IS NULL OR cardinality(rs.viveiro_ids) = 0 OR lancamentos.viveiro_id = ANY(rs.viveiro_ids))
  )
);

DROP POLICY IF EXISTS "Public relatorio token reads biometrias" ON public.biometrias;
CREATE POLICY "Public relatorio token reads biometrias"
ON public.biometrias
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.token = current_setting('app.relatorio_token', true)
      AND rs.user_id = biometrias.user_id
      AND (rs.viveiro_ids IS NULL OR cardinality(rs.viveiro_ids) = 0 OR biometrias.viveiro_id = ANY(rs.viveiro_ids))
  )
);

DROP POLICY IF EXISTS "Public relatorio token reads despesas" ON public.despesas_gerais;
CREATE POLICY "Public relatorio token reads despesas"
ON public.despesas_gerais
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.token = current_setting('app.relatorio_token', true)
      AND rs.user_id = despesas_gerais.user_id
      AND (rs.viveiro_ids IS NULL OR cardinality(rs.viveiro_ids) = 0 OR despesas_gerais.rateio = 'todos' OR despesas_gerais.viveiro_id IS NULL OR despesas_gerais.viveiro_id = ANY(rs.viveiro_ids))
  )
);

DROP POLICY IF EXISTS "Public relatorio token reads funcionarios" ON public.funcionarios;
CREATE POLICY "Public relatorio token reads funcionarios"
ON public.funcionarios
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.token = current_setting('app.relatorio_token', true)
      AND rs.user_id = funcionarios.user_id
      AND (rs.viveiro_ids IS NULL OR cardinality(rs.viveiro_ids) = 0 OR funcionarios.viveiro_id IS NULL OR funcionarios.viveiro_id = ANY(rs.viveiro_ids))
  )
);

DROP POLICY IF EXISTS "Public relatorio token reads vales" ON public.vales;
CREATE POLICY "Public relatorio token reads vales"
ON public.vales
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    JOIN public.funcionarios f ON f.id = vales.funcionario_id
    WHERE rs.token = current_setting('app.relatorio_token', true)
      AND rs.user_id = vales.user_id
      AND f.user_id = vales.user_id
      AND (rs.viveiro_ids IS NULL OR cardinality(rs.viveiro_ids) = 0 OR f.viveiro_id IS NULL OR f.viveiro_id = ANY(rs.viveiro_ids))
  )
);

DROP POLICY IF EXISTS "Public relatorio token reads caixa" ON public.caixa_lancamentos;
CREATE POLICY "Public relatorio token reads caixa"
ON public.caixa_lancamentos
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.relatorio_shares rs
    WHERE rs.token = current_setting('app.relatorio_token', true)
      AND rs.user_id = caixa_lancamentos.user_id
      AND (rs.viveiro_ids IS NULL OR cardinality(rs.viveiro_ids) = 0 OR caixa_lancamentos.viveiro_id = ANY(rs.viveiro_ids))
  )
);