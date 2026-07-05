import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Redefinir senha — Viveiros" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const type = params.get("type");

    if (type === "recovery" && access_token && refresh_token) {
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ error }) => {
          if (error) {
            toast.error("Link inválido ou expirado");
            navigate({ to: "/login" });
          } else {
            setReady(true);
            window.history.replaceState(null, "", window.location.pathname);
          }
        });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
        else navigate({ to: "/login" });
      });
    }
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha atualizada!");
      await supabase.auth.signOut();
      navigate({ to: "/login" });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao atualizar senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-accent/40 to-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="size-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 mb-4">
            <KeyRound className="size-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Nova senha</h1>
          <p className="text-muted-foreground mt-1 text-center">Escolha uma nova senha para sua conta</p>
        </div>

        <div className="bg-card rounded-2xl border p-6 shadow-sm">
          {!ready ? (
            <p className="text-center text-muted-foreground py-8">Verificando link...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nova senha</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full h-12 px-4 rounded-xl border bg-background text-base focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="mín. 6 caracteres"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-base shadow-md shadow-primary/20 hover:bg-primary/90 transition disabled:opacity-50"
              >
                {loading ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
