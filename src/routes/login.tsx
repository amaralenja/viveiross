import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Fish, Eye, EyeOff, Waves, ShieldCheck, LineChart, Sparkles } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Viveiros" },
      { name: "description", content: "Acesse sua conta para gerenciar viveiros de camarão." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      throw redirect({ to: "/reset-password", hash: window.location.hash.replace(/^#/, "") });
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { nome },
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Entrando...");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot() {
    if (!email) {
      toast.error("Digite seu e-mail primeiro");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Enviamos um link de recuperação pro seu e-mail");
  }

  return (
    <main className="min-h-screen w-full relative overflow-hidden">
      {/* Fundo decorativo — ondas e blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 size-[520px] rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 size-[560px] rounded-full bg-accent/60 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 size-[380px] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="min-h-screen grid lg:grid-cols-2">
        {/* Painel de marca */}
        <section className="hidden lg:flex flex-col justify-between p-12 relative">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30">
              <Fish className="size-6" />
            </div>
            <span className="text-lg font-bold tracking-tight">Viveiros</span>
          </div>

          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6">
              <Sparkles className="size-3.5" /> Gestão profissional de carcinicultura
            </div>
            <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight">
              Controle total do seu <span className="text-primary">viveiro</span>, sem complicação.
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Biometrias, caixa, estoque e relatórios num só lugar — feito pra quem vive de camarão.
            </p>

            <ul className="mt-8 space-y-3">
              {[
                { icon: Waves, text: "Acompanhe cada viveiro em tempo real" },
                { icon: LineChart, text: "Relatórios claros de custo e biomassa" },
                { icon: ShieldCheck, text: "Seus dados protegidos com senha por seção" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm">
                  <span className="size-9 rounded-xl bg-card border flex items-center justify-center text-primary shadow-sm">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-foreground/80">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Viveiros · Todos os direitos reservados</p>
        </section>

        {/* Painel do formulário */}
        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="flex lg:hidden flex-col items-center mb-8">
              <div className="size-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 mb-3">
                <Fish className="size-7" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Viveiros</h1>
              <p className="text-sm text-muted-foreground">Gestão simples de camarão</p>
            </div>

            <div className="relative">
              {/* Borda gradiente sutil */}
              <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-primary/25 via-border to-transparent" aria-hidden />
              <div className="relative bg-card/90 backdrop-blur-xl rounded-3xl border border-border/60 p-7 sm:p-8 shadow-2xl shadow-primary/5">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {mode === "signin" ? "Bem-vindo de volta" : "Criar sua conta"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {mode === "signin"
                      ? "Entre pra continuar de onde parou."
                      : "Leva menos de 1 minuto pra começar."}
                  </p>
                </div>

                <div className="flex gap-1 p-1 bg-muted/70 rounded-2xl mb-6">
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
                      mode === "signin"
                        ? "bg-card shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
                      mode === "signup"
                        ? "bg-card shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Criar conta
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === "signup" && (
                    <div>
                      <label className="text-sm font-medium">Nome</label>
                      <input
                        type="text"
                        required
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        className="mt-1.5 app-input"
                        placeholder="Seu nome"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium">E-mail</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1.5 app-input"
                      placeholder="voce@email.com"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Senha</label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          onClick={handleForgot}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Esqueci a senha
                        </button>
                      )}
                    </div>
                    <div className="relative mt-1.5">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="app-input pr-12"
                        placeholder="••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-base shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
                  </button>
                </form>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                  Ao continuar, você concorda com os termos de uso.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
