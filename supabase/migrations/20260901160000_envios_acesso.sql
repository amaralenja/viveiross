-- Log de envios de acesso (quem recebeu, quando, tipo, se o e-mail saiu)
create table if not exists public.envios_acesso (
  id uuid primary key default gen_random_uuid(),
  target_email text not null,
  target_user_id uuid,
  tipo text not null default 'criacao',
  emailed boolean not null default false,
  admin_id uuid,
  created_at timestamptz not null default now()
);
alter table public.envios_acesso enable row level security;
drop policy if exists "admin read envios" on public.envios_acesso;
drop policy if exists "admin insert envios" on public.envios_acesso;
create policy "admin read envios" on public.envios_acesso for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
create policy "admin insert envios" on public.envios_acesso for insert to authenticated
  with check (public.has_role(auth.uid(),'admin'));
