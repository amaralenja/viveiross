
-- Roles enum + tabela
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','user');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;

DROP POLICY IF EXISTS "read roles" ON public.user_roles;
CREATE POLICY "read roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admin manage roles" ON public.user_roles;
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Tabela de acesso com expiração
CREATE TABLE IF NOT EXISTS public.user_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_access TO authenticated;
GRANT ALL ON public.user_access TO service_role;
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own access" ON public.user_access;
CREATE POLICY "read own access" ON public.user_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admin manage access" ON public.user_access;
CREATE POLICY "admin manage access" ON public.user_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS user_access_set_updated_at ON public.user_access;
CREATE TRIGGER user_access_set_updated_at BEFORE UPDATE ON public.user_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed admin (se o usuário já existe)
INSERT INTO public.user_roles (user_id, role)
  SELECT id, 'admin'::public.app_role FROM auth.users WHERE email = 'vital.lima.vl@gmail.com'
  ON CONFLICT DO NOTHING;

INSERT INTO public.user_access (user_id, email, expires_at)
  SELECT id, email, NULL FROM auth.users WHERE email = 'vital.lima.vl@gmail.com'
  ON CONFLICT (user_id) DO UPDATE SET expires_at = NULL;

-- Backfill: usuários existentes ganham acesso NULL (ilimitado) inicialmente
INSERT INTO public.user_access (user_id, email, expires_at)
  SELECT id, email, NULL FROM auth.users
  ON CONFLICT (user_id) DO NOTHING;
