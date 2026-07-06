GRANT SELECT ON public.user_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_access TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO service_role;

DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE FUNCTION public.admin_list_users()
 RETURNS TABLE(user_id uuid, email text, expires_at timestamp with time zone, is_admin boolean, created_at timestamp with time zone, has_access boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    COALESCE(ua.created_at, u.created_at) AS created_at,
    ua.user_id IS NOT NULL AS has_access
  FROM auth.users u
  LEFT JOIN public.user_access ua ON ua.user_id = u.id
  ORDER BY COALESCE(ua.created_at, u.created_at) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_access(_user_id uuid, _dias integer, _add boolean)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _expires timestamptz;
  _base timestamptz;
  _touched integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador.';
  END IF;

  IF _dias IS NULL OR _dias < 1 THEN
    RAISE EXCEPTION 'Informe a quantidade de dias para liberar o acesso.';
  END IF;

  IF _add THEN
    SELECT expires_at INTO _base FROM public.user_access WHERE user_id = _user_id;
    IF _base IS NULL OR _base < now() THEN _base := now(); END IF;
    _expires := _base + (_dias || ' days')::interval;
  ELSE
    _expires := now() + (_dias || ' days')::interval;
  END IF;

  INSERT INTO public.user_access (user_id, email, expires_at)
  SELECT u.id, u.email::text, _expires
  FROM auth.users u
  WHERE u.id = _user_id
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  GET DIAGNOSTICS _touched = ROW_COUNT;
  IF _touched = 0 THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  RETURN _expires;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_register_access(_user_id uuid, _email text, _dias integer, _is_admin boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _expires timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador.';
  END IF;

  IF _is_admin THEN
    _expires := NULL;
  ELSE
    IF _dias IS NULL OR _dias < 1 THEN
      RAISE EXCEPTION 'Informe a quantidade de dias para liberar o acesso.';
    END IF;
    _expires := now() + (_dias || ' days')::interval;
  END IF;

  INSERT INTO public.user_access (user_id, email, expires_at)
  VALUES (_user_id, _email, _expires)
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  IF _is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'admin';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_toggle_role(_user_id uuid, _is_admin boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador.';
  END IF;

  IF _is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_access (user_id, email, expires_at)
    SELECT id, email::text, NULL FROM auth.users WHERE id = _user_id
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      expires_at = NULL,
      updated_at = now();
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'admin';
  END IF;
END;
$function$;