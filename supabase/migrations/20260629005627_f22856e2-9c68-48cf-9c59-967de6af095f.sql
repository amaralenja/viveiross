CREATE TABLE public.vales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  valor NUMERIC NOT NULL,
  motivo TEXT,
  data_vale DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vales TO authenticated;
GRANT ALL ON public.vales TO service_role;
ALTER TABLE public.vales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own vales select" ON public.vales FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own vales insert" ON public.vales FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own vales update" ON public.vales FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own vales delete" ON public.vales FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_vales_updated_at BEFORE UPDATE ON public.vales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();