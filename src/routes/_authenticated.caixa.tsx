import { todayLocal } from "@/lib/date";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Pencil, X, Wallet, Users, TrendingUp, TrendingDown, FileDown, Download, Maximize2, FileSpreadsheet, Power } from "lucide-react";
import jsPDF from "jspdf";
import ExcelJS from "exceljs";
import { sortByViveiroNome } from "@/lib/sort";

export const Route = createFileRoute("/_authenticated/caixa")({
  head: () => ({ meta: [{ title: "Caixa" }] }),
  component: CaixaPage,
});

type ViveiroOpt = { id: string; nome: string };
type Lanc = {
  id: string;
  viveiro_id: string | null;
  data_lancamento: string;
  descricao: string;
  categoria: string;
  valor: number;
  observacao: string | null;
  tipo: "despesa" | "receita";
  quantidade: number | null;
  unidade: string | null;
  socio_id: string | null;
};
type Socio = { id: string; nome: string };

function fmtQtd(q: number | null, u: string | null) {
  if (!q || q <= 0) return "—";
  const n = Number(q).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return `${n}${u ? ` ${u}` : ""}`;
}

const TODOS = "__todos__";

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

// Abre o PDF no visualizador nativo (mobile mostra compartilhar/imprimir).
// Fallback para download se o popup for bloqueado.
function openPdf(doc: jsPDF, filename: string) {
  try {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      // popup bloqueado -> baixa
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    doc.save(filename);
  }
}

type ViveiroRel = {
  id: string;
  nome: string;
  despesaTotal: number;
  receitaTotal: number;
  saldo: number;
  historico: { l: Lanc; rateado: boolean; valorMostrado: number }[];
};

