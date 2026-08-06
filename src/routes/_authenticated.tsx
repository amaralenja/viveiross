import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Warehouse, FlaskConical, FileText, LogOut, Package, Wallet, Plus, Zap, Shield, Clock, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { PasswordLock, isUnlocked, lockApp } from "@/components/PasswordLock";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getMyAccessFn } from "@/lib/admin.functions";
import { usePwConfig, sectionRequiresLock } from "@/lib/password-config";
import { CalculadoraPopup } from "@/components/Calculadora";


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        throw redirect({ to: "/login" });
      }
    }
  },
  component: AuthLayout,
});

const NAV = [
  { to: "/dashboard", label: "Início", icon: LayoutDashboard },
  { to: "/viveiros", label: "Viveiros", icon: Warehouse },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/biometrias", label: "Biometria", icon: FlaskConical },
  { to: "/caixa", label: "Caixa", icon: Wallet },
] as const;

const MAIS_BASE = [
  { to: "/relatorios", label: "Relatórios", icon: FileText },
  { to: "/caixa-simples", label: "Caixa Simples", icon: Zap },
  { to: "/senhas", label: "Senhas", icon: KeyRound },
] as const;

type NavItem = { to: string; label: string; icon: typeof FileText };

function AuthLayout() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unlockedSections, setUnlockedSections] = useState<string[]>([]);
  const [maisOpen, setMaisOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const getMyAccess = useServerFn(getMyAccessFn);
  const { data: acesso, isLoading: accessLoading } = useQuery({
    queryKey: ["my-access", user?.id],
    queryFn: () => getMyAccess(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const isAdmin = !!acesso?.is_admin;
  const expiraEm = acesso?.expires_at ? new Date(acesso.expires_at).getTime() : null;
  const hasAccess = !!acesso?.has_access;
  const expirado = !isAdmin && hasAccess && expiraEm != null && expiraEm <= Date.now();
  const pendente = !isAdmin && !!acesso && (!hasAccess || expiraEm == null);
  void expiraEm;

  const MAIS: NavItem[] = [
    ...MAIS_BASE,
    ...(isAdmin ? [{ to: "/admin", label: "Administrador", icon: Shield }] : []),
  ];

  const pwCfg = usePwConfig(user?.id);

  useEffect(() => {
    const syncUnlocked = () => {
      try {
        const raw = localStorage.getItem("app_unlocked_sections");
        setUnlockedSections(raw ? JSON.parse(raw) : []);
      } catch {
        setUnlockedSections([]);
      }
    };
    syncUnlocked();
    window.addEventListener("pwcfg:changed", syncUnlocked);
    return () => window.removeEventListener("pwcfg:changed", syncUnlocked);
  }, []);

  const senhasRequiresLock =
    pwCfg.enabled && !!pwCfg.pin && location.pathname.startsWith("/senhas");
  const requiresLock =
    (sectionRequiresLock(pwCfg, location.pathname) || senhasRequiresLock) &&
    !unlockedSections.some((s) => location.pathname.startsWith(s));

  async function handleLogout() {
    lockApp();
    setUnlockedSections([]);
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  function handleNav(to: string, _e: React.MouseEvent) {
    // Navigation continues naturally; PasswordLock overlay will catch protected sections if locked
  }

  if (authLoading || (!!user && accessLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-muted-foreground">
        Carregando acesso...
      </div>
    );
  }

  if (expirado || pendente) {
    const msg = pendente ? "Vital, acabei de criar minha conta e quero liberar o acesso" : "Vital, minha assinatura venceu";
    const whatsappUrl = `https://wa.me/5588972968298?text=${encodeURIComponent(msg)}`;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-8 text-center">
          <Clock className="mx-auto size-12 text-destructive" />
          <h1 className="mt-4 text-2xl font-bold">
            {pendente ? "Conta aguardando liberação" : "Sua assinatura venceu"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {pendente
              ? "Sua conta foi criada, mas o administrador ainda precisa liberar o acesso. Fale com o Vital no WhatsApp."
              : "Fale com o Vital no WhatsApp para renovar seu acesso."}
          </p>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 px-5 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700"
          >
            Falar com Vital
          </a>
          <button
            onClick={handleLogout}
            className="mt-3 block mx-auto h-10 px-5 rounded-xl border text-sm font-medium"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }





  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-hidden bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b">
        <div className="mx-auto flex w-full max-w-5xl min-w-0 items-center justify-between px-5 py-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold">
              V
            </div>
            <span className="font-bold text-lg">Viveiros</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            title={user?.email ?? ""}
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 overflow-x-hidden px-5 py-6">
        {requiresLock ? (
          <PasswordLock
            pin={pwCfg.pin}
            sectionPath={location.pathname}
            onUnlock={() => {
              try {
                const raw = localStorage.getItem("app_unlocked_sections");
                setUnlockedSections(raw ? JSON.parse(raw) : []);
              } catch {
                setUnlockedSections([]);
              }
            }}
          />
        ) : (
          <Outlet />
        )}
      </main>

      {/* Calculadora Flutuante Global */}
      <CalculadoraPopup />

      <nav className="fixed bottom-0 inset-x-0 z-10 bg-card/95 backdrop-blur border-t">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-6">
          {NAV.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={(e) => handleNav(item.to, e)}
                className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                  active ? "text-primary" : "text-muted-foreground"
                } min-w-0`}
              >
                <Icon className={`size-5 ${active ? "stroke-[2.5]" : ""}`} />
                <span className="max-w-full truncate px-0.5 text-[9px] sm:text-[11px] leading-none">{item.label}</span>
              </Link>
            );
          })}
          {(() => {
            const active = MAIS.some((m) => location.pathname.startsWith(m.to));
            return (
              <button
                type="button"
                onClick={() => setMaisOpen(true)}
                className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                  active ? "text-primary" : "text-muted-foreground"
                } min-w-0`}
              >
                <Plus className={`size-5 ${active ? "stroke-[2.5]" : ""}`} />
                <span className="max-w-full truncate px-0.5 text-[9px] sm:text-[11px] leading-none">Mais</span>
              </button>
            );
          })()}
        </div>
      </nav>

      <Sheet open={maisOpen} onOpenChange={setMaisOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Mais opções</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {MAIS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.to}
                  onClick={(e) => {
                    setMaisOpen(false);
                    if (sectionRequiresLock(pwCfg, item.to) && !unlocked) {
                      e.preventDefault();
                      setPending(item.to);
                      return;
                    }
                    navigate({ to: item.to });
                  }}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 hover:bg-accent transition"
                >
                  <Icon className="size-7 text-primary" />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>


      {pending && (
        <PasswordLock
          pin={pwCfg.pin}
          onUnlock={() => {
            setUnlocked(true);
            const to = pending;
            setPending(null);
            navigate({ to });
          }}
        />
      )}
    </div>
  );
}

