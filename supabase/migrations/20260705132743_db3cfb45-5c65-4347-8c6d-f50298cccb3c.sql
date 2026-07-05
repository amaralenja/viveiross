
-- Listar todos os usuários (join auth.users + user_access + user_roles)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  expires_at timestamptz,
  is_admin boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador.';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text AS email,
    ua.expires_at,
    EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin,
    COALESCE(ua.created_at, u.created_at) AS created_at
  FROM auth.users u
  LEFT JOIN public.user_access ua ON ua.user_id = u.id
  ORDER BY COALESCE(ua.created_at, u.created_at) DESC;
END;
$$;

-- Registrar acesso pra um usuário recém-criado (chamado após signUp)
CREATE OR REPLACE FUNCTION public.admin_register_access(
  _user_id uuid,
  _email text,
  _dias integer,
  _is_admin boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expires timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador.';
  END IF;

  IF _is_admin OR _dias IS NULL THEN
    _expires := NULL;
  ELSE
    _expires := now() + (_dias || ' days')::interval;
  END IF;

  INSERT INTO public.user_access (user_id, email, expires_at)
  VALUES (_user_id, _email, _expires)
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    expires_at = EXCLUDED.expires_at;

  IF _is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;

-- Definir/somar dias de acesso
CREATE OR REPLACE FUNCTION public.admin_set_access(
  _user_id uuid,
  _dias integer,
  _add boolean
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expires timestamptz;
  _base timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador.';
  END IF;

  IF _dias IS NULL THEN
    _expires := NULL;
  ELSIF _add THEN
    SELECT expires_at INTO _base FROM public.user_access WHERE user_id = _user_id;
    IF _base IS NULL OR _base < now() THEN _base := now(); END IF;
    _expires := _base + (_dias || ' days')::interval;
  ELSE
    _expires := now() + (_dias || ' days')::interval;
  END IF;

  UPDATE public.user_access
     SET expires_at = _expires
   WHERE user_id = _user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_access (user_id, email, expires_at)
    SELECT id, email::text, _expires FROM auth.users WHERE id = _user_id;
  END IF;

  RETURN _expires;
END;
$$;

-- Marcar/desmarcar admin
CREATE OR REPLACE FUNCTION public.admin_toggle_role(
  _user_id uuid,
  _is_admin boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador.';
  END IF;

  IF _is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.user_access SET expires_at = NULL WHERE user_id = _user_id;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'admin';
  END IF;
END;
$$;

-- Revogar acesso (não deleta o auth user, só bloqueia login pelo app)
CREATE OR REPLACE FUNCTION public.admin_revoke_access(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador.';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  UPDATE public.user_access
     SET expires_at = now() - interval '1 second'
   WHERE user_id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_access(uuid, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_access(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_role(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_access(uuid) TO authenticated;
