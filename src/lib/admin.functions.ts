import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";

export type AdminUser = {
  user_id: string;
  email: string;
  expires_at: string | null;
  is_admin: boolean;
  created_at: string;
  has_access: boolean;
  viveiros_ativos: number;
  viveiro_limit: number | null;
  whatsapp: string | null;
};

// Envia e-mail via Resend (best-effort). Chave em env: RESEND_API_KEY.
async function sendAccessEmail(to: string, password: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.RESEND_FROM || "Viveiros <onboarding@resend.dev>";
  const loginUrl = process.env.APP_URL || "https://viveiross.lovable.app";
  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <div style="background:#10b981;color:#fff;padding:20px;border-radius:14px 14px 0 0">
        <h1 style="margin:0;font-size:20px">Bem-vindo ao Viveiros 🦐</h1>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 14px 14px">
        <p>Seu acesso ao sistema Viveiros foi criado. Use os dados abaixo para entrar:</p>
        <p style="background:#f1f5f9;padding:12px;border-radius:8px;margin:16px 0">
          <strong>E-mail:</strong> ${to}<br/>
          <strong>Senha:</strong> ${password}
        </p>
        <p><a href="${loginUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Entrar no sistema</a></p>
        <p style="color:#64748b;font-size:13px;margin-top:16px">Recomendamos trocar a senha após o primeiro acesso.</p>
      </div>
    </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: "Seu acesso ao Viveiros", html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

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
    (d: { email: string; password: string; dias: number | null; isAdmin?: boolean; whatsapp?: string | null }) => d,
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

    // WhatsApp (opcional)
    const wpp = (data.whatsapp ?? "").trim();
    if (wpp) {
      await ctx.supabase.rpc("admin_set_whatsapp", { _user_id: uid, _whatsapp: wpp });
    }

    // E-mail com as credenciais (best-effort)
    const emailed = await sendAccessEmail(data.email, data.password);

    return { ok: true, user_id: uid, emailed };
  });

export const setWhatsappFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; whatsapp: string | null }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase.rpc("admin_set_whatsapp", {
      _user_id: data.user_id,
      _whatsapp: (data.whatsapp ?? "").trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { user_id: string; dias: number; addDays?: boolean }) => d,
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
    // Um admin não pode remover o próprio acesso de administrador (evita se trancar fora).
    if (data.user_id === ctx.userId && data.is_admin === false) {
      throw new Error("Você não pode remover o seu próprio acesso de administrador.");
    }
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

export const setViveiroLimitFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; limite: number | null }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase.rpc("admin_set_viveiro_limit", {
      _user_id: data.user_id,
      _limite: data.limite,
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
    const { data: access, error: accessError } = await ctx.supabase
      .from("user_access")
      .select("expires_at, viveiro_limit")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (accessError) throw new Error(accessError.message);

    const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "admin",
    });
    return {
      expires_at: (access?.expires_at as string | null) ?? null,
      is_admin: !!isAdmin,
      has_access: !!access,
      viveiro_limit: (access?.viveiro_limit as number | null) ?? null,
    };
  });
