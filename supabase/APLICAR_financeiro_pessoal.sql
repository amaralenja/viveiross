-- ============================================================
--  APLICAR NO SUPABASE (SQL Editor) — aba "Financeiro Pessoal"
--  Seguro rodar quantas vezes quiser (idempotente).
--  Cria as tabelas se faltarem e adiciona a coluna que faltava.
-- ============================================================

-- 1) Tabela dos lançamentos pessoais
CREATE TABLE IF NOT EXISTS public.financeiro_pessoal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa', 'receita')),
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'geral',
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.financeiro_pessoal ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Owner select" ON public.financeiro_pessoal FOR SELECT TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner insert" ON public.financeiro_pessoal FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner update" ON public.financeiro_pessoal FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner delete" ON public.financeiro_pessoal FOR DELETE TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_pessoal TO authenticated;

-- 2) Tabela das categorias (com a coluna `excluida` que o código precisa)
CREATE TABLE IF NOT EXISTS public.categorias_financeiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  icone TEXT DEFAULT '📌',
  excluida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Caso a tabela já exista sem a coluna:
ALTER TABLE public.categorias_financeiro ADD COLUMN IF NOT EXISTS excluida BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.categorias_financeiro ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Owner select cf" ON public.categorias_financeiro FOR SELECT TO authenticated USING(auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner insert cf" ON public.categorias_financeiro FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner delete cf" ON public.categorias_financeiro FOR DELETE TO authenticated USING(auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, DELETE ON public.categorias_financeiro TO authenticated;
