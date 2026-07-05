import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito ao administrador.");
}

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
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: access, error: aErr } = await supabaseAdmin
      .from("user_access")
      .select("user_id, email, expires_at, created_at")
      .order("created_at", { ascending: false });
    if (aErr) throw new Error(aErr.message);

    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw new Error(rErr.message);

    const adminSet = new Set(
      (roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id),
    );

    return (access ?? []).map((a) => ({
      user_id: a.user_id,
      email: a.email ?? "",
      expires_at: a.expires_at,
      is_admin: adminSet.has(a.user_id),
      created_at: a.created_at ?? new Date().toISOString(),
    }));
  });

export const createUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { email: string; password: string; dias: number | null; isAdmin?: boolean }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;

    const expires_at =
      data.isAdmin || data.dias == null
        ? null
        : new Date(Date.now() + data.dias * 86400000).toISOString();

    const { error: aErr } = await supabaseAdmin
      .from("user_access")
      .upsert({ user_id: uid, email: data.email, expires_at });
    if (aErr) throw new Error(aErr.message);

    if (data.isAdmin) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: uid, role: "admin" }, { onConflict: "user_id,role" });
    }

    return { ok: true, user_id: uid };
  });

export const updatePasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; password: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { user_id: string; dias: number | null; addDays?: boolean }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let expires_at: string | null;
    if (data.dias == null) {
      expires_at = null;
    } else if (data.addDays) {
      const { data: cur } = await supabaseAdmin
        .from("user_access")
        .select("expires_at")
        .eq("user_id", data.user_id)
        .maybeSingle();
      const base =
        cur?.expires_at && new Date(cur.expires_at).getTime() > Date.now()
          ? new Date(cur.expires_at).getTime()
          : Date.now();
      expires_at = new Date(base + data.dias * 86400000).toISOString();
    } else {
      expires_at = new Date(Date.now() + data.dias * 86400000).toISOString();
    }

    const { error } = await supabaseAdmin
      .from("user_access")
      .update({ expires_at })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true, expires_at };
  });

export const toggleAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; is_admin: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.is_admin) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: "admin" }, { onConflict: "user_id,role" });
      await supabaseAdmin
        .from("user_access")
        .update({ expires_at: null })
        .eq("user_id", data.user_id);
    } else {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", "admin");
    }
    return { ok: true };
  });

export const deleteUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
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
