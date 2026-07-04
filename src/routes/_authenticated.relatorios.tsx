import { todayLocal } from "@/lib/date";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { FileDown, FileText, Scale, Utensils, DollarSign, Pencil, Trash2, X, Link as LinkIcon, MessageCircle, Printer } from "lucide-react";
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
type FuncionarioRel = {
  id: string;
  nome: string;
  salario: number | null;
  ativo: boolean;
  viveiro_id: string | null;
  observacao: string | null;
};
type ValeRel = {
  id: string;
  funcionario_id: string;
  valor: number;
  motivo: string | null;
  data_vale: string;
};
type CaixaRel = {
  id: string;
  viveiro_id: string | null;
  data_lancamento: string;
  descricao: string;
  categoria: string;
  tipo: string;
  valor: number;
  quantidade: number | null;
  unidade: string | null;
  observacao: string | null;
  despesa_id: string | null;
  lancamento_id: string | null;
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

  const { data: funcionarios = [] } = useQuery({
    queryKey: ["funcionarios", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("id, nome, salario, ativo, viveiro_id, observacao")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as FuncionarioRel[];
    },
  });

  const { data: vales = [] } = useQuery({
    queryKey: ["vales", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vales")
        .select("id, funcionario_id, valor, motivo, data_vale")
        .order("data_vale", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ValeRel[];
    },
  });

  const { data: caixa = [] } = useQuery({
    queryKey: ["caixa_lancamentos", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixa_lancamentos")
        .select("id, viveiro_id, data_lancamento, descricao, categoria, tipo, valor, quantidade, unidade, observacao, despesa_id, lancamento_id")
        .order("data_lancamento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CaixaRel[];
    },
  });

  const linhas = useMemo(() => {
    const nViv = Math.max(1, viveiros.length);
    const despesasRateadas = despesas.filter((d) => d.rateio === "todos" || d.viveiro_id == null);
    const despesasIndividuais = despesas.filter((d) => d.rateio !== "todos" && d.viveiro_id != null);
    const custoRateioPorViveiro = despesasRateadas.reduce((s, d) => s + Number(d.valor ?? 0), 0) / nViv;
    const caixaRateado = caixa.filter((c) => c.viveiro_id == null && c.categoria !== "interno");
    // Despesas puras do caixa (não vieram de despesas_gerais nem de lançamentos de ração)
    const caixaDespesaPura = caixa.filter(
      (c) => c.tipo !== "receita" && c.despesa_id == null && c.lancamento_id == null && c.categoria !== "interno",
    );
    const caixaDespesaRateada = caixaDespesaPura.filter((c) => c.viveiro_id == null);
    const caixaDespesaIndiv = caixaDespesaPura.filter((c) => c.viveiro_id != null);
    const custoCaixaRateioPorViveiro = caixaDespesaRateada.reduce((s, c) => s + Number(c.valor ?? 0), 0) / nViv;


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
      const caixaDespIndivViv = caixaDespesaIndiv.filter((c) => c.viveiro_id === v.id);
      const custoCaixaIndiv = caixaDespIndivViv.reduce((s, c) => s + Number(c.valor ?? 0), 0);
      const custoCaixaRateio = custoCaixaRateioPorViveiro;
      const custoOutros = custoOutrosLanc + custoDespIndiv + custoDespRateio + custoCaixaIndiv + custoCaixaRateio;
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
        ...caixaDespIndivViv.map((c) => ({
          id: c.id,
          viveiro_id: c.viveiro_id,
          descricao: c.descricao,
          categoria: c.categoria ?? "caixa",
          valor: Number(c.valor ?? 0),
          data_despesa: c.data_lancamento,
          rateio: "individual",
          share: Number(c.valor ?? 0),
          tipoRateio: "individual" as const,
        })),
        ...caixaDespesaRateada.map((c) => ({
          id: c.id,
          viveiro_id: c.viveiro_id,
          descricao: c.descricao,
          categoria: c.categoria ?? "caixa",
          valor: Number(c.valor ?? 0),
          data_despesa: c.data_lancamento,
          rateio: "todos",
          share: Number(c.valor ?? 0) / nViv,
          tipoRateio: "rateado" as const,
        })),
      ];

      // Funcionários ligados a este viveiro + total de vales por funcionário
      const funcsDoViveiro = funcionarios.filter((f) => f.viveiro_id === v.id);
      const funcsComVales = funcsDoViveiro.map((f) => {
        const meus = vales.filter((vv) => vv.funcionario_id === f.id);
        const totalVales = meus.reduce((s, x) => s + Number(x.valor ?? 0), 0);
        return { ...f, vales: meus, totalVales };
      });
      const totalSalarios = funcsDoViveiro.reduce((s, f) => s + Number(f.salario ?? 0), 0);
      const totalValesViv = funcsComVales.reduce((s, f) => s + f.totalVales, 0);

      // Caixa: receitas/despesas atribuídas a este viveiro + rateados (viveiro_id null)
      const caixaDoVivDireto = caixa.filter((c) => c.viveiro_id === v.id);
      const caixaDoViv = [...caixaDoVivDireto, ...caixaRateado.map((c) => ({ ...c, valor: Number(c.valor ?? 0) / nViv }))];
      const receitasLista = caixaDoViv.filter((c) => c.tipo === "receita");
      const despesasCaixa = caixaDoViv.filter((c) => c.tipo !== "receita");
      const receitas = receitasLista.reduce((s, c) => s + Number(c.valor ?? 0), 0);
      const despesasCaixaTot = despesasCaixa.reduce((s, c) => s + Number(c.valor ?? 0), 0);
      const saldoCaixa = receitas - despesasCaixaTot;

      const lucro = receitas - custoTotal;

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
        funcionarios: funcsComVales,
        totalSalarios,
        totalValesViv,
        receitas,
        despesasCaixaTot,
        saldoCaixa,
        lucro,
        receitasLista,
        caixaDoViv,
      };
    });
  }, [biometrias, lancamentos, viveiros, despesas, funcionarios, vales, caixa]);

  const totais = useMemo(() => {
    const base = linhas.reduce(
      (acc, l) => ({
        viveiros: acc.viveiros + 1,
        racaoKg: acc.racaoKg + l.racaoKg,
        biomassa: acc.biomassa + l.biomassa,
        custoTotal: acc.custoTotal + l.custoTotal,
        receitas: acc.receitas + l.receitas,
        lucro: acc.lucro + l.lucro,
        vales: acc.vales + l.totalValesViv,
        salarios: acc.salarios + l.totalSalarios,
      }),
      { viveiros: 0, racaoKg: 0, biomassa: 0, custoTotal: 0, receitas: 0, lucro: 0, vales: 0, salarios: 0 },
    );
    return { ...base, fca: base.biomassa > 0 ? base.racaoKg / base.biomassa : null };
  }, [linhas]);

  async function exportPdf(ids?: string[], mode: "save" | "blob" = "save"): Promise<{ blob: Blob; filename: string } | void> {
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
      head: [["Viveiro", "Fazenda", "Dias", "Povoados", "Ração kg", "Biom. kg", "FCA", "Custo R$", "R$/kg", "Receita", "Lucro"]],
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
        formatBRL(l.receitas),
        formatBRL(l.lucro),
      ]),
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 10, right: 10 },
    });

    // DETALHES POR VIVEIRO
    for (let idx = 0; idx < alvo.length; idx++) {
      const l = alvo[idx];
      const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60;
      // Só quebra página se não couber o cabeçalho + métricas mínimas na página atual
      let y: number;
      if (idx === 0 || lastY > pageH - 110) {
        doc.addPage();
        header(l.viveiro, `${l.fazenda} • ${l.status} • ${l.dias != null ? `${l.dias} dias de cultivo` : "sem povoamento"}`);
        y = 32;
      } else {
        y = lastY + 8;
        doc.setFillColor(...TEAL);
        doc.rect(10, y - 5, pageW - 20, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`${l.viveiro} — ${l.fazenda} • ${l.status} • ${l.dias != null ? `${l.dias}d` : "s/povoamento"}`, 12, y);
        doc.setTextColor(...DARK);
        doc.setFont("helvetica", "normal");
        y += 6;
      }

      // Bloco de métricas compacto
      const metrics: [string, string][] = [
        ["Fornecedor", l.fornecedor],
        ["Povoamento", l.dataPovoamento ? formatDate(l.dataPovoamento) : "—"],
        ["Pós-larvas", l.qtdPovoada.toLocaleString("pt-BR")],
        ["Ração total", `${formatNumber(l.racaoKg)} kg`],
        ["Custo ração", formatBRL(l.custoRacao)],
        ["Custo outros", formatBRL(l.custoOutros)],
        ["Desp. rateadas", formatBRL(l.custoDespRateio)],
        ["Desp. próprias", formatBRL(l.custoDespIndiv)],
        ["Custo total", formatBRL(l.custoTotal)],
        ["R$/kg", l.custoPorKg ? formatBRL(l.custoPorKg) : "—"],
        ["Peso médio", l.pesoMedio ? `${formatNumber(l.pesoMedio)} g` : "—"],
        ["Sobreviv.", l.sobrevivencia ? `${formatNumber(l.sobrevivencia)} %` : "—"],
        ["Biomassa", l.biomassa ? `${formatNumber(l.biomassa)} kg` : "—"],
        ["FCA", l.fca != null ? formatNumber(l.fca) : "—"],
        ["Receitas", formatBRL(l.receitas)],
        ["Lucro est.", formatBRL(l.lucro)],
        ["Saldo caixa", formatBRL(l.saldoCaixa)],
        ["Funcionários", String(l.funcionarios.length)],
        ["Salários", formatBRL(l.totalSalarios)],
        ["Vales", formatBRL(l.totalValesViv)],
        ["Lançamentos", String(l.nLancamentos)],
        ["Biometrias", String(l.nBiometrias)],
        ["Últ. biom.", l.ultimaBioData ? formatDate(l.ultimaBioData) : "—"],
        ["Status", l.status],
      ];
      const cols = 6;
      const mW = (pageW - 20 - (cols - 1) * 2) / cols;
      const mH = 11;
      metrics.forEach((m, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = 10 + col * (mW + 2);
        const yy = y + row * (mH + 1.5);
        doc.setFillColor(245, 247, 250);
        doc.roundedRect(x, yy, mW, mH, 1, 1, "F");
        doc.setFontSize(6);
        doc.setTextColor(...MUTED);
        doc.text(m[0].toUpperCase(), x + 1.5, yy + 3.2);
        doc.setFontSize(8);
        doc.setTextColor(...DARK);
        doc.setFont("helvetica", "bold");
        doc.text(m[1], x + 1.5, yy + 8.5);
        doc.setFont("helvetica", "normal");
      });
      y = y + Math.ceil(metrics.length / cols) * (mH + 1.5) + 3;


      if (l.bios.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Biometrias", 14, y);
        y += 2;
        at(doc, {
          startY: y,
          head: [["Data", "Peso médio (g)"]],
          body: l.bios.map((b) => [formatDate(b.data_biometria), formatNumber(Number(b.peso_medio_g ?? 0))]),
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: TEAL, textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 10, right: 10 },
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
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: TEAL, textColor: 255 },
          footStyles: { fillColor: [226, 232, 240], textColor: DARK, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 10, right: 10 },
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
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: TEAL, textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 10, right: 10 },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }

      if (l.despesasLista.length > 0) {
        if (y > pageH - 40) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Despesas gerais", 14, y);
        y += 2;
        at(doc, {
          startY: y,
          head: [["Data", "Descrição", "Categoria", "Rateio", "Valor total", "Atribuído"]],
          body: l.despesasLista.map((d) => [
            formatDate(d.data_despesa),
            textValue(d.descricao),
            textValue(d.categoria, "—"),
            d.tipoRateio === "rateado" ? "Rateado" : "Individual",
            formatBRL(Number(d.valor ?? 0)),
            formatBRL(d.share),
          ]),
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: TEAL, textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 10, right: 10 },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }

      if (l.funcionarios.length > 0) {
        if (y > pageH - 40) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Funcionários", 14, y);
        y += 2;
        at(doc, {
          startY: y,
          head: [["Nome", "Salário", "Vales (total)", "Status"]],
          body: l.funcionarios.map((f) => [
            f.nome,
            formatBRL(Number(f.salario ?? 0)),
            formatBRL(f.totalVales),
            f.ativo ? "Ativo" : "Inativo",
          ]),
          foot: [["Total", formatBRL(l.totalSalarios), formatBRL(l.totalValesViv), ""]],
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: TEAL, textColor: 255 },
          footStyles: { fillColor: [226, 232, 240], textColor: DARK, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 10, right: 10 },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

        const valesDetalhe = l.funcionarios.flatMap((f) => f.vales.map((v) => ({ f: f.nome, v })));
        if (valesDetalhe.length > 0) {
          if (y > pageH - 40) { doc.addPage(); y = 20; }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.text("Vales (detalhe)", 14, y);
          y += 2;
          at(doc, {
            startY: y,
            head: [["Data", "Funcionário", "Motivo", "Valor"]],
            body: valesDetalhe.map(({ f, v }) => [formatDate(v.data_vale), f, v.motivo ?? "—", formatBRL(Number(v.valor ?? 0))]),
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: TEAL, textColor: 255 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: 10, right: 10 },
          });
          y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
        }
      }

      if (l.receitasLista.length > 0) {
        if (y > pageH - 40) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Receitas", 14, y);
        y += 2;
        at(doc, {
          startY: y,
          head: [["Data", "Descrição", "Categoria", "Qtd", "Valor"]],
          body: l.receitasLista.map((c) => [
            formatDate(c.data_lancamento),
            c.descricao,
            c.categoria,
            c.quantidade != null ? `${formatNumber(Number(c.quantidade))} ${c.unidade ?? ""}` : "—",
            formatBRL(Number(c.valor ?? 0)),
          ]),
          foot: [["Total", "", "", "", formatBRL(l.receitas)]],
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: [16, 185, 129], textColor: 255 },
          footStyles: { fillColor: [226, 232, 240], textColor: DARK, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 10, right: 10 },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }

      if (l.caixaDoViv.length > 0) {
        if (y > pageH - 40) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Caixa (todos os lançamentos)", 14, y);
        y += 2;
        at(doc, {
          startY: y,
          head: [["Data", "Tipo", "Descrição", "Categoria", "Qtd", "Valor"]],
          body: l.caixaDoViv.map((c) => [
            formatDate(c.data_lancamento),
            c.tipo,
            c.descricao,
            c.categoria,
            c.quantidade != null ? `${formatNumber(Number(c.quantidade))} ${c.unidade ?? ""}` : "—",
            `${c.tipo === "receita" ? "+" : "-"} ${formatBRL(Number(c.valor ?? 0))}`,
          ]),
          foot: [["", "", "", "", "Saldo", formatBRL(l.saldoCaixa)]],
          styles: { fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: TEAL, textColor: 255 },
          footStyles: { fillColor: [226, 232, 240], textColor: DARK, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 10, right: 10 },
        });
      }
    }

    footer();
    const nome = ids && ids.length === 1
      ? `relatorio-${alvo[0].viveiro.replace(/\s+/g, "-").toLowerCase()}-${todayLocal()}.pdf`
      : `relatorio-viveiros-${todayLocal()}.pdf`;
    if (mode === "blob") {
      const blob = doc.output("blob");
      return { blob, filename: nome };
    }
    doc.save(nome);
  }

  async function gerarLinkPdf(ids?: string[]) {
    const tid = toast.loading("Gerando PDF...");
    try {
      const result = await exportPdf(ids && ids.length > 0 ? ids : undefined, "blob");
      if (!result) { toast.dismiss(tid); return; }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { toast.error("Sessão expirada.", { id: tid }); return; }
      const path = `${u.user.id}/${Date.now()}-${result.filename}`;
      const { error: upErr } = await supabase.storage
        .from("relatorios-pdf")
        .upload(path, result.blob, { contentType: "application/pdf", upsert: true });
      if (upErr) { toast.error(upErr.message, { id: tid }); return; }
      const { data: signed, error: sErr } = await supabase.storage
        .from("relatorios-pdf")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr || !signed) { toast.error(sErr?.message ?? "Falha ao gerar link.", { id: tid }); return; }
      const token = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
      const { error: insErr } = await supabase.from("pdf_shares").insert({
        token, user_id: u.user.id, signed_url: signed.signedUrl, filename: result.filename,
      });
      if (insErr) { toast.error(insErr.message, { id: tid }); return; }
      const url = `${window.location.origin}/p/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link do PDF copiado!", { id: tid, description: url });
      } catch {
        toast.dismiss(tid);
        window.prompt("Copie o link do PDF:", url);
      }
      if (typeof navigator !== "undefined" && "share" in navigator) {
        try { await (navigator as Navigator & { share: (d: { url: string; title?: string }) => Promise<void> }).share({ url, title: result.filename }); } catch { /* user cancelled */ }
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao gerar PDF.", { id: tid });
    }
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

  async function gerarLink(viveiroIds: string[] | null, titulo: string | null, asPdf = false): Promise<string | null> {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      toast.error("Sessão expirada.");
      return null;
    }
    const { data, error } = await supabase
      .from("relatorio_shares")
      .insert({ user_id: u.user.id, viveiro_ids: viveiroIds, titulo })
      .select("token")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Falha ao gerar link.");
      return null;
    }
    return `${window.location.origin}/r/${data.token}${asPdf ? "?pdf=1" : ""}`;
  }

  async function copiarLink(viveiroIds: string[] | null, titulo: string | null, asPdf = false) {
    const url = await gerarLink(viveiroIds, titulo, asPdf);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(asPdf ? "Link do PDF copiado!" : "Link copiado!", { description: url });
    } catch {
      window.prompt("Copie o link:", url);
    }
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try { await (navigator as Navigator & { share: (d: { url: string; title?: string }) => Promise<void> }).share({ url, title: titulo ?? "Relatório de Viveiros" }); } catch { /* user cancelled */ }
    }
  }

  async function compartilharWhatsapp(viveiroIds: string[] | null, titulo: string | null) {
    const tid = toast.loading("Gerando link...");
    const url = await gerarLink(viveiroIds, titulo, false);
    toast.dismiss(tid);
    if (!url) return;
    const texto = `${titulo ?? "Relatório de Viveiros"}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  }

  async function imprimirRelatorio(viveiroIds: string[] | null, titulo: string | null) {
    const tid = toast.loading("Abrindo impressão...");
    const url = await gerarLink(viveiroIds, titulo, true);
    toast.dismiss(tid);
    if (!url) return;
    window.open(url, "_blank");
  }



  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="mt-1 text-muted-foreground break-words">Extrato por viveiro</p>
        </div>
        <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button
            onClick={() => copiarLink(Array.from(selecionados), selecionados.size === 1 ? linhas.find((l) => selecionados.has(l.id))?.viveiro ?? null : `${selecionados.size} viveiros`)}
            disabled={selecionados.size === 0}
            className="inline-flex min-w-0 h-12 items-center justify-center gap-1.5 rounded-xl border bg-card px-2 text-xs font-semibold hover:bg-accent disabled:opacity-50 sm:px-3 sm:text-sm"
          >
            <LinkIcon className="size-4 shrink-0" /> <span className="truncate">Link selec.</span>
          </button>
          <button
            onClick={() => copiarLink(null, "Todos os viveiros")}
            disabled={linhas.length === 0}
            className="inline-flex min-w-0 h-12 items-center justify-center gap-1.5 rounded-xl border bg-card px-2 text-xs font-semibold hover:bg-accent disabled:opacity-50 sm:px-3 sm:text-sm"
          >
            <LinkIcon className="size-4 shrink-0" /> <span className="truncate">Link tudo</span>
          </button>
          <button
            onClick={() => gerarLinkPdf(Array.from(selecionados))}
            disabled={selecionados.size === 0}
            className="inline-flex min-w-0 h-12 items-center justify-center gap-1.5 rounded-xl border bg-card px-2 text-xs font-semibold hover:bg-accent disabled:opacity-50 sm:px-3 sm:text-sm"
          >
            <LinkIcon className="size-4 shrink-0" /> <span className="truncate">Link PDF selec.</span>
          </button>
          <button
            onClick={() => gerarLinkPdf()}
            disabled={linhas.length === 0}
            className="inline-flex min-w-0 h-12 items-center justify-center gap-1.5 rounded-xl border bg-card px-2 text-xs font-semibold hover:bg-accent disabled:opacity-50 sm:px-3 sm:text-sm"
          >
            <LinkIcon className="size-4 shrink-0" /> <span className="truncate">Link PDF tudo</span>
          </button>

          <button
            onClick={() => exportPdf(Array.from(selecionados))}
            disabled={selecionados.size === 0}
            className="inline-flex min-w-0 h-12 items-center justify-center gap-1.5 rounded-xl border bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 sm:px-4 sm:text-sm"
          >
            <FileDown className="size-4 shrink-0 sm:size-5" /> <span className="truncate">PDF selec.{selecionados.size > 0 ? ` (${selecionados.size})` : ""}</span>
          </button>
          <button
            onClick={() => exportPdf()}
            disabled={linhas.length === 0}
            className="inline-flex min-w-0 h-12 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 text-xs font-semibold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 sm:px-4 sm:text-sm"
          >
            <FileDown className="size-4 shrink-0 sm:size-5" /> <span className="truncate">PDF de tudo</span>
          </button>

          <button
            onClick={() => compartilharWhatsapp(selecionados.size > 0 ? Array.from(selecionados) : null, selecionados.size > 0 ? (selecionados.size === 1 ? linhas.find((l) => selecionados.has(l.id))?.viveiro ?? null : `${selecionados.size} viveiros`) : "Todos os viveiros")}
            disabled={linhas.length === 0}
            className="inline-flex min-w-0 h-12 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-2 text-xs font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50 sm:px-3 sm:text-sm"
          >
            <MessageCircle className="size-4 shrink-0" /> <span className="truncate">WhatsApp</span>
          </button>
          <button
            onClick={() => imprimirRelatorio(selecionados.size > 0 ? Array.from(selecionados) : null, selecionados.size > 0 ? (selecionados.size === 1 ? linhas.find((l) => selecionados.has(l.id))?.viveiro ?? null : `${selecionados.size} viveiros`) : "Todos os viveiros")}
            disabled={linhas.length === 0}
            className="inline-flex min-w-0 h-12 items-center justify-center gap-1.5 rounded-xl border bg-card px-2 text-xs font-semibold hover:bg-accent disabled:opacity-50 sm:px-3 sm:text-sm"
          >
            <Printer className="size-4 shrink-0" /> <span className="truncate">Imprimir</span>
          </button>
        </div>
      </div>



      <div className="no-print grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <ResumoCard icon={<FileText className="size-4" />} label="Viveiros" value={String(totais.viveiros)} />
        <ResumoCard icon={<Utensils className="size-4" />} label="Ração" value={`${formatNumber(totais.racaoKg)} kg`} />
        <ResumoCard icon={<Scale className="size-4" />} label="Biomassa" value={`${formatNumber(totais.biomassa)} kg`} />
        <ResumoCard icon={<Scale className="size-4" />} label="FCA geral" value={totais.fca != null ? formatNumber(totais.fca) : "—"} />
        <ResumoCard icon={<DollarSign className="size-4" />} label="Custo total" value={formatBRL(totais.custoTotal)} />
        <ResumoCard icon={<DollarSign className="size-4" />} label="Receitas" value={formatBRL(totais.receitas)} />
        <ResumoCard icon={<DollarSign className="size-4" />} label="Lucro" value={formatBRL(totais.lucro)} />
        <ResumoCard icon={<DollarSign className="size-4" />} label="Vales" value={formatBRL(totais.vales)} />
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
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => copiarLink([l.id], l.viveiro)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs font-semibold hover:bg-accent"
                  >
                    <LinkIcon className="size-3.5" /> Link
                  </button>
                  <button
                    onClick={() => exportPdf([l.id])}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-secondary px-2.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
                  >
                    <FileDown className="size-3.5" /> PDF
                  </button>
                </div>

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
                <Info label="Receitas" value={formatBRL(l.receitas)} />
                <Info label="Lucro estimado" value={formatBRL(l.lucro)} />
                <Info label="Saldo caixa" value={formatBRL(l.saldoCaixa)} />
                <Info label="Funcionários" value={String(l.funcionarios.length)} />
                <Info label="Salários (soma)" value={formatBRL(l.totalSalarios)} />
                <Info label="Vales totais" value={formatBRL(l.totalValesViv)} />
              </div>

              {l.funcionarios.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funcionários e vales</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Nome</th>
                          <th className="p-2 text-right">Salário</th>
                          <th className="p-2 text-right">Vales (total)</th>
                          <th className="p-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.funcionarios.map((f) => (
                          <tr key={f.id} className="border-t">
                            <td className="p-2">{f.nome}</td>
                            <td className="p-2 text-right">{formatBRL(Number(f.salario ?? 0))}</td>
                            <td className="p-2 text-right">{formatBRL(f.totalVales)}</td>
                            <td className="p-2">{f.ativo ? "Ativo" : "Inativo"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/50 font-semibold">
                        <tr>
                          <td className="p-2">Total</td>
                          <td className="p-2 text-right">{formatBRL(l.totalSalarios)}</td>
                          <td className="p-2 text-right">{formatBRL(l.totalValesViv)}</td>
                          <td className="p-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {l.receitasLista.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receitas</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Data</th>
                          <th className="p-2 text-left">Descrição</th>
                          <th className="p-2 text-left">Categoria</th>
                          <th className="p-2 text-right">Qtd</th>
                          <th className="p-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.receitasLista.map((c) => (
                          <tr key={c.id} className="border-t">
                            <td className="p-2">{formatDate(c.data_lancamento)}</td>
                            <td className="p-2">{c.descricao}</td>
                            <td className="p-2">{c.categoria}</td>
                            <td className="p-2 text-right">{c.quantidade != null ? `${formatNumber(Number(c.quantidade))} ${c.unidade ?? ""}` : "—"}</td>
                            <td className="p-2 text-right">{formatBRL(Number(c.valor ?? 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/50 font-semibold">
                        <tr>
                          <td className="p-2" colSpan={4}>Total</td>
                          <td className="p-2 text-right">{formatBRL(l.receitas)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

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

              {l.despesasLista.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Despesas gerais</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Data</th>
                          <th className="p-2 text-left">Descrição</th>
                          <th className="p-2 text-left">Rateio</th>
                          <th className="p-2 text-right">Valor total</th>
                          <th className="p-2 text-right">Atribuído</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.despesasLista.map((d) => (
                          <tr key={d.id} className="border-t">
                            <td className="p-2">{formatDate(d.data_despesa)}</td>
                            <td className="p-2">{textValue(d.descricao)}</td>
                            <td className="p-2 capitalize">{d.tipoRateio === "rateado" ? "Rateado" : "Individual"}</td>
                            <td className="p-2 text-right">{formatBRL(Number(d.valor ?? 0))}</td>
                            <td className="p-2 text-right">{formatBRL(d.share)}</td>
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
