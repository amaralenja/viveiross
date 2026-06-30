
CREATE POLICY "Users read own relatorios pdf"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'relatorios-pdf' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload own relatorios pdf"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'relatorios-pdf' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own relatorios pdf"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'relatorios-pdf' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own relatorios pdf"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'relatorios-pdf' AND (storage.foldername(name))[1] = auth.uid()::text);
