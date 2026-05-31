import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Download, FileText, Scale, Utensils } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, qtd_povoada, data_povoamento, status, fazendas(nome)")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["lancamentos", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("viveiro_id, produto_nome, quantidade, unidade, tipo, data_lancamento")
        .order("data_lancamento", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: biometrias = [] } = useQuery({
    queryKey: ["biometrias", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("biometrias")
        .select("viveiro_id, data_biometria, peso_medio_g, sobrevivencia_percent")
        .order("data_biometria", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const linhas = useMemo(() => {
    return viveiros.map((v: any) => {
      const racaoKg = lancamentos
        .filter((l) => l.viveiro_id === v.id && l.tipo === "racao")
        .reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
      const ultimaBio = biometrias.find((b) => b.viveiro_id === v.id);
      const pesoMedio = Number(ultimaBio?.peso_medio_g ?? 0);
      const sobrevivencia = Number(ultimaBio?.sobrevivencia_percent ?? 0);
      const biomassa = ((v.qtd_povoada ?? 0) * (sobrevivencia / 100) * pesoMedio) / 1000;
      const fca = biomassa > 0 ? racaoKg / biomassa : 0;
      return {
        viveiro: v.nome,
        fazenda: v.fazendas?.nome ?? "Sem fazenda",
        status: v.status,
        dias: v.data_povoamento ? diasDeCultivo(v.data_povoamento) : null,
        qtdPovoada: v.qtd_povoada ?? 0,
        racaoKg,
        pesoMedio,
        sobrevivencia,
        biomassa,
        fca,
      };
    });
  }, [biometrias, lancamentos, viveiros]);

  const totais = useMemo(() => {
    return linhas.reduce(
      (acc, l) => ({
        viveiros: acc.viveiros + 1,
        racaoKg: acc.racaoKg + l.racaoKg,
        biomassa: acc.biomassa + l.biomassa,
      }),
      { viveiros: 0, racaoKg: 0, biomassa: 0 },
    );
  }, [linhas]);

  function exportCsv() {
    const header = [
      "Viveiro",
      "Fazenda",
      "Status",
      "Dias",
      "Povoados",
      "Ração kg",
      "Peso médio g",
      "Sobrevivência %",
      "Biomassa kg",
      "FCA",
    ];
    const rows = linhas.map((l) => [
      l.viveiro,
      l.fazenda,
      l.status,
      l.dias ?? "",
      l.qtdPovoada,
      l.racaoKg.toFixed(3),
      l.pesoMedio.toFixed(2),
      l.sobrevivencia.toFixed(2),
      l.biomassa.toFixed(2),
      l.fca.toFixed(2),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-viveiros-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground mt-1">Consumo, biomassa e FCA por viveiro</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={linhas.length === 0}
          className="h-12 px-4 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
        >
          <Download className="size-5" /> CSV
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ResumoCard icon={FileText} label="Viveiros" value={String(totais.viveiros)} />
        <ResumoCard icon={Utensils} label="Ração" value={`${formatNumber(totais.racaoKg)} kg`} />
        <ResumoCard icon={Scale} label="Biomassa" value={`${formatNumber(totais.biomassa)} kg`} />
      </div>

      {linhas.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
          Sem dados ainda para relatório.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left p-4 font-semibold">Viveiro</th>
                <th className="text-right p-4 font-semibold">Dias</th>
                <th className="text-right p-4 font-semibold">Povoados</th>
                <th className="text-right p-4 font-semibold">Ração</th>
                <th className="text-right p-4 font-semibold">Peso</th>
                <th className="text-right p-4 font-semibold">Biomassa</th>
                <th className="text-right p-4 font-semibold">FCA</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.viveiro} className="border-t">
                  <td className="p-4">
                    <p className="font-semibold">{l.viveiro}</p>
                    <p className="text-xs text-muted-foreground">{l.fazenda}</p>
                  </td>
                  <td className="p-4 text-right">{l.dias ?? "—"}</td>
                  <td className="p-4 text-right">{l.qtdPovoada.toLocaleString("pt-BR")}</td>
                  <td className="p-4 text-right">{formatNumber(l.racaoKg)} kg</td>
                  <td className="p-4 text-right">
                    {l.pesoMedio ? `${formatNumber(l.pesoMedio)} g` : "—"}
                  </td>
                  <td className="p-4 text-right">
                    {l.biomassa ? `${formatNumber(l.biomassa)} kg` : "—"}
                  </td>
                  <td className="p-4 text-right font-semibold">
                    {l.fca ? formatNumber(l.fca) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResumoCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card border p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p className="mt-2 text-xl font-bold break-words">{value}</p>
    </div>
  );
}

function diasDeCultivo(data: string) {
  const d = new Date(data);
  const hoje = new Date();
  return Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}
