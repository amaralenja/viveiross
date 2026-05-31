-- Produtos/insumos usados nos lançamentos
CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'racao' CHECK (categoria IN ('racao', 'probiotico', 'medicamento', 'fertilizante', 'outro')),
  unidade TEXT NOT NULL DEFAULT 'kg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_produtos_user ON public.produtos(user_id);

CREATE POLICY "Owner select produtos" ON public.produtos
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Owner insert produtos" ON public.produtos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update produtos" ON public.produtos
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner delete produtos" ON public.produtos
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Lançamentos diários por viveiro
CREATE TABLE public.lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viveiro_id UUID NOT NULL REFERENCES public.viveiros(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'racao' CHECK (tipo IN ('racao', 'probiotico', 'medicamento', 'fertilizante', 'outro')),
  produto_nome TEXT NOT NULL,
  quantidade NUMERIC(12,3) NOT NULL CHECK (quantidade > 0),
  unidade TEXT NOT NULL DEFAULT 'kg',
  data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos TO authenticated;
GRANT ALL ON public.lancamentos TO service_role;

ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_lancamentos_user_data ON public.lancamentos(user_id, data_lancamento DESC);
CREATE INDEX idx_lancamentos_viveiro ON public.lancamentos(viveiro_id);

CREATE POLICY "Owner select lancamentos" ON public.lancamentos
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Owner insert lancamentos" ON public.lancamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.viveiros v
      WHERE v.id = viveiro_id AND v.user_id = auth.uid()
    )
    AND (
      produto_id IS NULL OR EXISTS (
        SELECT 1 FROM public.produtos p
        WHERE p.id = produto_id AND p.user_id = auth.uid()
      )
    )
  );
CREATE POLICY "Owner update lancamentos" ON public.lancamentos
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.viveiros v
      WHERE v.id = viveiro_id AND v.user_id = auth.uid()
    )
    AND (
      produto_id IS NULL OR EXISTS (
        SELECT 1 FROM public.produtos p
        WHERE p.id = produto_id AND p.user_id = auth.uid()
      )
    )
  );
CREATE POLICY "Owner delete lancamentos" ON public.lancamentos
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Biometrias por viveiro
CREATE TABLE public.biometrias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viveiro_id UUID NOT NULL REFERENCES public.viveiros(id) ON DELETE CASCADE,
  data_biometria DATE NOT NULL DEFAULT CURRENT_DATE,
  peso_medio_g NUMERIC(10,2) NOT NULL CHECK (peso_medio_g > 0),
  sobrevivencia_percent NUMERIC(5,2) CHECK (sobrevivencia_percent >= 0 AND sobrevivencia_percent <= 100),
  amostras INTEGER CHECK (amostras IS NULL OR amostras > 0),
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.biometrias TO authenticated;
GRANT ALL ON public.biometrias TO service_role;

ALTER TABLE public.biometrias ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_biometrias_user_data ON public.biometrias(user_id, data_biometria DESC);
CREATE INDEX idx_biometrias_viveiro ON public.biometrias(viveiro_id);

CREATE POLICY "Owner select biometrias" ON public.biometrias
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Owner insert biometrias" ON public.biometrias
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.viveiros v
      WHERE v.id = viveiro_id AND v.user_id = auth.uid()
    )
  );
CREATE POLICY "Owner update biometrias" ON public.biometrias
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.viveiros v
      WHERE v.id = viveiro_id AND v.user_id = auth.uid()
    )
  );
CREATE POLICY "Owner delete biometrias" ON public.biometrias
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER produtos_updated_at BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER lancamentos_updated_at BEFORE UPDATE ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER biometrias_updated_at BEFORE UPDATE ON public.biometrias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();