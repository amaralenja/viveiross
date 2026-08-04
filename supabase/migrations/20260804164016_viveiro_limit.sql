ALTER TABLE public.user_access ADD COLUMN IF NOT EXISTS viveiro_limit INTEGER DEFAULT NULL;

-- Função pra contar viveiros ativos de um usuário
CREATE OR REPLACE FUNCTION public.admin_get_viveiro_count(_user_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.viveiros WHERE user_id = _user_id AND status = 'ativo';
$$;

-- Função pra definir limite de viveiros
CREATE OR REPLACE FUNCTION public.admin_set_viveiro_limit(_user_id uuid, _limite integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.user_access (user_id, viveiro_limit) VALUES (_user_id, _limite)
  ON CONFLICT (user_id) DO UPDATE SET viveiro_limit = _limite;
$$;

-- Atualiza admin_list_users pra incluir contagem e limite
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(user_id uuid, email text, expires_at timestamptz, is_admin boolean, created_at timestamptz, has_access boolean, viveiros_ativos integer, viveiro_limit integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.user_id,
    u.email::text,
    a.expires_at,
    (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role = 'admin')) AS is_admin,
    p.created_at,
    a.expires_at IS NOT NULL AND a.expires_at > now() AS has_access,
    (SELECT COUNT(*)::integer FROM public.viveiros v WHERE v.user_id = p.user_id AND v.status = 'ativo') AS viveiros_ativos,
    a.viveiro_limit
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN public.user_access a ON a.user_id = p.user_id
  ORDER BY p.created_at DESC;
$$;
