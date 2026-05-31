import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Warehouse, ClipboardList, FlaskConical, FileText, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AuthLayout,
});

const NAV = [
  { to: "/dashboard", label: "Início", icon: LayoutDashboard },
  { to: "/viveiros", label: "Viveiros", icon: Warehouse },
  { to: "/lancamentos", label: "Lançar", icon: ClipboardList },
  { to: "/biometrias", label: "Biometria", icon: FlaskConical },
  { to: "/relatorios", label: "Relatórios", icon: FileText },
] as const;

function AuthLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
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
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-10 bg-card/95 backdrop-blur border-t">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-5">
          {NAV.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-1 py-3 text-xs font-medium transition ${
                  active ? "text-primary" : "text-muted-foreground"
                } min-w-0`}
              >
                <Icon className={`size-6 ${active ? "stroke-[2.5]" : ""}`} />
                <span className="max-w-full truncate px-0.5 text-[10px] sm:text-xs">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
