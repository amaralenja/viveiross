import { todayLocal } from "@/lib/date";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileDown, FileText, Printer, Scale, Utensils, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ViveiroRelatorio = {
  id: string;
  nome: string;
  qtd_povoada: number | null;
  data_povoamento: string | null;
  status: string;
  fornecedor: string | null;
  fazendas: { nome: string } | null;
};
type LancamentoRelatorio = {
  viveiro_id: string;
  produto_nome: string;
  quantidade: number;
  unidade: string;
  tipo: string;
  custo_total: number | null;
  preco_unidade: number | null;
  data_lancamento: string;
};
type BiometriaRelatorio = {
  viveiro_id: string;
  data_biometria: string;
  peso_medio_g: number;
  sobrevivencia_percent: number | null;
};

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const [printOnlyId, setPrintOnlyId] = useState<string | null>(null);

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, qtd_povoada, data_povoamento, status, fornecedor, fazendas(nome)")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as ViveiroRelatorio[];
    },
  });

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["lancamentos", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("viveiro_id, produto_nome, quantidade, unidade, tipo, custo_total, preco_unidade, data_lancamento")
        .order("data_lancamento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LancamentoRelatorio[];
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
      return (data ?? []) as BiometriaRelatorio[];
    },
  });

  const linhas = useMemo(() => {
    return viveiros.map((v) => {
      const lancs = lancamentos.filter((l) => l.viveiro_id === v.id);
      const lancsRacao = lancs.filter((l) => l.tipo === "racao");
      const lancsOutros = lancs.filter((l) => l.tipo !== "racao");

      const racaoKg = lancsRacao.reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
      const custoRacao = lancsRacao.reduce((s, l) => s + Number(l.custo_total ?? 0), 0);
      const custoOutros = lancsOutros.reduce((s, l) => s + Number(l.custo_total ?? 0), 0);
      const custoTotal = custoRacao + custoOutros;

      const bios = biometrias.filter((b) => b.viveiro_id === v.id);
      const ultimaBio = bios[0];
      const pesoMedio = Number(ultimaBio?.peso_medio_g ?? 0);
      const sobrevivencia = Number(ultimaBio?.sobrevivencia_percent ?? 0);
      const biomassa = ((v.qtd_povoada ?? 0) * (sobrevivencia / 100) * pesoMedio) / 1000;
      const fca = biomassa > 0 ? racaoKg / biomassa : 0;
      const custoPorKg = biomassa > 0 ? custoTotal / biomassa : 0;

      const datasLanc = lancs.map((l) => l.data_lancamento).sort();
      const primeiraData = datasLanc[0];
      const base = v.data_povoamento ?? primeiraData ?? null;
      const dias = base ? diasDeCultivo(base) : null;

      // Ração dia a dia
      const mapaRacao = new Map<string, { kg: number; custo: number }>();
      for (const l of lancsRacao) {
        const cur = mapaRacao.get(l.data_lancamento) ?? { kg: 0, custo: 0 };
        cur.kg += Number(l.quantidade ?? 0);
        cur.custo += Number(l.custo_total ?? 0);
        mapaRacao.set(l.data_lancamento, cur);
      }
      const racaoDiaria = Array.from(mapaRacao.entries())
        .map(([data, r]) => ({ data, kg: r.kg, custo: r.custo }))
        .sort((a, b) => (a.data < b.data ? 1 : -1));

      return {
        id: v.id,
        viveiro: v.nome,
        fazenda: v.fazendas?.nome ?? "Sem fazenda",
        status: v.status,
        fornecedor: v.fornecedor ?? "—",
        dataPovoamento: v.data_povoamento,
        dias,
        qtdPovoada: v.qtd_povoada ?? 0,
        racaoKg,
        custoRacao,
        custoOutros,
        custoTotal,
        custoPorKg,
        pesoMedio,
        sobrevivencia,
        biomassa,
        fca,
        ultimaBioData: ultimaBio?.data_biometria ?? null,
        nLancamentos: lancs.length,
        nBiometrias: bios.length,
        lancs,
        bios,
        racaoDiaria,
      };
    });
  }, [biometrias, lancamentos, viveiros]);

  const totais = useMemo(() => {
    return linhas.reduce(
      (acc, l) => ({
        viveiros: acc.viveiros + 1,
        racaoKg: acc.racaoKg + l.racaoKg,
        biomassa: acc.biomassa + l.biomassa,
        custoTotal: acc.custoTotal + l.custoTotal,
      }),
      { viveiros: 0, racaoKg: 0, biomassa: 0, custoTotal: 0 },
    );
  }, [linhas]);

  async function exportPdf() {
    const [pdfModule, tableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const jsPDF = pdfModule.default;
    const autoTable = (tableModule as { default?: unknown; autoTable?: unknown }).default ?? (tableModule as { autoTable?: unknown }).autoTable;
    if (typeof autoTable !== "function") throw new Error("PDF generator falhou.");

    const doc = new jsPDF({ orientation: "landscape" });
    const hoje = new Date().toLocaleDateString("pt-BR");
    doc.setFontSize(16);
    doc.text("Relatório Completo de Viveiros", 14, 16);
    doc.setFontSize(10);
    doc.text(`Gerado em ${hoje}`, 14, 22);
    doc.text(
      `Viveiros: ${totais.viveiros} | Ração: ${formatNumber(totais.racaoKg)} kg | Biomassa: ${formatNumber(totais.biomassa)} kg | Custo: ${formatBRL(totais.custoTotal)}`,
      14,
      28,
    );
    const header = ["Viveiro","Fazenda","Povoamento","Dias","Povoados","Ração kg","Custo total","Peso g","Sobrev.","Biomassa","FCA","R$/kg"];
    const rows = linhas.map((l) => [
      l.viveiro, l.fazenda,
      l.dataPovoamento ? formatDate(l.dataPovoamento) : "—",
      String(l.dias ?? "—"),
      l.qtdPovoada.toLocaleString("pt-BR"),
      formatNumber(l.racaoKg),
      formatBRL(l.custoTotal),
      l.pesoMedio ? formatNumber(l.pesoMedio) : "—",
      l.sobrevivencia ? formatNumber(l.sobrevivencia) : "—",
      l.biomassa ? formatNumber(l.biomassa) : "—",
      l.fca ? formatNumber(l.fca) : "—",
      l.custoPorKg ? formatBRL(l.custoPorKg) : "—",
    ]);
    (autoTable as (d: unknown, o: unknown) => void)(doc, {
      head: [header], body: rows, startY: 34,
      styles: { fontSize: 8 }, headStyles: { fillColor: [13, 148, 136] },
    });
    doc.save(`relatorio-viveiros-${todayLocal()}.pdf`);
  }

  function imprimirTudo() {
    setPrintOnlyId(null);
    setTimeout(() => window.print(), 50);
  }

  function imprimirViveiro(id: string) {
    setPrintOnlyId(id);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintOnlyId(null), 200);
    }, 50);
  }

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only-target { display: block !important; }
          ${printOnlyId ? `.viveiro-card:not([data-vid="${printOnlyId}"]) { display: none !important; }` : ""}
        }
      `}</style>

      <div className="no-print flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="mt-1 text-muted-foreground break-words">Extrato por viveiro</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <button
            onClick={imprimirTudo}
            disabled={linhas.length === 0}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border bg-secondary px-3 font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 sm:px-4"
          >
            <Printer className="size-5" /> Imprimir tudo
          </button>
          <button
            onClick={exportPdf}
            disabled={linhas.length === 0}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 font-semibold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 sm:px-4"
          >
            <FileDown className="size-5" /> PDF
          </button>
        </div>
      </div>

      <div className="no-print grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <ResumoCard Icon={FileText} label="Viveiros" value={String(totais.viveiros)} />
        <ResumoCard Icon={Utensils} label="Ração" value={`${formatNumber(totais.racaoKg)} kg`} />
        <ResumoCard Icon={Scale} label="Biomassa" value={`${formatNumber(totais.biomassa)} kg`} />
        <ResumoCard Icon={DollarSign} label="Custo total" value={formatBRL(totais.custoTotal)} />
      </div>

      {linhas.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
          Sem dados ainda para relatório.
        </p>
      ) : (
        <div className="grid min-w-0 gap-4">
          {linhas.map((l) => (
            <div
              key={l.id}
              data-vid={l.id}
              className="viveiro-card min-w-0 rounded-2xl border bg-card p-5 print:border-black"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-bold">{l.viveiro}</h2>
                  <p className="break-words text-xs text-muted-foreground">
                    {l.fazenda} • {l.status} • {l.dias != null ? `${l.dias} dias de cultivo` : "sem povoamento"}
                  </p>
                </div>
                <button
                  onClick={() => imprimirViveiro(l.id)}
                  className="no-print inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
                >
                  <Printer className="size-4" /> Imprimir
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 md:grid-cols-4">
                <Info label="Fornecedor" value={l.fornecedor} />
                <Info label="Povoamento" value={l.dataPovoamento ? formatDate(l.dataPovoamento) : "—"} />
                <Info label="Pós-larvas" value={l.qtdPovoada.toLocaleString("pt-BR")} />
                <Info label="Ração total" value={`${formatNumber(l.racaoKg)} kg`} />
                <Info label="Custo ração" value={formatBRL(l.custoRacao)} />
                <Info label="Custo outros" value={formatBRL(l.custoOutros)} />
                <Info label="Custo total" value={formatBRL(l.custoTotal)} />
                <Info label="R$/kg" value={l.custoPorKg ? formatBRL(l.custoPorKg) : "—"} />
                <Info label="Peso médio" value={l.pesoMedio ? `${formatNumber(l.pesoMedio)} g` : "—"} />
                <Info label="Sobrev." value={l.sobrevivencia ? `${formatNumber(l.sobrevivencia)} %` : "—"} />
                <Info label="Biomassa" value={l.biomassa ? `${formatNumber(l.biomassa)} kg` : "—"} />
                <Info label="FCA" value={l.fca ? formatNumber(l.fca) : "—"} />
                <Info label="Lançamentos" value={String(l.nLancamentos)} />
                <Info label="Biometrias" value={String(l.nBiometrias)} />
                <Info label="Última biometria" value={l.ultimaBioData ? formatDate(l.ultimaBioData) : "—"} />
              </div>

              {l.bios.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Biometrias</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Data</th>
                          <th className="p-2 text-right">Peso médio (g)</th>
                          <th className="p-2 text-right">Sobrev. (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.bios.map((b, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{formatDate(b.data_biometria)}</td>
                            <td className="p-2 text-right">{formatNumber(Number(b.peso_medio_g ?? 0))}</td>
                            <td className="p-2 text-right">{b.sobrevivencia_percent != null ? formatNumber(Number(b.sobrevivencia_percent)) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {l.lancs.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lançamentos</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Data</th>
                          <th className="p-2 text-left">Produto</th>
                          <th className="p-2 text-left">Tipo</th>
                          <th className="p-2 text-right">Qtd</th>
                          <th className="p-2 text-right">Custo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.lancs.map((x, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{formatDate(x.data_lancamento)}</td>
                            <td className="p-2">{x.produto_nome}</td>
                            <td className="p-2">{x.tipo}</td>
                            <td className="p-2 text-right">{formatNumber(Number(x.quantidade ?? 0))} {x.unidade}</td>
                            <td className="p-2 text-right">{formatBRL(Number(x.custo_total ?? 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumoCard({
  Icon,
  label,
  value,
}: {
  Icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p className="mt-2 text-xl font-bold break-words">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words font-semibold">{value}</p>
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

function formatBRL(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  if (y && m && day) return `${day}/${m}/${y}`;
  return new Date(d).toLocaleDateString("pt-BR");
}
