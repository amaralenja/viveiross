-- Faltava a policy de UPDATE em categorias_financeiro (arquivar/desarquivar/renomear
-- eram bloqueados silenciosamente pelo RLS).
drop policy if exists "Owner update cf" on public.categorias_financeiro;
create policy "Owner update cf" on public.categorias_financeiro
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
