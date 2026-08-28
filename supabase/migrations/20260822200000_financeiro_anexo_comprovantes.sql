-- Anexo (comprovante) por lançamento do Financeiro + bucket privado por usuário
alter table public.financeiro_pessoal add column if not exists anexo_url text;

insert into storage.buckets (id, name, public)
values ('comprovantes','comprovantes', false)
on conflict (id) do nothing;

drop policy if exists "comprovantes own select" on storage.objects;
drop policy if exists "comprovantes own insert" on storage.objects;
drop policy if exists "comprovantes own delete" on storage.objects;

create policy "comprovantes own select" on storage.objects for select to authenticated
  using (bucket_id='comprovantes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "comprovantes own insert" on storage.objects for insert to authenticated
  with check (bucket_id='comprovantes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "comprovantes own delete" on storage.objects for delete to authenticated
  using (bucket_id='comprovantes' and (storage.foldername(name))[1] = auth.uid()::text);
