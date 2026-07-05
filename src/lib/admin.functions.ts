import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";

export type AdminUser = {
  user_id: string;
  email: string;
  expires_at: string | null;
  is_admin: boolean;
  created_at: string;
};

export const listUsersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    const ctx = context as any;
    const { data, error } = await ctx.supabase.rpc("admin_list_users");
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminUser[];
  });

export const createUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { email: string; password: string; dias: number | null; isAdmin?: boolean }) => d,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    // Confirma admin antes de qualquer coisa (a RPC também confirma, mas evita signUp desnecessário)
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso restrito ao administrador.");

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Supabase não configurado.");
    }

    // Cliente anônimo isolado só pra criar a conta (não persiste sessão)
    const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: signUp, error: signErr } = await anon.auth.signUp({
      email: data.email,
      password: data.password,
    });
    if (signErr) throw new Error(signErr.message);
    const uid = signUp.user?.id;
    if (!uid) throw new Error("Não foi possível criar o usuário.");

    const { error: rpcErr } = await ctx.supabase.rpc("admin_register_access", {
      _user_id: uid,
      _email: data.email,
      _dias: data.isAdmin ? null : data.dias,
      _is_admin: !!data.isAdmin,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    return { ok: true, user_id: uid };
  });

export const setAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { user_id: string; dias: number | null; addDays?: boolean }) => d,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { data: expires, error } = await ctx.supabase.rpc("admin_set_access", {
      _user_id: data.user_id,
      _dias: data.dias,
      _add: !!data.addDays,
    });
    if (error) throw new Error(error.message);
    return { ok: true, expires_at: expires };
  });

export const toggleAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; is_admin: boolean }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase.rpc("admin_toggle_role", {
      _user_id: data.user_id,
      _is_admin: data.is_admin,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase.rpc("admin_revoke_access", {
      _user_id: data.user_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Reset de senha via e-mail (sem service role) — envia link pro usuário
export const updatePasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; email: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso restrito ao administrador.");

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { error } = await anon.auth.resetPasswordForEmail(data.email, {
      redirectTo: "https://viveiross.lovable.app/reset-password",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyAccessFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { data: access } = await ctx.supabase
      .from("user_access")
      .select("expires_at")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "admin",
    });
    return {
      expires_at: (access?.expires_at as string | null) ?? null,
      is_admin: !!isAdmin,
    };
  });
