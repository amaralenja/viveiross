import { todayLocal } from "@/lib/date";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Utensils,
  Activity,
  FlaskConical,
  ClipboardList,
  Trash2,
} from "lucide-react";
import type { ComponentType } from "react";

type IconComponent = ComponentType<{ className?: string }>;

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Início — Viveiros" }] }),
  component: Dashboard,
});

type Lanc = {
  id: string;
  data_lancamento: string;
  produto_nome: string;
  quantidade: number;
  unidade: string;
  tipo: string;
  viveiros: { nome: string } | { nome: string }[] | null;
};

type Bio = {
  id: string;
  data_biometria: string;
  peso_medio_g: number;
  viveiros: { nome: string } | { nome: string }[] | null;
};

function relName(rel: { nome: string } | { nome: string }[] | null | undefined): string {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.nome ?? "";
  return rel.nome ?? "";
}

function Dashboard() {
  const qc = useQueryClient();
  const delLanc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["viveiros", "totais"] });
      toast.success("Lançamento removido");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data: viveiros } = await supabase
        .from("viveiros")
        .select("id, status, qtd_povoada")
        .eq("status", "ativo");
      const hoje = todayLocal();
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

  const { data: ultimosLanc = [] } = useQuery({
    queryKey: ["dashboard", "ultimos-lancamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("id, data_lancamento, produto_nome, quantidade, unidade, tipo, viveiros(nome)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Lanc[];
    },
  });

  const { data: ultimasBio = [] } = useQuery({
    queryKey: ["dashboard", "ultimas-biometrias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("biometrias")
        .select("id, viveiro_id, data_biometria, peso_medio_g, viveiros(nome)")
        .order("data_biometria", { ascending: false })
        .limit(200);
      if (error) throw error;
      const seen = new Set<string>();
      const latestPerViveiro: Bio[] = [];
      for (const b of (data ?? []) as (Bio & { viveiro_id: string })[]) {
        if (seen.has(b.viveiro_id)) continue;
        seen.add(b.viveiro_id);
        latestPerViveiro.push(b);
        if (latestPerViveiro.length >= 10) break;
      }
      return latestPerViveiro;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Olá 👋</h1>
        <p className="text-muted-foreground mt-1">Resumo de hoje</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
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
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="size-5 text-primary" /> Últimos lançamentos
          </h2>
          <Link to="/viveiros" className="text-sm text-primary font-medium">
            Ver todos
          </Link>
        </div>
        {ultimosLanc.length === 0 ? (
          <EmptyMini icon={ClipboardList} text="Sem lançamentos ainda." />
        ) : (
          <ul className="space-y-2">
            {ultimosLanc.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between p-4 rounded-xl bg-card border"
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">{l.produto_nome}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {relName(l.viveiros) || "—"} · {formatDate(l.data_lancamento)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className="text-sm font-bold">
                    {Number(l.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                    {l.unidade}
                  </span>
                  <button
                    onClick={() => {
                      if (confirm(`Apagar o lançamento de ${l.produto_nome}?`))
                        delLanc.mutate(l.id);
                    }}
                    className="size-9 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                    aria-label="Apagar lançamento"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FlaskConical className="size-5 text-primary" /> Últimas biometrias
          </h2>
          <Link to="/biometrias" className="text-sm text-primary font-medium">
            Ver todas
          </Link>
        </div>
        {ultimasBio.length === 0 ? (
          <EmptyMini icon={FlaskConical} text="Sem biometrias ainda." />
        ) : (
          <ul className="space-y-2">
            {ultimasBio.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between p-4 rounded-xl bg-card border"
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">{relName(b.viveiros) || "Viveiro"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {formatDate(b.data_biometria)}
                  </p>
                </div>
                <span className="text-sm font-bold shrink-0 ml-3">
                  {Number(b.peso_medio_g).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} g
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function EmptyMini({ icon: Icon, text }: { icon: IconComponent; text: string }) {
  return (
    <div className="p-5 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
      <Icon className="size-4" /> {text}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: IconComponent;
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
