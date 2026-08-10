-- Bloco 4: o link público de relatório (get_relatorio_share_bundle) precisa
-- entregar os MESMOS campos que o app usa em computeLinhas, senão os números
-- divergem (biomassa manual, custo de caixa, funcionário diária) ou duplicam
-- (espelhos do caixa entrando como despesa pura).
-- Mudanças: viveiros.biomassa_manual; funcionarios.tipo_remuneracao+data_inicio;
-- caixa.despesa_id+lancamento_id e inclui caixa rateado (viveiro_id IS NULL).

CREATE OR REPLACE FUNCTION public.get_relatorio_share_bundle(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
          v.biomassa_manual,
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
        SELECT id, nome, salario, ativo, viveiro_id, observacao, tipo_remuneracao, data_inicio
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
        SELECT id, viveiro_id, data_lancamento, descricao, categoria, tipo, valor, quantidade, unidade, observacao, despesa_id, lancamento_id
        FROM public.caixa_lancamentos
        WHERE user_id = _share.user_id
          AND (viveiro_id = ANY(_viveiro_ids) OR viveiro_id IS NULL)
      ) c
    ), '[]'::jsonb)
  );
END;
$function$;
