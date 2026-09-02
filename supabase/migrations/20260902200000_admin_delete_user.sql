-- Apagar cliente de verdade (remove da lista do admin): perfil + acesso + roles.
create or replace function public.admin_delete_user(_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito ao administrador.';
  end if;
  if _user_id = auth.uid() then
    raise exception 'Voce nao pode apagar a si mesmo.';
  end if;
  delete from public.user_roles where user_id = _user_id;
  delete from public.user_access where user_id = _user_id;
  begin
    delete from public.envios_acesso where target_user_id = _user_id;
  exception when undefined_table then null;
  end;
  delete from public.profiles where id = _user_id;
end;
$$;
