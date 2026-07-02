
CREATE TABLE public.socios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.socios TO authenticated;
GRANT ALL ON public.socios TO service_role;

ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "socios_owner_all" ON public.socios
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER socios_set_updated_at
  BEFORE UPDATE ON public.socios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.caixa_lancamentos
  ADD COLUMN IF NOT EXISTS socio_id UUID REFERENCES public.socios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_caixa_lancamentos_socio_id ON public.caixa_lancamentos(socio_id);
