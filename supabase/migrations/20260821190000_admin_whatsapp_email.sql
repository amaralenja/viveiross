-- WhatsApp por usuário + expõe no admin_list_users + RPC pra setar
alter table public.user_access add column if not exists whatsapp text;

drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table(user_id uuid, email text, expires_at timestamptz, is_admin boolean, created_at timestamptz, has_access boolean, viveiros_ativos integer, viveiro_limit integer, whatsapp text)
language sql security definer set search_path to 'public' as $fn$
  select p.id, a.email, a.expires_at,
    (exists (select 1 from public.user_roles r where r.user_id=p.id and r.role='admin')) as is_admin,
    p.created_at,
    (a.expires_at is not null and a.expires_at > now()) as has_access,
    (select count(*)::int from public.viveiros v where v.user_id=p.id and v.status='ativo') as viveiros_ativos,
    a.viveiro_limit, a.whatsapp
  from public.profiles p left join public.user_access a on a.user_id=p.id
  order by p.created_at desc;
$fn$;

create or replace function public.admin_set_whatsapp(_user_id uuid, _whatsapp text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Acesso restrito ao administrador.';
  end if;
  update public.user_access set whatsapp=_whatsapp, updated_at=now() where user_id=_user_id;
  if not found then
    insert into public.user_access (user_id, email, whatsapp)
      values (_user_id, (select email from auth.users where id=_user_id), _whatsapp);
  end if;
end;
$fn$;
