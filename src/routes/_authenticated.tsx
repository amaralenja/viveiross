import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Warehouse, FileText, LogOut, Package, Wallet, Plus, Zap, Shield, Clock, KeyRound, DollarSign, HelpCircle, Youtube } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { PasswordLock, isUnlocked, lockApp } from "@/components/PasswordLock";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getMyAccessFn } from "@/lib/admin.functions";
import { usePwConfig, sectionRequiresLock } from "@/lib/password-config";
import { CalculadoraPopup } from "@/components/Calculadora";
import { useTutorial } from "@/hooks/use-tutorial";


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
  { to: "/caixa", label: "Caixa", icon: Wallet },
] as const;

const MAIS_BASE = [
  { to: "/relatorios", label: "Relatórios", icon: FileText },
  { to: "/financeiro", label: "Financeiro", icon: DollarSign },
  { to: "/senhas", label: "Senhas", icon: KeyRound },
] as const;

type NavItem = { to: string; label: string; icon: typeof FileText };

function AuthLayout() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unlockedSections, setUnlockedSections] = useState<string[]>([]);
  const [maisOpen, setMaisOpen] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [tutorVideo, setTutorVideo] = useState<string | null>(null);
  const [tutorLabel, setTutorLabel] = useState("");

  useEffect(() => {
    const handler = (e: Event) => {
      const { videoId, label } = (e as CustomEvent).detail;
      setTutorVideo(videoId); setTutorLabel(label); setTutorOpen(true);
    };
    window.addEventListener("tutorial:open", handler);
    return () => window.removeEventListener("tutorial:open", handler);
  }, []);

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
    !unlockedSections.some((s) => location.pathname === s || location.pathname.startsWith(s + "/"));

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
          <div className="flex items-center gap-2">
            <button onClick={() => setTutorOpen(true)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition"
              title="Tutoriais"><HelpCircle className="size-4"/> <span className="hidden sm:inline">Ajuda</span></button>
            <button onClick={handleLogout}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              title={user?.email ?? ""}><LogOut className="size-4"/>
              <span className="hidden sm:inline">Sair</span></button>
          </div>
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
        <div className="mx-auto grid w-full max-w-5xl" style={{ gridTemplateColumns: `repeat(${NAV.length + 1}, minmax(0, 1fr))` }}>
          {NAV.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={(e) => handleNav(item.to, e)}
                className={`flex flex-col items-center gap-1 py-3 text-xs font-medium transition ${
                  active ? "text-primary" : "text-muted-foreground"
                } min-w-0`}
              >
                <Icon className={`size-6 ${active ? "stroke-[2.5]" : ""}`} />
                <span className="max-w-full truncate px-0.5 text-[11px] sm:text-xs leading-none">{item.label}</span>
              </Link>
            );
          })}
          {(() => {
            const active = MAIS.some((m) => location.pathname.startsWith(m.to));
            return (
              <button
                type="button"
                onClick={() => setMaisOpen(true)}
                className={`flex flex-col items-center gap-1 py-3 text-xs font-medium transition ${
                  active ? "text-primary" : "text-muted-foreground"
                } min-w-0`}
              >
                <Plus className={`size-6 ${active ? "stroke-[2.5]" : ""}`} />
                <span className="max-w-full truncate px-0.5 text-[11px] sm:text-xs leading-none">Mais</span>
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
      {tutorOpen && !tutorVideo && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setTutorOpen(false)}>
          <div className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-lg flex items-center gap-2"><Youtube className="size-5 text-red-600"/> Tutoriais</h2>
              <button onClick={() => setTutorOpen(false)} className="size-9 rounded-lg hover:bg-muted flex items-center justify-center">✕</button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {[
                { label: "Início", id: "D7GysoMWd-w" },
                { label: "Viveiros", id: "EIvub9T9ED4" },
                { label: "Caixa", id: "WDe74R9yfes" },
                { label: "Relatórios", id: "6ToxQuEVPAA" },
                { label: "Financeiro", id: "VrvKKymfpAE" },
                { label: "Senhas", id: "mgsGVqLeSM4" },
              ].map(t => (
                <button key={t.id} onClick={() => { setTutorVideo(t.id); setTutorLabel(t.label); }}
                  className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted transition text-sm font-semibold w-full text-left">
                  <div className="size-9 rounded-lg bg-red-500/10 text-red-600 flex items-center justify-center shrink-0"><Youtube className="size-4"/></div>
                  <span className="flex-1">{t.label}</span>
                  <span className="text-[10px] text-muted-foreground">Ver ▶</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tutorOpen && tutorVideo && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setTutorVideo(null); setTutorLabel(""); setTutorOpen(false); }}>
          <div className="bg-card rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <button onClick={() => setTutorVideo(null)} className="size-8 rounded-lg hover:bg-muted flex items-center justify-center text-sm">← Voltar</button>
                <h2 className="font-bold text-lg">🎬 {tutorLabel}</h2>
              </div>
              <button onClick={() => { setTutorVideo(null); setTutorLabel(""); setTutorOpen(false); }} className="size-9 rounded-lg hover:bg-muted flex items-center justify-center">✕</button>
            </div>
            <div className="p-2">
              <div className="relative w-full" style={{paddingBottom:"56.25%"}}>
                <iframe className="absolute inset-0 w-full h-full rounded-xl"
                  src={`https://www.youtube.com/embed/${tutorVideo}?autoplay=1&rel=0`}
                  allow="autoplay; encrypted-media" allowFullScreen title="Tutorial" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

