-- Avisos / Notas visíveis para todos os usuários da conta
CREATE TABLE public.avisos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avisos TO authenticated;
GRANT ALL ON public.avisos TO service_role;

ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select avisos" ON public.avisos
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Owner insert avisos" ON public.avisos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update avisos" ON public.avisos
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner delete avisos" ON public.avisos
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER avisos_updated_at BEFORE UPDATE ON public.avisos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
