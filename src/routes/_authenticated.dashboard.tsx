import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Warehouse, Scale, Utensils, Plus, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Início — Viveiros" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data: viveiros } = await supabase
        .from("viveiros")
        .select("id, status, qtd_povoada")
        .eq("status", "ativo");
      const hoje = new Date().toISOString().slice(0, 10);
      const { data: lancamentos } = await supabase
        .from("lancamentos")
        .select("quantidade")
        .eq("tipo", "racao")
        .eq("data_lancamento", hoje);
      return {
        ativos: viveiros?.length ?? 0,
        povoamento: viveiros?.reduce((s, v) => s + (v.qtd_povoada ?? 0), 0) ?? 0,
        racaoHoje: lancamentos?.reduce((s, l) => s + Number(l.quantidade ?? 0), 0) ?? 0,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Olá 👋</h1>
        <p className="text-muted-foreground mt-1">Resumo de hoje</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <KpiCard
          icon={Warehouse}
          label="Viveiros ativos"
          value={isLoading ? "—" : String(data?.ativos ?? 0)}
        />
        <KpiCard
          icon={Scale}
          label="Povoados"
          value={isLoading ? "—" : (data?.povoamento ?? 0).toLocaleString("pt-BR")}
          hint="camarões"
        />
        <KpiCard
          icon={Utensils}
          label="Ração hoje"
          value={
            isLoading
              ? "—"
              : (data?.racaoHoje ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
          }
          hint="kg"
        />
        <KpiCard icon={AlertCircle} label="Alertas" value="0" />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Atalhos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/viveiros"
            className="flex items-center justify-between p-5 rounded-2xl bg-card border hover:border-primary/40 transition"
          >
            <div>
              <p className="font-semibold">Meus viveiros</p>
              <p className="text-sm text-muted-foreground">Cadastrar e abrir</p>
            </div>
            <Plus className="size-5 text-primary" />
          </Link>
          <Link
            to="/lancamentos"
            className="flex items-center justify-between p-5 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-md shadow-primary/20"
          >
            <div>
              <p className="font-semibold">Lançar agora</p>
              <p className="text-sm opacity-90">Ração, probiótico…</p>
            </div>
            <Plus className="size-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="p-5 rounded-2xl bg-card border">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Icon className="size-4" />
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight">{value}</span>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
