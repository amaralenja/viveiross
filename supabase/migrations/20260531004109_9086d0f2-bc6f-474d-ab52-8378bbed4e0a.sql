-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles visible to everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- =========================
-- FAZENDAS
-- =========================
CREATE TABLE public.fazendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cidade TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fazendas_user ON public.fazendas(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fazendas TO authenticated;
GRANT ALL ON public.fazendas TO service_role;

ALTER TABLE public.fazendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select fazendas" ON public.fazendas
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner insert fazendas" ON public.fazendas
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update fazendas" ON public.fazendas
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owner delete fazendas" ON public.fazendas
  FOR DELETE USING (auth.uid() = user_id);

-- =========================
-- VIVEIROS
-- =========================
CREATE TABLE public.viveiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  data_povoamento DATE,
  qtd_povoada INTEGER,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_viveiros_user ON public.viveiros(user_id);
CREATE INDEX idx_viveiros_fazenda ON public.viveiros(fazenda_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.viveiros TO authenticated;
GRANT ALL ON public.viveiros TO service_role;

ALTER TABLE public.viveiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select viveiros" ON public.viveiros
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner insert viveiros" ON public.viveiros
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update viveiros" ON public.viveiros
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owner delete viveiros" ON public.viveiros
  FOR DELETE USING (auth.uid() = user_id);

-- =========================
-- Trigger: auto-create profile on signup
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- Trigger: updated_at
-- =========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER fazendas_updated_at BEFORE UPDATE ON public.fazendas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER viveiros_updated_at BEFORE UPDATE ON public.viveiros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
