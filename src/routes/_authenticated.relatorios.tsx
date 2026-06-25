import { todayLocal } from "@/lib/date";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { FileDown, FileText, Scale, Utensils, DollarSign, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sortByViveiroNome } from "@/lib/sort";

type ViveiroRelatorio = {
  id: string;
  nome: string;
  qtd_povoada: number | null;
  data_povoamento: string | null;
  status: string;
  fornecedor: string | null;
  fazendas: { nome: string } | { nome: string }[] | null;
};
type LancamentoRelatorio = {
  id: string;
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
  id: string;
  viveiro_id: string;
  data_biometria: string;
  peso_medio_g: number;
  amostras: number | null;
  sobrevivencia_percent: number | null;
};

function textValue(value: unknown, fallback = "—"): string {
  if (value == null || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return textValue(value[0], fallback);
  if (typeof value === "object" && "nome" in value) return textValue((value as { nome?: unknown }).nome, fallback);
  return fallback;
}

function relName(rel: { nome: string } | { nome: string }[] | null | undefined): string {
  return textValue(rel, "");
}

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const qc = useQueryClient();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [editLanc, setEditLanc] = useState<LancamentoRelatorio | null>(null);
  const [editBio, setEditBio] = useState<BiometriaRelatorio | null>(null);

  function toggleSel(id: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, qtd_povoada, data_povoamento, status, fornecedor, fazendas(nome)")
        .order("nome");
      if (error) throw error;
      return sortByViveiroNome((data ?? []) as unknown as ViveiroRelatorio[], (v) => v.nome);
    },
  });

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["lancamentos", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("id, viveiro_id, produto_nome, quantidade, unidade, tipo, custo_total, preco_unidade, data_lancamento")
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
        .select("id, viveiro_id, data_biometria, peso_medio_g, amostras, sobrevivencia_percent")
        .order("data_biometria", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BiometriaRelatorio[];
    },
  });

  const { data: despesas = [] } = useQuery({
    queryKey: ["despesas_gerais", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despesas_gerais")
        .select("id, viveiro_id, descricao, categoria, valor, data_despesa, rateio")
        .order("data_despesa", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; viveiro_id: string | null; descricao: string; categoria: string | null; valor: number; data_despesa: string; rateio: string }>;
    },
  });

  const linhas = useMemo(() => {
    const nViv = Math.max(1, viveiros.length);
    const despesasRateadas = despesas.filter((d) => d.rateio === "todos" || d.viveiro_id == null);
    const despesasIndividuais = despesas.filter((d) => d.rateio !== "todos" && d.viveiro_id != null);
    const custoRateioPorViveiro = despesasRateadas.reduce((s, d) => s + Number(d.valor ?? 0), 0) / nViv;

    return viveiros.map((v) => {
      const lancs = lancamentos.filter((l) => l.viveiro_id === v.id);
      const lancsRacao = lancs.filter((l) => l.tipo === "racao");
      const lancsOutros = lancs.filter((l) => l.tipo !== "racao");

      const racaoKg = lancsRacao.reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
      const custoRacao = lancsRacao.reduce((s, l) => s + Number(l.custo_total ?? 0), 0);
      const custoOutrosLanc = lancsOutros.reduce((s, l) => s + Number(l.custo_total ?? 0), 0);
      const despesasDoViveiro = despesasIndividuais.filter((d) => d.viveiro_id === v.id);
      const custoDespIndiv = despesasDoViveiro.reduce((s, d) => s + Number(d.valor ?? 0), 0);
      const custoDespRateio = custoRateioPorViveiro;
      const custoOutros = custoOutrosLanc + custoDespIndiv + custoDespRateio;
      const custoTotal = custoRacao + custoOutros;

      const bios = biometrias.filter((b) => b.viveiro_id === v.id);
      const ultimaBio = bios[0];
      const pesoMedio = Number(ultimaBio?.peso_medio_g ?? 0);
      const sobrevivencia = ultimaBio?.sobrevivencia_percent != null ? Number(ultimaBio.sobrevivencia_percent) : null;
      const sobrevivenciaCalculo = sobrevivencia ?? 100;
      const qtdPovoada = Number(v.qtd_povoada ?? 0);
      const biomassa = ultimaBio && qtdPovoada > 0 && pesoMedio > 0
        ? (qtdPovoada * (sobrevivenciaCalculo / 100) * pesoMedio) / 1000
        : 0;
      const fca = ultimaBio && biomassa > 0 ? racaoKg / biomassa : null;
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

      const despesasLista = [
        ...despesasDoViveiro.map((d) => ({ ...d, share: Number(d.valor ?? 0), tipoRateio: "individual" as const })),
        ...despesasRateadas.map((d) => ({ ...d, share: Number(d.valor ?? 0) / nViv, tipoRateio: "rateado" as const })),
      ];

      return {
        id: v.id,
        viveiro: textValue(v.nome),
        fazenda: relName(v.fazendas) || "Sem fazenda",
        status: textValue(v.status),
        fornecedor: textValue(v.fornecedor),
        dataPovoamento: v.data_povoamento,
        dias,
        qtdPovoada,
        racaoKg,
        custoRacao,
        custoOutros,
        custoDespRateio,
        custoDespIndiv,
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
        despesasLista,
      };
    });
  }, [biometrias, lancamentos, viveiros, despesas]);

  const totais = useMemo(() => {
    const base = linhas.reduce(
      (acc, l) => ({
        viveiros: acc.viveiros + 1,
        racaoKg: acc.racaoKg + l.racaoKg,
        biomassa: acc.biomassa + l.biomassa,
        custoTotal: acc.custoTotal + l.custoTotal,
      }),
      { viveiros: 0, racaoKg: 0, biomassa: 0, custoTotal: 0 },
    );
    return { ...base, fca: base.biomassa > 0 ? base.racaoKg / base.biomassa : null };
  }, [linhas]);

  async function exportPdf(ids?: string[]) {
    const alvo = ids && ids.length > 0 ? linhas.filter((l) => ids.includes(l.id)) : linhas;
    if (alvo.length === 0) {
      toast.error("Nada para exportar.");
      return;
    }

    const [pdfModule, tableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const jsPDF = pdfModule.default;
    const autoTable = (tableModule as { default?: unknown; autoTable?: unknown }).default ?? (tableModule as { autoTable?: unknown }).autoTable;
    if (typeof autoTable !== "function") {
      toast.error("Falha ao carregar gerador de PDF.");
      return;
    }
    const at = autoTable as (d: unknown, o: unknown) => void;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const hoje = new Date().toLocaleDateString("pt-BR");
    const TEAL: [number, number, number] = [13, 148, 136];
    const DARK: [number, number, number] = [30, 41, 59];
    const MUTED: [number, number, number] = [100, 116, 139];

    function header(titulo: string, subtitulo: string) {
      doc.setFillColor(...TEAL);
      doc.rect(0, 0, pageW, 26, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(titulo, 14, 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(subtitulo, 14, 20);
      doc.setTextColor(...DARK);
    }

    function footer() {
      const total = doc.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(`Gerado em ${hoje} • Relatório de Viveiros`, 14, pageH - 8);
        doc.text(`Página ${i} de ${total}`, pageW - 14, pageH - 8, { align: "right" });
      }
    }

    // CAPA / RESUMO
    const totaisAlvo = alvo.reduce(
      (acc, l) => ({
        viveiros: acc.viveiros + 1,
        racaoKg: acc.racaoKg + l.racaoKg,
        biomassa: acc.biomassa + l.biomassa,
        custoTotal: acc.custoTotal + l.custoTotal,
      }),
      { viveiros: 0, racaoKg: 0, biomassa: 0, custoTotal: 0 },
    );

    const escopo = ids && ids.length > 0
      ? (alvo.length === 1 ? alvo[0].viveiro : `${alvo.length} viveiros selecionados`)
      : "Todos os viveiros";

    header("Relatório de Viveiros", `${escopo} • ${hoje}`);

    // Cards de resumo
    const cards = [
      { label: "Viveiros", value: String(totaisAlvo.viveiros) },
      { label: "Ração total", value: `${formatNumber(totaisAlvo.racaoKg)} kg` },
      { label: "Biomassa estimada", value: `${formatNumber(totaisAlvo.biomassa)} kg` },
      { label: "Custo total", value: formatBRL(totaisAlvo.custoTotal) },
    ];
    const cardW = (pageW - 28 - 12) / 4;
    cards.forEach((c, i) => {
      const x = 14 + i * (cardW + 4);
      doc.setFillColor(245, 247, 250);
      doc.roundedRect(x, 34, cardW, 22, 2, 2, "F");
      doc.setTextColor(...MUTED);
      doc.setFontSize(8);
      doc.text(c.label.toUpperCase(), x + 3, 40);
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(c.value, x + 3, 50);
      doc.setFont("helvetica", "normal");
    });

    // Tabela resumo geral
    at(doc, {
      startY: 62,
      head: [["Viveiro", "Fazenda", "Dias", "Povoados", "Ração kg", "Biom. kg", "FCA", "Custo R$", "R$/kg"]],
      body: alvo.map((l) => [
        l.viveiro,
        l.fazenda,
        String(l.dias ?? "—"),
        l.qtdPovoada.toLocaleString("pt-BR"),
        formatNumber(l.racaoKg),
        formatNumber(l.biomassa),
        l.fca != null ? formatNumber(l.fca) : "—",
        formatBRL(l.custoTotal),
        l.custoPorKg ? formatBRL(l.custoPorKg) : "—",
      ]),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });

    // DETALHES POR VIVEIRO
    for (const l of alvo) {
      doc.addPage();
      header(l.viveiro, `${l.fazenda} • ${l.status} • ${l.dias != null ? `${l.dias} dias de cultivo` : "sem povoamento"}`);

      // Bloco de métricas
      const metrics: [string, string][] = [
        ["Fornecedor", l.fornecedor],
        ["Povoamento", l.dataPovoamento ? formatDate(l.dataPovoamento) : "—"],
        ["Pós-larvas", l.qtdPovoada.toLocaleString("pt-BR")],
        ["Ração total", `${formatNumber(l.racaoKg)} kg`],
        ["Custo ração", formatBRL(l.custoRacao)],
        ["Custo outros", formatBRL(l.custoOutros)],
        ["Custo total", formatBRL(l.custoTotal)],
        ["R$ por kg", l.custoPorKg ? formatBRL(l.custoPorKg) : "—"],
        ["Peso médio", l.pesoMedio ? `${formatNumber(l.pesoMedio)} g` : "—"],
        ["Sobrevivência", l.sobrevivencia ? `${formatNumber(l.sobrevivencia)} %` : "—"],
        ["Biomassa", l.biomassa ? `${formatNumber(l.biomassa)} kg` : "—"],
        ["FCA", l.fca != null ? formatNumber(l.fca) : "—"],
      ];
      const cols = 4;
      const mW = (pageW - 28 - (cols - 1) * 3) / cols;
      const mH = 16;
      metrics.forEach((m, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = 14 + col * (mW + 3);
        const y = 32 + row * (mH + 3);
        doc.setFillColor(245, 247, 250);
        doc.roundedRect(x, y, mW, mH, 1.5, 1.5, "F");
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(m[0].toUpperCase(), x + 2.5, y + 5);
        doc.setFontSize(10);
        doc.setTextColor(...DARK);
        doc.setFont("helvetica", "bold");
        doc.text(m[1], x + 2.5, y + 12);
        doc.setFont("helvetica", "normal");
      });
      let y = 32 + Math.ceil(metrics.length / cols) * (mH + 3) + 4;

      if (l.bios.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Biometrias", 14, y);
        y += 2;
        at(doc, {
          startY: y,
          head: [["Data", "Peso médio (g)"]],
          body: l.bios.map((b) => [formatDate(b.data_biometria), formatNumber(Number(b.peso_medio_g ?? 0))]),
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: TEAL, textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }

      if (l.racaoDiaria.length > 0) {
        if (y > pageH - 40) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Ração dia a dia", 14, y);
        y += 2;
        at(doc, {
          startY: y,
          head: [["Data", "Ração (kg)", "Custo"]],
          body: l.racaoDiaria.map((r) => [formatDate(r.data), formatNumber(r.kg), formatBRL(r.custo)]),
          foot: [["Total", formatNumber(l.racaoKg), formatBRL(l.custoRacao)]],
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: TEAL, textColor: 255 },
          footStyles: { fillColor: [226, 232, 240], textColor: DARK, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }

      if (l.lancs.length > 0) {
        if (y > pageH - 40) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Lançamentos", 14, y);
        y += 2;
        at(doc, {
          startY: y,
          head: [["Data", "Produto", "Tipo", "Qtd", "Custo"]],
          body: l.lancs.map((x) => [
            formatDate(x.data_lancamento),
            x.produto_nome,
            x.tipo,
            `${formatNumber(Number(x.quantidade ?? 0))} ${x.unidade}`,
            formatBRL(Number(x.custo_total ?? 0)),
          ]),
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: TEAL, textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });
      }
    }

    footer();
    const nome = ids && ids.length === 1
      ? `relatorio-${alvo[0].viveiro.replace(/\s+/g, "-").toLowerCase()}-${todayLocal()}.pdf`
      : `relatorio-viveiros-${todayLocal()}.pdf`;
    doc.save(nome);
  }

  const delLanc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delBio = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("biometrias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Biometria removida");
      qc.invalidateQueries({ queryKey: ["biometrias"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function confirmDelLanc(id: string) {
    if (window.confirm("Apagar este lançamento?")) delLanc.mutate(id);
  }
  function confirmDelBio(id: string) {
    if (window.confirm("Apagar esta biometria?")) delBio.mutate(id);
  }

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="mt-1 text-muted-foreground break-words">Extrato por viveiro</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto">
          <button
            onClick={() => exportPdf(Array.from(selecionados))}
            disabled={selecionados.size === 0}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border bg-secondary px-3 font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 sm:px-4"
          >
            <FileDown className="size-5" /> PDF dos selecionados {selecionados.size > 0 ? `(${selecionados.size})` : ""}
          </button>
          <button
            onClick={() => exportPdf()}
            disabled={linhas.length === 0}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 font-semibold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 sm:px-4"
          >
            <FileDown className="size-5" /> PDF de tudo
          </button>
        </div>
      </div>


      <div className="no-print grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-5">
        <ResumoCard icon={<FileText className="size-4" />} label="Viveiros" value={String(totais.viveiros)} />
        <ResumoCard icon={<Utensils className="size-4" />} label="Ração" value={`${formatNumber(totais.racaoKg)} kg`} />
        <ResumoCard icon={<Scale className="size-4" />} label="Biomassa" value={`${formatNumber(totais.biomassa)} kg`} />
        <ResumoCard icon={<Scale className="size-4" />} label="FCA geral" value={totais.fca != null ? formatNumber(totais.fca) : "—"} />
        <ResumoCard icon={<DollarSign className="size-4" />} label="Custo total" value={formatBRL(totais.custoTotal)} />
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
                <div className="flex min-w-0 items-start gap-3">
                  <label className="no-print mt-1 inline-flex shrink-0 cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={selecionados.has(l.id)}
                      onChange={() => toggleSel(l.id)}
                      className="size-5 accent-primary"
                      aria-label={`Selecionar ${l.viveiro}`}
                    />
                  </label>
                  <div className="min-w-0">
                    <h2 className="break-words text-xl font-bold">{l.viveiro}</h2>
                    <p className="break-words text-xs text-muted-foreground">
                      {l.fazenda} • {l.status} • {l.dias != null ? `${l.dias} dias de cultivo` : "sem povoamento"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => exportPdf([l.id])}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
                >
                  <FileDown className="size-4" /> PDF
                </button>

              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 md:grid-cols-4">
                <Info label="Fornecedor" value={l.fornecedor} />
                <Info label="Povoamento" value={l.dataPovoamento ? formatDate(l.dataPovoamento) : "—"} />
                <Info label="Pós-larvas" value={l.qtdPovoada.toLocaleString("pt-BR")} />
                <Info label="Ração total" value={`${formatNumber(l.racaoKg)} kg`} />
                <Info label="Custo ração" value={formatBRL(l.custoRacao)} />
                <Info label="Custo outros" value={formatBRL(l.custoOutros)} />
                <Info label="Despesas (rateadas)" value={formatBRL(l.custoDespRateio)} />
                <Info label="Despesas (próprias)" value={formatBRL(l.custoDespIndiv)} />
                <Info label="Custo total" value={formatBRL(l.custoTotal)} />
                <Info label="R$/kg" value={l.custoPorKg ? formatBRL(l.custoPorKg) : "—"} />
                <Info label="Peso médio" value={l.pesoMedio ? `${formatNumber(l.pesoMedio)} g` : "—"} />
                <Info label="Sobrev." value={l.sobrevivencia ? `${formatNumber(l.sobrevivencia)} %` : "—"} />
                <Info label="Biomassa" value={l.biomassa ? `${formatNumber(l.biomassa)} kg` : "—"} />
                <Info label="FCA" value={l.fca != null ? formatNumber(l.fca) : "—"} />
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
                        </tr>
                      </thead>
                      <tbody>
                        {l.bios.map((b) => (
                          <tr key={b.id} className="border-t">
                            <td className="p-2">{formatDate(b.data_biometria)}</td>
                            <td className="p-2 text-right">{formatNumber(Number(b.peso_medio_g ?? 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {l.racaoDiaria.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ração dia a dia</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Data</th>
                          <th className="p-2 text-right">Ração (kg)</th>
                          <th className="p-2 text-right">Custo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.racaoDiaria.map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{formatDate(r.data)}</td>
                            <td className="p-2 text-right">{formatNumber(r.kg)}</td>
                            <td className="p-2 text-right">{formatBRL(r.custo)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/50 font-semibold">
                        <tr>
                          <td className="p-2">Total</td>
                          <td className="p-2 text-right">{formatNumber(l.racaoKg)}</td>
                          <td className="p-2 text-right">{formatBRL(l.custoRacao)}</td>
                        </tr>
                      </tfoot>
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
                          <th className="no-print p-2 text-right w-24">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.lancs.map((x) => (
                          <tr key={x.id} className="border-t">
                            <td className="p-2">{formatDate(x.data_lancamento)}</td>
                            <td className="p-2">{textValue(x.produto_nome)}</td>
                            <td className="p-2">{textValue(x.tipo)}</td>
                            <td className="p-2 text-right">{formatNumber(Number(x.quantidade ?? 0))} {textValue(x.unidade, "")}</td>
                            <td className="p-2 text-right">{formatBRL(Number(x.custo_total ?? 0))}</td>
                            <td className="no-print p-2 text-right">
                              <div className="inline-flex gap-1">
                                <button
                                  onClick={() => setEditLanc(x)}
                                  className="size-7 rounded hover:bg-primary/10 hover:text-primary inline-flex items-center justify-center"
                                  aria-label="Editar"
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                                <button
                                  onClick={() => confirmDelLanc(x.id)}
                                  className="size-7 rounded hover:bg-destructive/10 hover:text-destructive inline-flex items-center justify-center"
                                  aria-label="Apagar"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </td>
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

      {editBio && (
        <EditBioModal
          bio={editBio}
          onClose={() => setEditBio(null)}
          onSaved={() => {
            setEditBio(null);
            qc.invalidateQueries({ queryKey: ["biometrias"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
          }}
        />
      )}
      {editLanc && (
        <EditLancModal
          lanc={editLanc}
          onClose={() => setEditLanc(null)}
          onSaved={() => {
            setEditLanc(null);
            qc.invalidateQueries({ queryKey: ["lancamentos"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
          }}
        />
      )}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="size-8 rounded-lg hover:bg-muted flex items-center justify-center"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function EditBioModal({
  bio,
  onClose,
  onSaved,
}: {
  bio: BiometriaRelatorio;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState(bio.data_biometria);
  const [qtd, setQtd] = useState(String(bio.amostras ?? ""));
  const [pesoTotal, setPesoTotal] = useState(
    bio.amostras && bio.peso_medio_g
      ? String(Number(bio.amostras) * Number(bio.peso_medio_g))
      : "",
  );
  const pesoMedio = useMemo(() => {
    const t = Number(pesoTotal || 0);
    const q = Number(qtd || 0);
    return t > 0 && q > 0 ? t / q : 0;
  }, [pesoTotal, qtd]);

  const mut = useMutation({
    mutationFn: async () => {
      if (pesoMedio <= 0) throw new Error("Informe peso total e quantidade.");
      const { error } = await supabase
        .from("biometrias")
        .update({
          data_biometria: data,
          peso_medio_g: pesoMedio,
          amostras: Number(qtd),
        })
        .eq("id", bio.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Biometria atualizada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalShell title="Editar biometria" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        className="p-4 space-y-4"
      >
        <FieldRow label="Data">
          <input
            required
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="app-input"
          />
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Qtd camarões">
            <input
              required
              min="1"
              type="number"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              className="app-input"
            />
          </FieldRow>
          <FieldRow label="Peso total (g)">
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={pesoTotal}
              onChange={(e) => setPesoTotal(e.target.value)}
              className="app-input"
            />
          </FieldRow>
        </div>
        <p className="text-sm text-muted-foreground">
          Peso médio: <span className="font-bold text-foreground">{pesoMedio ? `${pesoMedio.toFixed(2)} g` : "—"}</span>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border font-semibold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mut.isPending}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
          >
            {mut.isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditLancModal({
  lanc,
  onClose,
  onSaved,
}: {
  lanc: LancamentoRelatorio;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState(lanc.data_lancamento);
  const [produto, setProduto] = useState(textValue(lanc.produto_nome, ""));
  const [quantidade, setQuantidade] = useState(String(lanc.quantidade ?? ""));
  const [unidade, setUnidade] = useState(textValue(lanc.unidade, "kg"));
  const [tipo, setTipo] = useState(textValue(lanc.tipo, "racao"));
  const [preco, setPreco] = useState(String(lanc.preco_unidade ?? ""));
  const [custo, setCusto] = useState(String(lanc.custo_total ?? ""));

  const mut = useMutation({
    mutationFn: async () => {
      const q = Number(quantidade);
      if (!produto.trim() || q <= 0) throw new Error("Preencha produto e quantidade.");
      const { error } = await supabase
        .from("lancamentos")
        .update({
          data_lancamento: data,
          produto_nome: produto,
          quantidade: q,
          unidade,
          tipo,
          preco_unidade: preco ? Number(preco) : null,
          custo_total: custo ? Number(custo) : null,
        })
        .eq("id", lanc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento atualizado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalShell title="Editar lançamento" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        className="p-4 space-y-3 max-h-[70vh] overflow-y-auto"
      >
        <FieldRow label="Data">
          <input required type="date" value={data} onChange={(e) => setData(e.target.value)} className="app-input" />
        </FieldRow>
        <FieldRow label="Produto">
          <input required value={produto} onChange={(e) => setProduto(e.target.value)} className="app-input" />
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Quantidade">
            <input required min="0" step="0.01" type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="app-input" />
          </FieldRow>
          <FieldRow label="Unidade">
            <input value={unidade} onChange={(e) => setUnidade(e.target.value)} className="app-input" />
          </FieldRow>
        </div>
        <FieldRow label="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="app-input">
            <option value="racao">Ração</option>
            <option value="insumo">Insumo</option>
            <option value="medicamento">Medicamento</option>
            <option value="outro">Outro</option>
          </select>
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Preço unidade (R$)">
            <input min="0" step="0.01" type="number" value={preco} onChange={(e) => setPreco(e.target.value)} className="app-input" />
          </FieldRow>
          <FieldRow label="Custo total (R$)">
            <input min="0" step="0.01" type="number" value={custo} onChange={(e) => setCusto(e.target.value)} className="app-input" />
          </FieldRow>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border font-semibold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mut.isPending}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
          >
            {mut.isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ResumoCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <p className="mt-2 text-xl font-bold break-words">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words font-semibold">{textValue(value)}</p>
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
