REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_register_access(uuid, text, integer, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_access(uuid, integer, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_role(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_access(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_access(uuid, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_access(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_role(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_access(uuid) TO authenticated;