CREATE TABLE IF NOT EXISTS public.categorias_financeiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  icone TEXT DEFAULT '📌',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categorias_financeiro ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Owner select cf" ON public.categorias_financeiro FOR SELECT TO authenticated USING(auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner insert cf" ON public.categorias_financeiro FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner delete cf" ON public.categorias_financeiro FOR DELETE TO authenticated USING(auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, DELETE ON public.categorias_financeiro TO authenticated;
