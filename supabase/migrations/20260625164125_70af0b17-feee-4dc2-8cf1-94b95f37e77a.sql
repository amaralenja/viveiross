CREATE TABLE public.estoque_entradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade numeric NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL DEFAULT 'kg',
  preco_unidade numeric,
  custo_total numeric,
  fornecedor text,
  data_entrada date NOT NULL DEFAULT CURRENT_DATE,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_entradas TO authenticated;
GRANT ALL ON public.estoque_entradas TO service_role;

ALTER TABLE public.estoque_entradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own estoque" ON public.estoque_entradas
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own estoque" ON public.estoque_entradas
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own estoque" ON public.estoque_entradas
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own estoque" ON public.estoque_entradas
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_estoque_entradas_produto ON public.estoque_entradas(produto_id);
CREATE INDEX idx_estoque_entradas_user ON public.estoque_entradas(user_id);

CREATE TRIGGER set_updated_at_estoque_entradas
  BEFORE UPDATE ON public.estoque_entradas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();