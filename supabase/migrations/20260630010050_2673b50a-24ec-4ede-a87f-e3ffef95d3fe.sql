
CREATE TABLE public.relatorio_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viveiro_ids uuid[],
  titulo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.relatorio_shares TO authenticated;
GRANT ALL ON public.relatorio_shares TO service_role;
ALTER TABLE public.relatorio_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own shares all" ON public.relatorio_shares FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX relatorio_shares_token_idx ON public.relatorio_shares(token);
