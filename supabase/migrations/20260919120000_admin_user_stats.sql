-- Admin: estatísticas por usuário (controle do pessoal) nas listas de usuários.
-- Acrescenta: total de viveiros, povoamento total, saldo, receitas e despesas.

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE(
  user_id uuid, email text, expires_at timestamptz, is_admin boolean, created_at timestamptz,
  has_access boolean, viveiros_ativos integer, viveiros_total integer, povoamento_total numeric,
  saldo_total numeric, receitas_total numeric, despesas_total numeric,
  viveiro_limit integer, whatsapp text
)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  select p.id, a.email, a.expires_at,
    (exists (select 1 from public.user_roles r where r.user_id=p.id and r.role='admin')),
    p.created_at,
    (a.expires_at is not null and a.expires_at > now()),
    (select count(*)::int from public.viveiros v where v.user_id=p.id and v.status='ativo' and v.deleted_at is null),
    (select count(*)::int from public.viveiros v where v.user_id=p.id and v.deleted_at is null),
    (select coalesce(sum(v.qtd_povoada),0)::numeric from public.viveiros v where v.user_id=p.id and v.status='ativo' and v.deleted_at is null),
    (select coalesce(sum(case when cl.tipo='receita' then cl.valor else -cl.valor end),0)::numeric from public.caixa_lancamentos cl where cl.user_id=p.id),
    (select coalesce(sum(cl.valor),0)::numeric from public.caixa_lancamentos cl where cl.user_id=p.id and cl.tipo='receita'),
    (select coalesce(sum(cl.valor),0)::numeric from public.caixa_lancamentos cl where cl.user_id=p.id and cl.tipo<>'receita'),
    a.viveiro_limit, a.whatsapp
  from public.profiles p left join public.user_access a on a.user_id=p.id
  where a.deleted_at is null
  order by p.created_at desc;
$$;

DROP FUNCTION IF EXISTS public.admin_list_deleted_users();
CREATE FUNCTION public.admin_list_deleted_users()
RETURNS TABLE(
  user_id uuid, email text, expires_at timestamptz, is_admin boolean, created_at timestamptz,
  has_access boolean, viveiros_ativos integer, viveiros_total integer, povoamento_total numeric,
  saldo_total numeric, receitas_total numeric, despesas_total numeric,
  viveiro_limit integer, whatsapp text, deleted_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  select p.id, a.email, a.expires_at,
    (exists (select 1 from public.user_roles r where r.user_id=p.id and r.role='admin')),
    p.created_at,
    false,
    (select count(*)::int from public.viveiros v where v.user_id=p.id and v.status='ativo' and v.deleted_at is null),
    (select count(*)::int from public.viveiros v where v.user_id=p.id and v.deleted_at is null),
    (select coalesce(sum(v.qtd_povoada),0)::numeric from public.viveiros v where v.user_id=p.id and v.status='ativo' and v.deleted_at is null),
    (select coalesce(sum(case when cl.tipo='receita' then cl.valor else -cl.valor end),0)::numeric from public.caixa_lancamentos cl where cl.user_id=p.id),
    (select coalesce(sum(cl.valor),0)::numeric from public.caixa_lancamentos cl where cl.user_id=p.id and cl.tipo='receita'),
    (select coalesce(sum(cl.valor),0)::numeric from public.caixa_lancamentos cl where cl.user_id=p.id and cl.tipo<>'receita'),
    a.viveiro_limit, a.whatsapp, a.deleted_at
  from public.profiles p join public.user_access a on a.user_id=p.id
  where a.deleted_at is not null
  order by a.deleted_at desc;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_deleted_users() TO authenticated;
