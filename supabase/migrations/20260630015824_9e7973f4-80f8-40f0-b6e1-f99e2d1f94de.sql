
CREATE TABLE public.pdf_shares (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signed_url text NOT NULL,
  filename text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_shares TO authenticated;
GRANT ALL ON public.pdf_shares TO service_role;

ALTER TABLE public.pdf_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pdf_shares"
ON public.pdf_shares FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_pdf_share(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('signed_url', signed_url, 'filename', filename)
  FROM public.pdf_shares WHERE token = _token LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_pdf_share(text) TO anon, authenticated;