function buildViveiroPDF(doc: jsPDF, v: ViveiroRel, startY = 20): number {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = startY;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Caixa · ${v.nome}`, 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, y);
  y += 8;

  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Receitas:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 130, 70);
  doc.text(fmtBRL(v.receitaTotal), 50, y);

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("Despesas:", 90, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 30, 30);
  doc.text(fmtBRL(v.despesaTotal), 130, y);
  y += 7;

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("Saldo:", 14, y);
  doc.setTextColor(v.saldo >= 0 ? 0 : 180, v.saldo >= 0 ? 130 : 30, v.saldo >= 0 ? 70 : 30);
  doc.text(fmtBRL(v.saldo), 50, y);
  doc.setTextColor(0);
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Histórico", 14, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFillColor(240, 240, 240);
  doc.rect(14, y - 4, pageW - 28, 6, "F");
  doc.text("Data", 16, y);
  doc.text("Descrição", 36, y);
  doc.text("Qtd", 110, y);
  doc.text("Tipo", 138, y);
  doc.text("Valor", pageW - 16, y, { align: "right" });
  y += 4;
  doc.setFont("helvetica", "normal");

  if (v.historico.length === 0) {
    y += 6;
    doc.setTextColor(120);
    doc.text("Sem lançamentos.", 16, y);
    doc.setTextColor(0);
    y += 6;
  } else {
    for (const h of v.historico) {
      if (y > pageH - 20) {
        doc.addPage();
        y = 20;
      }
      y += 5;
      doc.text(fmtDate(h.l.data_lancamento), 16, y);
      const desc = h.l.descricao + (h.rateado ? " (rateado)" : "");
      doc.text(desc.length > 42 ? desc.slice(0, 42) + "…" : desc, 36, y);
      doc.text(fmtQtd(h.l.quantidade, h.l.unidade), 110, y);
      doc.text(h.l.tipo === "receita" ? "Receita" : "Despesa", 138, y);
      const sign = h.l.tipo === "receita" ? "+" : "-";
      doc.text(`${sign} ${fmtBRL(Math.abs(h.valorMostrado))}`, pageW - 16, y, { align: "right" });
    }
    y += 4;
  }
  return y;
}

// === Excel export (estilizado) ===
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function buildViveiroSheet(wb: ExcelJS.Workbook, v: ViveiroRel) {
  // limita nome da aba: max 31 chars, sem : \ / ? * [ ]
  const safe = (v.nome || "Viveiro").replace(/[:\\/?*\[\]]/g, " ").slice(0, 31) || "Viveiro";
  const ws = wb.addWorksheet(safe, {
    properties: { defaultRowHeight: 18 },
    views: [{ state: "frozen", ySplit: 6 }],
  });

  ws.columns = [
    { width: 14 },
    { width: 42 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 32 },
  ];

  // Título
  ws.mergeCells("A1:G1");
  const title = ws.getCell("A1");
  title.value = `Caixa · ${v.nome}`;
  title.font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  ws.getRow(1).height = 32;

  // Subtítulo
  ws.mergeCells("A2:G2");
  const sub = ws.getCell("A2");
  sub.value = `Gerado em ${new Date().toLocaleString("pt-BR")}`;
  sub.font = { italic: true, color: { argb: "FF6B7280" }, size: 10 };
  sub.alignment = { horizontal: "left", indent: 1 };

  // Resumo
  const resumo: Array<[string, number, string]> = [
    ["Receitas", v.receitaTotal, "FF059669"],
    ["Despesas", v.despesaTotal, "FFDC2626"],
    ["Saldo", v.saldo, v.saldo >= 0 ? "FF059669" : "FFDC2626"],
  ];
  resumo.forEach(([label, val, color], i) => {
    const col = ["A", "C", "E"][i];
    const valCol = ["B", "D", "F"][i];
    const labelCell = ws.getCell(`${col}4`);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 10, color: { argb: "FF374151" } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    labelCell.alignment = { horizontal: "left", indent: 1 };
    const valueCell = ws.getCell(`${valCol}4`);
    valueCell.value = val;
    valueCell.numFmt = '"R$" #,##0.00';
    valueCell.font = { bold: true, size: 12, color: { argb: color } };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    valueCell.alignment = { horizontal: "right", indent: 1 };
  });
  ws.getRow(4).height = 24;

  // Cabeçalho histórico
  const headerRow = ws.getRow(6);
  headerRow.values = ["Data", "Descrição", "Categoria", "Tipo", "Qtd", "Valor (R$)", "Observação"];
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });

  // Linhas
  v.historico.forEach((h, idx) => {
    const r = ws.addRow([
      (() => {
        const [y, m, d] = h.l.data_lancamento.split("-");
        return `${d}/${m}/${y}`;
      })(),
      h.l.descricao + (h.rateado ? " (rateado)" : ""),
      h.l.categoria || "",
      h.l.tipo === "receita" ? "Receita" : "Despesa",
      h.l.quantidade ? `${Number(h.l.quantidade).toLocaleString("pt-BR")}${h.l.unidade ? ` ${h.l.unidade}` : ""}` : "",
      Math.abs(h.valorMostrado) * (h.l.tipo === "receita" ? 1 : -1),
      h.l.observacao || "",
    ]);
    const bg = idx % 2 === 0 ? "FFFFFFFF" : "FFF9FAFB";
    r.eachCell((cell, col) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (col === 6) {
        cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
        cell.font = {
          bold: true,
          color: { argb: h.l.tipo === "receita" ? "FF059669" : "FFDC2626" },
        };
        cell.alignment = { horizontal: "right" };
      }
      if (col === 4) {
        cell.alignment = { horizontal: "center" };
        cell.font = {
          bold: true,
          color: { argb: h.l.tipo === "receita" ? "FF059669" : "FFDC2626" },
        };
      }
    });
    r.height = 20;
  });

  // Linha de total
  if (v.historico.length > 0) {
    const totalRow = ws.addRow(["", "", "", "", "TOTAL", v.saldo, ""]);
    totalRow.height = 26;
    totalRow.eachCell((cell, col) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      if (col === 5) cell.alignment = { horizontal: "right" };
      if (col === 6) {
        cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
        cell.alignment = { horizontal: "right" };
      }
    });
  }
}

async function exportViveiroXLSX(v: ViveiroRel) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Viveiros";
  wb.created = new Date();
  await buildViveiroSheet(wb, v);
  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `caixa-${v.nome.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

async function exportAllXLSX(viveiros: ViveiroRel[], resumo: { totalReceitas: number; totalDespesas: number; saldoGeral: number }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Viveiros";
  wb.created = new Date();

  // aba resumo
  const ws = wb.addWorksheet("Resumo geral", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.columns = [{ width: 30 }, { width: 20 }, { width: 20 }, { width: 20 }];
  ws.mergeCells("A1:D1");
  const title = ws.getCell("A1");
  title.value = "Caixa · Todos os viveiros";
  title.font = { size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  title.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 32;

  ws.mergeCells("A2:D2");
  ws.getCell("A2").value = `Gerado em ${new Date().toLocaleString("pt-BR")}`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF6B7280" } };

  const header = ws.getRow(4);
  header.values = ["Viveiro", "Receitas", "Despesas", "Saldo"];
  header.height = 22;
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });

  viveiros.forEach((v, idx) => {
    const r = ws.addRow([v.nome, v.receitaTotal, v.despesaTotal, v.saldo]);
    const bg = idx % 2 === 0 ? "FFFFFFFF" : "FFF9FAFB";
    r.eachCell((cell, col) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      if (col >= 2) {
        cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
        cell.alignment = { horizontal: "right" };
      }
      if (col === 4) {
        cell.font = { bold: true, color: { argb: v.saldo >= 0 ? "FF059669" : "FFDC2626" } };
      }
    });
  });

  const totalRow = ws.addRow(["TOTAL GERAL", resumo.totalReceitas, resumo.totalDespesas, resumo.saldoGeral]);
  totalRow.height = 26;
  totalRow.eachCell((cell, col) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    if (col >= 2) {
      cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
      cell.alignment = { horizontal: "right" };
    }
  });

  for (const v of viveiros) {
    await buildViveiroSheet(wb, v);
  }

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `caixa-todos-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

function CaixaPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Lanc | null>(null);
  const [detailView, setDetailView] = useState<ViveiroRel | null>(null);

  const [tipo, setTipo] = useState<"despesa" | "receita">("despesa");
  const [viveiroId, setViveiroId] = useState<string>(TODOS);
  const [data, setData] = useState(todayLocal());
  const [produtoId, setProdutoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precoKg, setPrecoKg] = useState("");
  const [qtd, setQtd] = useState("");
  const [unidade, setUnidade] = useState<"kg" | "g">("kg");
  const [valorManual, setValorManual] = useState("");
  const [socioId, setSocioId] = useState<string>("");

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, status")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return sortByViveiroNome((data ?? []) as ViveiroOpt[], (v) => v.nome);
    },
  });

  const desativarMut = useMutation({
    mutationFn: async (v: { id: string; nome: string }) => {
      const { error } = await supabase.from("viveiros").update({ status: "inativo" }).eq("id", v.id);
      if (error) throw error;
      return v;
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["viveiros"] });
      toast.success(`Viveiro "${v.nome}" desativado. Ative novamente na aba Viveiros.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos", "caixa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, categoria, unidade, preco_unidade")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        nome: string;
        categoria: string;
        unidade: string;
        preco_unidade: number | null;
      }>;
    },
  });

  const { data: funcionarios = [] } = useQuery({
    queryKey: ["funcionarios", "caixa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("id, nome, salario, viveiro_id")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        nome: string;
        salario: number;
        viveiro_id: string | null;
      }>;
    },
  });

  const { data: socios = [] } = useQuery({
    queryKey: ["socios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("socios").select("id, nome").order("nome");
      if (error) throw error;
      return (data ?? []) as Socio[];
    },
  });

  const addSocioMut = useMutation({
    mutationFn: async (nome: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada.");
      const { data, error } = await supabase
        .from("socios")
        .insert({ user_id: u.user.id, nome: nome.trim() })
        .select("id, nome")
        .single();
      if (error) throw error;
      return data as Socio;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["socios"] });
      setSocioId(s.id);
      toast.success(`Sócio "${s.nome}" adicionado`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ["caixa", "lancamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixa_lancamentos")
        .select("id, viveiro_id, data_lancamento, descricao, categoria, valor, observacao, tipo, quantidade, unidade, socio_id")
        .order("data_lancamento", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lanc[];
    },
  });

  // valor calculado a partir de preço/kg e quantidade
  const valorAuto = useMemo(() => {
    const p = Number(precoKg.replace(",", ".")) || 0;
    const q = Number(qtd.replace(",", ".")) || 0;
    if (!p || !q) return 0;
    const qKg = unidade === "g" ? q / 1000 : q;
    return p * qKg;
  }, [precoKg, qtd, unidade]);

  const valorFinal = valorAuto > 0 ? valorAuto : Number(valorManual.replace(",", ".")) || 0;

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error("Sessão expirada.");
      if (!descricao.trim()) throw new Error("Informe a descrição.");
      if (!valorFinal || valorFinal <= 0) throw new Error("Informe o valor.");
      const qNum = Number(qtd.replace(",", ".")) || 0;
      const { error } = await supabase.from("caixa_lancamentos").insert({
        user_id: userId,
        viveiro_id: viveiroId === TODOS ? null : viveiroId,
        data_lancamento: data,
        descricao: descricao.trim(),
        categoria: categoria.trim() || (tipo === "receita" ? "venda" : "geral"),
        valor: valorFinal,
        tipo,
        quantidade: qNum > 0 ? qNum : null,
        unidade: qNum > 0 ? unidade : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tipo === "receita" ? "Receita registrada" : "Despesa registrada");
      setProdutoId("");
      setDescricao("");
      setCategoria("");
      setPrecoKg("");
      setQtd("");
      setValorManual("");
      qc.invalidateQueries({ queryKey: ["caixa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("caixa_lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["caixa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Relatório: total por viveiro com rateio dos gerais (despesas E receitas)
  const relatorio = useMemo(() => {
    const sign = (l: Lanc) => (l.tipo === "receita" ? 1 : -1);
    const val = (l: Lanc) => Number(l.valor ?? 0);

    const totalDespesas = lancamentos.filter((l) => l.tipo !== "receita").reduce((s, l) => s + val(l), 0);
    const totalReceitas = lancamentos.filter((l) => l.tipo === "receita").reduce((s, l) => s + val(l), 0);
    const saldoGeral = totalReceitas - totalDespesas;

    const rateados = lancamentos.filter((l) => !l.viveiro_id);
    const despesasGerais = rateados.filter((l) => l.tipo !== "receita").reduce((s, l) => s + val(l), 0);
    const receitasGerais = rateados.filter((l) => l.tipo === "receita").reduce((s, l) => s + val(l), 0);
    const nAtivos = viveiros.length || 1;
    const rateioDesp = despesasGerais / nAtivos;
    const rateioRec = receitasGerais / nAtivos;

    const porViveiro = viveiros.map((v) => {
      const diretos = lancamentos.filter((l) => l.viveiro_id === v.id);
      const despDireto = diretos.filter((l) => l.tipo !== "receita").reduce((s, l) => s + val(l), 0);
      const recDireto = diretos.filter((l) => l.tipo === "receita").reduce((s, l) => s + val(l), 0);
      const historico = [
        ...diretos.map((l) => ({ l, rateado: false, valorMostrado: val(l) * sign(l) })),
        ...rateados.map((l) => ({
          l,
          rateado: true,
          valorMostrado: (val(l) / nAtivos) * sign(l),
        })),
      ].sort((a, b) => (a.l.data_lancamento < b.l.data_lancamento ? 1 : -1));
      const despesaTotal = despDireto + rateioDesp;
      const receitaTotal = recDireto + rateioRec;
      return {
        id: v.id,
        nome: v.nome,
        despesaTotal,
        receitaTotal,
        saldo: receitaTotal - despesaTotal,
        historico,
      };
    });

    return { totalDespesas, totalReceitas, saldoGeral, despesasGerais, receitasGerais, porViveiro, nAtivos };
  }, [lancamentos, viveiros]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Wallet className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Caixa</h1>
          <p className="text-sm text-muted-foreground">Despesas e receitas por viveiro</p>
        </div>
      </div>

      {/* Resumo geral */}
      <section className="rounded-2xl border bg-gradient-to-br from-primary/10 to-primary/5 p-4 space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Saldo geral
          </p>
          <p
            className={`text-2xl sm:text-3xl font-black tabular-nums break-words ${relatorio.saldoGeral >= 0 ? "text-emerald-600" : "text-destructive"}`}
          >
            {fmtBRL(relatorio.saldoGeral)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] uppercase font-bold opacity-80">
              <TrendingUp className="size-3" /> Receitas
            </p>
            <p className="font-bold tabular-nums">{fmtBRL(relatorio.totalReceitas)}</p>
          </div>
          <div className="rounded-lg bg-destructive/10 text-destructive px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] uppercase font-bold opacity-80">
              <TrendingDown className="size-3" /> Despesas
            </p>
            <p className="font-bold tabular-nums">{fmtBRL(relatorio.totalDespesas)}</p>
          </div>
        </div>
        {(relatorio.despesasGerais > 0 || relatorio.receitasGerais > 0) && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Users className="size-3" /> Rateado entre {relatorio.nAtivos} viveiro(s)
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            const doc = new jsPDF();
            const pageH = doc.internal.pageSize.getHeight();
            doc.setFontSize(18);
            doc.setFont("helvetica", "bold");
            doc.text("Caixa · Todos os viveiros", 14, 18);
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100);
            doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 25);
            doc.setTextColor(0);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(`Saldo geral: ${fmtBRL(relatorio.saldoGeral)}`, 14, 34);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Receitas: ${fmtBRL(relatorio.totalReceitas)}  ·  Despesas: ${fmtBRL(relatorio.totalDespesas)}`, 14, 41);
            let y = 50;
            relatorio.porViveiro.forEach((v, i) => {
              if (i > 0 || y > pageH - 60) {
                doc.addPage();
                y = 20;
              }
              y = buildViveiroPDF(doc, v, y) + 6;
            });
            openPdf(doc, `caixa-todos-${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success("PDF gerado");
          }}
          className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90"
        >
          <FileDown className="size-4" /> PDF geral (todos viveiros)
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await exportAllXLSX(relatorio.porViveiro, {
                totalReceitas: relatorio.totalReceitas,
                totalDespesas: relatorio.totalDespesas,
                saldoGeral: relatorio.saldoGeral,
              });
              toast.success("Planilha gerada");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
          className="w-full h-10 rounded-xl bg-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-emerald-700"
        >
          <FileSpreadsheet className="size-4" /> Planilha Excel (todos viveiros)
        </button>
      </section>



      {/* Carrossel de caixas por viveiro */}
      {relatorio.porViveiro.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Caixa por viveiro
            </h2>
            <span className="text-[10px] text-muted-foreground">deslize →</span>
          </div>
          <div className="-mx-4 px-4 overflow-x-auto snap-x snap-mandatory scrollbar-none">
            <ul className="flex gap-3 pb-2">
              {relatorio.porViveiro.map((v) => (
                <li
                  key={v.id}
                  className="snap-start shrink-0 w-[78%] sm:w-[300px] rounded-2xl border bg-card p-4 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Viveiro
                      </p>
                      <p className="font-bold text-base truncate">{v.nome || "—"}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDetailView(v)}
                        className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20"
                        aria-label="Ver detalhes"
                        title="Ver relatório completo"
                      >
                        <Maximize2 className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const doc = new jsPDF();
                          buildViveiroPDF(doc, v, 20);
                          openPdf(doc, `caixa-${v.nome.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.pdf`);
                          toast.success("PDF gerado");
                        }}
                        className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20"
                        aria-label="Baixar PDF"
                        title="Baixar PDF deste viveiro"
                      >
                        <Download className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await exportViveiroXLSX(v);
                            toast.success("Planilha gerada");
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                        className="size-9 rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center hover:bg-emerald-600/20"
                        aria-label="Baixar planilha"
                        title="Baixar planilha Excel deste viveiro"
                      >
                        <FileSpreadsheet className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Desativar viveiro "${v.nome}"? Você pode reativar depois na aba Viveiros.`)) {
                            desativarMut.mutate({ id: v.id, nome: v.nome });
                          }
                        }}
                        className="size-9 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center hover:bg-amber-500/20"
                        aria-label="Desativar viveiro"
                        title="Desativar viveiro"
                      >
                        <Power className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Saldo
                    </p>
                    <p
                      className={`text-2xl font-black tabular-nums ${v.saldo >= 0 ? "text-emerald-600" : "text-destructive"}`}
                    >
                      {fmtBRL(v.saldo)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground tabular-nums">
                      <span className="text-emerald-600">+ {fmtBRL(v.receitaTotal)}</span>
                      <span className="text-destructive">− {fmtBRL(v.despesaTotal)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      Histórico
                    </p>
                    {v.historico.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        Nada lançado pra esse viveiro ainda.
                      </p>
                    ) : (
                      <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
                        {v.historico.map((h) => (
                          <li
                            key={`${v.id}-${h.l.id}`}
                            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-xs py-1 border-b border-border/40 last:border-0"
                          >
                            <span className="truncate">
                              <span className="text-muted-foreground">
                                {fmtDate(h.l.data_lancamento)}
                              </span>{" "}
                              <span className="font-medium">{h.l.descricao}</span>
                              {h.rateado && (
                                <span className="ml-1 text-[9px] uppercase tracking-wide text-primary/80">
                                  · rateado
                                </span>
                              )}
                            </span>
                            <span
                              className={`font-semibold tabular-nums shrink-0 ${h.l.tipo === "receita" ? "text-emerald-600" : "text-destructive"}`}
                            >
                              {h.l.tipo === "receita" ? "+" : "−"} {fmtBRL(Math.abs(h.valorMostrado))}
                            </span>
                            <div className="flex gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditing(h.l)}
                                className="size-6 rounded text-muted-foreground hover:bg-primary/10 hover:text-primary flex items-center justify-center"
                                aria-label="Editar"
                              >
                                <Pencil className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Apagar "${h.l.descricao}"?`)) delMut.mutate(h.l.id);
                                }}
                                className="size-6 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                                aria-label="Apagar"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="space-y-4 rounded-2xl bg-card border p-5"
      >
        <h2 className="font-bold">Novo lançamento</h2>

        <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl">
          <button
            type="button"
            onClick={() => setTipo("despesa")}
            className={`h-10 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 transition ${tipo === "despesa" ? "bg-destructive text-destructive-foreground shadow" : "text-muted-foreground"}`}
          >
            <TrendingDown className="size-4" /> Despesa
          </button>
          <button
            type="button"
            onClick={() => setTipo("receita")}
            className={`h-10 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 transition ${tipo === "receita" ? "bg-emerald-600 text-white shadow" : "text-muted-foreground"}`}
          >
            <TrendingUp className="size-4" /> Receita
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Viveiro">
            <select
              value={viveiroId}
              onChange={(e) => setViveiroId(e.target.value)}
              className="app-input"
            >
              <option value={TODOS}>🔄 Todos (rateado)</option>
              {viveiros.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input
              required
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="app-input"
            />
          </Field>
        </div>

        {(produtos.length > 0 || funcionarios.length > 0) && (
          <Field label="Produto ou funcionário (opcional)">
            <select
              value={produtoId}
              onChange={(e) => {
                const id = e.target.value;
                setProdutoId(id);
                if (id.startsWith("func:")) {
                  const fid = id.slice(5);
                  const f = funcionarios.find((x) => x.id === fid);
                  if (f) {
                    setDescricao(`Salário: ${f.nome}`);
                    setCategoria("salario");
                    setPrecoKg("");
                    setQtd("");
                    setValorManual(String(f.salario));
                    setViveiroId(f.viveiro_id ?? TODOS);
                  }
                  return;
                }
                const p = produtos.find((x) => x.id === id);
                if (p) {
                  setDescricao(p.nome);
                  if (p.categoria) setCategoria(p.categoria);
                  if (p.preco_unidade != null) setPrecoKg(String(p.preco_unidade));
                }
              }}
              className="app-input"
            >
              <option value="">— Digitar manualmente —</option>
              {produtos.length > 0 && (
                <optgroup label="Produtos">
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {p.preco_unidade != null
                        ? ` · R$ ${Number(p.preco_unidade).toLocaleString("pt-BR")}/${p.unidade}`
                        : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {funcionarios.length > 0 && (
                <optgroup label="Funcionários (salário)">
                  {funcionarios.map((f) => (
                    <option key={f.id} value={`func:${f.id}`}>
                      {f.nome} · {Number(f.salario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      {f.viveiro_id ? "" : " · rateado"}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
        )}

        <Field label="Descrição">
          <input
            required
            value={descricao}
            onChange={(e) => {
              setDescricao(e.target.value);
              setProdutoId("");
            }}
            className="app-input"
            placeholder="Ex: Ração 40%, energia, transporte..."
          />
        </Field>

        <Field label="Categoria (opcional)">
          <input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="app-input"
            placeholder="Ex: ração, energia, manutenção"
          />
        </Field>

        <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Calcular por preço × quantidade (opcional)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço por kg (R$)">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9.,]*"
                value={precoKg}
                onChange={(e) => setPrecoKg(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="app-input"
                placeholder="Ex: 1000"
              />
            </Field>
            <Field label="Quantidade">
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value.replace(/[^0-9.,]/g, ""))}
                  className="app-input flex-1"
                  placeholder="Ex: 1"
                />
                <select
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value as "kg" | "g")}
                  className="app-input w-20"
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                </select>
              </div>
            </Field>
          </div>
          {valorAuto > 0 && (
            <p className="text-sm">
              Valor calculado:{" "}
              <span className="font-bold text-primary">{fmtBRL(valorAuto)}</span>
            </p>
          )}
        </div>

        <Field label={valorAuto > 0 ? "Valor (auto)" : "Valor total (R$)"}>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={valorAuto > 0 ? valorAuto.toFixed(2) : valorManual}
            disabled={valorAuto > 0}
            onChange={(e) => setValorManual(e.target.value.replace(/[^0-9.,]/g, ""))}
            className="app-input disabled:opacity-70"
            placeholder="Ex: 150,00"
          />
        </Field>

        <button
          disabled={saveMut.isPending}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
        >
          {saveMut.isPending ? "Salvando..." : "Salvar despesa"}
        </button>
      </form>

      {!isLoading && lancamentos.length === 0 && (
        <div className="p-5 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground">
          Sem despesas ainda.
        </div>
      )}



      {editing && (
        <EditModal
          lanc={editing}
          viveiros={viveiros}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["caixa"] });
          }}
        />
      )}

      {detailView && (
        <DetailModal
          v={detailView}
          onClose={() => setDetailView(null)}
          onEdit={(l) => {
            setDetailView(null);
            setEditing(l);
          }}
          onDelete={(id) => {
            if (confirm("Apagar este lançamento?")) delMut.mutate(id);
          }}
        />
      )}
    </div>
  );
}

function DetailModal({
  v,
  onClose,
  onEdit,
  onDelete,
}: {
  v: ViveiroRel;
  onClose: () => void;
  onEdit: (l: Lanc) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-stretch sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl bg-card sm:rounded-2xl border shadow-xl flex flex-col max-h-screen sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b sticky top-0 bg-card z-10">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">
              Caixa do viveiro
            </p>
            <h3 className="font-bold text-xl truncate">{v.nome}</h3>
          </div>
          <button
            onClick={onClose}
            className="size-10 rounded-xl hover:bg-muted flex items-center justify-center shrink-0"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-emerald-500/10 p-3">
              <p className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 opacity-80">
                Receitas
              </p>
              <p className="font-black text-base sm:text-lg tabular-nums text-emerald-700 dark:text-emerald-400 break-words">
                {fmtBRL(v.receitaTotal)}
              </p>
            </div>
            <div className="rounded-xl bg-destructive/10 p-3">
              <p className="text-[10px] uppercase font-bold text-destructive opacity-80">
                Despesas
              </p>
              <p className="font-black text-base sm:text-lg tabular-nums text-destructive break-words">
                {fmtBRL(v.despesaTotal)}
              </p>
            </div>
            <div className={`rounded-xl p-3 ${v.saldo >= 0 ? "bg-emerald-500/10" : "bg-destructive/10"}`}>
              <p className="text-[10px] uppercase font-bold opacity-80">Saldo</p>
              <p
                className={`font-black text-base sm:text-lg tabular-nums break-words ${v.saldo >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
              >
                {fmtBRL(v.saldo)}
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-wide text-muted-foreground mb-2">
              Histórico completo ({v.historico.length})
            </h4>
            {v.historico.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-6 text-center">
                Nada lançado pra esse viveiro ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {v.historico.map((h) => (
                  <li
                    key={`det-${v.id}-${h.l.id}`}
                    className="rounded-xl border bg-background p-3 sm:p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {fmtDate(h.l.data_lancamento)}
                          </span>
                          <span
                            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${h.l.tipo === "receita" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-destructive/15 text-destructive"}`}
                          >
                            {h.l.tipo}
                          </span>
                          {h.rateado && (
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                              rateado
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-base mt-1 break-words">{h.l.descricao}</p>
                        {h.l.categoria && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Categoria: <span className="font-medium">{h.l.categoria}</span>
                          </p>
                        )}
                        {h.l.quantidade && h.l.quantidade > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Qtd: <span className="font-medium">{fmtQtd(h.l.quantidade, h.l.unidade)}</span>
                          </p>
                        )}
                        {h.l.observacao && (
                          <p className="text-xs text-muted-foreground mt-1 italic break-words">
                            "{h.l.observacao}"
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`font-black text-lg tabular-nums ${h.l.tipo === "receita" ? "text-emerald-600" : "text-destructive"}`}
                        >
                          {h.l.tipo === "receita" ? "+" : "−"} {fmtBRL(Math.abs(h.valorMostrado))}
                        </p>
                        {h.rateado && (
                          <p className="text-[10px] text-muted-foreground">
                            total: {fmtBRL(Number(h.l.valor ?? 0))}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1 border-t">
                      <button
                        type="button"
                        onClick={() => onEdit(h.l)}
                        className="flex-1 h-9 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center gap-1.5"
                      >
                        <Pencil className="size-3.5" /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(h.l.id)}
                        className="flex-1 h-9 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="size-3.5" /> Apagar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditModal({
  lanc,
  viveiros,
  onClose,
  onSaved,
}: {
  lanc: Lanc;
  viveiros: ViveiroOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<"despesa" | "receita">(lanc.tipo ?? "despesa");
  const [viveiroId, setViveiroId] = useState<string>(lanc.viveiro_id ?? TODOS);
  const [data, setData] = useState(lanc.data_lancamento);
  const [descricao, setDescricao] = useState(lanc.descricao);
  const [categoria, setCategoria] = useState(lanc.categoria);
  const [valor, setValor] = useState(String(lanc.valor));

  const mut = useMutation({
    mutationFn: async () => {
      const v = Number(valor.replace(",", "."));
      if (!descricao.trim() || !v || v <= 0) throw new Error("Preencha descrição e valor.");
      const { error } = await supabase
        .from("caixa_lancamentos")
        .update({
          viveiro_id: viveiroId === TODOS ? null : viveiroId,
          data_lancamento: data,
          descricao: descricao.trim(),
          categoria: categoria.trim() || "geral",
          valor: v,
          tipo,
        })
        .eq("id", lanc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atualizado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
          <h3 className="font-bold">Editar lançamento</h3>
          <button
            onClick={onClose}
            className="size-8 rounded-lg hover:bg-muted flex items-center justify-center"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="p-4 space-y-3"
        >
          <Field label="Tipo">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "despesa" | "receita")}
              className="app-input"
            >
              <option value="despesa">💸 Despesa</option>
              <option value="receita">💰 Receita</option>
            </select>
          </Field>
          <Field label="Viveiro">
            <select
              value={viveiroId}
              onChange={(e) => setViveiroId(e.target.value)}
              className="app-input"
            >
              <option value={TODOS}>🔄 Todos (rateado)</option>
              {viveiros.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input
              required
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="app-input"
            />
          </Field>
          <Field label="Descrição">
            <input
              required
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="app-input"
            />
          </Field>
          <Field label="Categoria">
            <input
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="app-input"
            />
          </Field>
          <Field label="Valor (R$)">
            <input
              required
              type="text"
              inputMode="decimal"
              pattern="[0-9.,]*"
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ""))}
              className="app-input"
            />
          </Field>
          <div className="flex gap-2 pt-1">
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
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1.5">{label}</span>
      {children}
    </label>
  );
}
