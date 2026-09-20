-- Admin: soft-delete (lixeira de usuários) + controle de dias mais flexível.

-- 1) Coluna de exclusão suave no acesso
ALTER TABLE public.user_access ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) Define a data de expiração diretamente (permite diminuir, zerar e definir exato).
--    _expires = now()  -> zera (expira agora);  futuro -> libera;  null -> sem acesso.
CREATE OR REPLACE FUNCTION public.admin_set_expiry(_user_id uuid, _expires timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _t int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador.';
  END IF;
  INSERT INTO public.user_access (user_id, email, expires_at)
  SELECT u.id, u.email::text, _expires FROM auth.users u WHERE u.id = _user_id
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, expires_at = EXCLUDED.expires_at, updated_at = now();
  GET DIAGNOSTICS _t = ROW_COUNT;
  IF _t = 0 THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  RETURN _expires;
END; $$;

-- 3) Soft-delete: manda pra lixeira (mantém dados e expires_at; bloqueia acesso via deleted_at)
CREATE OR REPLACE FUNCTION public.admin_soft_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador.';
  END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'Você não pode apagar a si mesmo.'; END IF;
  INSERT INTO public.user_access (user_id, email, deleted_at)
  SELECT u.id, u.email::text, now() FROM auth.users u WHERE u.id = _user_id
  ON CONFLICT (user_id) DO UPDATE SET deleted_at = now(), updated_at = now();
END; $$;

-- 4) Restaura da lixeira
CREATE OR REPLACE FUNCTION public.admin_restore_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador.';
  END IF;
  UPDATE public.user_access SET deleted_at = null, updated_at = now() WHERE user_id = _user_id;
END; $$;

-- 5) Lista principal: ignora os que estão na lixeira
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(user_id uuid, email text, expires_at timestamptz, is_admin boolean, created_at timestamptz, has_access boolean, viveiros_ativos integer, viveiro_limit integer, whatsapp text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  select p.id, a.email, a.expires_at,
    (exists (select 1 from public.user_roles r where r.user_id=p.id and r.role='admin')) as is_admin,
    p.created_at,
    (a.expires_at is not null and a.expires_at > now()) as has_access,
    (select count(*)::int from public.viveiros v where v.user_id=p.id and v.status='ativo') as viveiros_ativos,
    a.viveiro_limit, a.whatsapp
  from public.profiles p left join public.user_access a on a.user_id=p.id
  where a.deleted_at is null
  order by p.created_at desc;
$$;

-- 6) Lista da lixeira (usuários apagados)
CREATE OR REPLACE FUNCTION public.admin_list_deleted_users()
RETURNS TABLE(user_id uuid, email text, expires_at timestamptz, is_admin boolean, created_at timestamptz, has_access boolean, viveiros_ativos integer, viveiro_limit integer, whatsapp text, deleted_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  select p.id, a.email, a.expires_at,
    (exists (select 1 from public.user_roles r where r.user_id=p.id and r.role='admin')) as is_admin,
    p.created_at,
    false as has_access,
    (select count(*)::int from public.viveiros v where v.user_id=p.id and v.status='ativo') as viveiros_ativos,
    a.viveiro_limit, a.whatsapp, a.deleted_at
  from public.profiles p join public.user_access a on a.user_id=p.id
  where a.deleted_at is not null
  order by a.deleted_at desc;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_expiry(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_deleted_users() TO authenticated;
