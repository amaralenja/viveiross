import { todayLocal } from "@/lib/date";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Pencil, X, Wallet, Users, TrendingUp, TrendingDown, FileDown, Download, Maximize2, FileSpreadsheet, Power, ShoppingBag, Plus, Tag, Filter, ChevronLeft, ChevronRight, Boxes } from "lucide-react";
import jsPDF from "jspdf";
import ExcelJS from "exceljs";
import { sortByViveiroNome } from "@/lib/sort";
import { parseProdutoEmbalagem, getUnidadeBase } from "@/lib/embalagem";

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
const NAO_RATEADO = "__nao_rateado__";
const NR_CAT = "nao_rateado";

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

function buildFlatPDF(doc: jsPDF, rows: Lanc[], viveiroMap: Map<string, string>, title: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 20;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, y);
  y += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, y);
  doc.setTextColor(0);
  y += 8;

  const receitas = rows.filter((r) => r.tipo === "receita").reduce((s, r) => s + Number(r.valor ?? 0), 0);
  const despesas = rows.filter((r) => r.tipo !== "receita").reduce((s, r) => s + Number(r.valor ?? 0), 0);
  const saldo = receitas - despesas;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Receitas:", 14, y); doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 130, 70); doc.text(fmtBRL(receitas), 40, y);
  doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text("Despesas:", 80, y); doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 30, 30); doc.text(fmtBRL(despesas), 108, y);
  doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text("Saldo:", 150, y); doc.setFont("helvetica", "normal");
  doc.setTextColor(saldo >= 0 ? 0 : 180, saldo >= 0 ? 130 : 30, saldo >= 0 ? 70 : 30);
  doc.text(fmtBRL(saldo), 168, y);
  doc.setTextColor(0);
  y += 10;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(240, 240, 240);
  doc.rect(14, y - 4, pageW - 28, 6, "F");
  doc.text("Data", 16, y);
  doc.text("Descrição", 36, y);
  doc.text("Viveiro", 96, y);
  doc.text("Tipo", 140, y);
  doc.text("Valor", pageW - 16, y, { align: "right" });
  y += 4;
  doc.setFont("helvetica", "normal");
  for (const r of rows) {
    if (y > pageH - 20) { doc.addPage(); y = 20; }
    y += 5;
    doc.text(fmtDate(r.data_lancamento), 16, y);
    const desc = r.descricao.length > 32 ? r.descricao.slice(0, 32) + "…" : r.descricao;
    doc.text(desc, 36, y);
    const viv = r.categoria === NR_CAT
      ? "Não rateado"
      : r.viveiro_id
        ? (viveiroMap.get(r.viveiro_id) ?? "—")
        : "Rateado";
    doc.text(viv.length > 22 ? viv.slice(0, 22) + "…" : viv, 96, y);
    doc.text(r.tipo === "receita" ? "Receita" : "Despesa", 140, y);
    const sign = r.tipo === "receita" ? "+" : "-";
    doc.text(`${sign} ${fmtBRL(Number(r.valor ?? 0))}`, pageW - 16, y, { align: "right" });
  }
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
  const [valorManual, setValorManual] = useState("");
  const [qtd, setQtd] = useState("");
  const [unidade, setUnidade] = useState<string>("kg");
  const [socioId, setSocioId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [subTab, setSubTab] = useState<"geral" | "compras">("geral");
  const [buscaDiscriminacao, setBuscaDiscriminacao] = useState("");
  const [filtroDestinoDisc, setFiltroDestinoDisc] = useState("__todos__");

  const viveirosScrollRef = useRef<HTMLDivElement>(null);

  function scrollViveiros(direction: "left" | "right") {
    if (viveirosScrollRef.current) {
      const scrollAmount = 320;
      viveirosScrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  }

  const compraMut = useMutation({
    mutationFn: async (compraData: {
      socioId: string;
      viveiroId: string;
      descricao: string;
      categoria: string;
      valor: number;
      data: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error("Sessão expirada.");

      const isNR = compraData.viveiroId === NAO_RATEADO;
      const { error } = await supabase.from("caixa_lancamentos").insert({
        user_id: userId,
        viveiro_id: (compraData.viveiroId === TODOS || isNR) ? null : compraData.viveiroId,
        data_lancamento: compraData.data,
        descricao: compraData.descricao,
        categoria: isNR ? NR_CAT : (compraData.categoria.trim() || "compras"),
        valor: compraData.valor,
        tipo: "despesa",
        socio_id: compraData.socioId || null,
      });
      if (error) throw error;

      // Auto-abastecer estoque caso a descrição corresponda a algum produto cadastrado
      const { data: prods } = await supabase.from("produtos").select("id, nome, unidade, preco_unidade");
      if (prods && prods.length > 0) {
        const descLower = compraData.descricao.toLowerCase().trim();
        const match = prods.find((p) => descLower.includes(p.nome.toLowerCase().trim()) || p.nome.toLowerCase().trim().includes(descLower));
        if (match) {
          const matchQtd = compraData.descricao.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|un|saco|sc|g)?/i);
          let qtdNum = matchQtd ? Number(matchQtd[1].replace(",", ".")) : 0;
          if (qtdNum <= 0 && match.preco_unidade && match.preco_unidade > 0) {
            qtdNum = compraData.valor / match.preco_unidade;
          }
          if (qtdNum <= 0) qtdNum = 1;

          await supabase.from("estoque_entradas").insert({
            user_id: userId,
            produto_id: match.id,
            quantidade: qtdNum,
            unidade: match.unidade ?? "kg",
            preco_unidade: match.preco_unidade ?? null,
            custo_total: compraData.valor,
            fornecedor: "Compra no Caixa (Sócio)",
            data_entrada: compraData.data,
            observacao: `Automático via caixa: ${compraData.descricao}`,
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Compra/Despesa registrada e estoque atualizado!");
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const { data: listaProdutos = [] } = useQuery({
    queryKey: ["produtos", "lista_caixa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, categoria, unidade, preco_unidade")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; categoria: string | null; unidade: string | null; preco_unidade: number | null }[];
    },
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

  const selectedProd = useMemo(() => listaProdutos.find((p) => p.id === produtoId), [listaProdutos, produtoId]);
  const selectedEmb = useMemo(() => parseProdutoEmbalagem(selectedProd?.unidade), [selectedProd?.unidade]);

  // valor calculado a partir de preço/kg ou preço/saco e quantidade
  const valorAuto = useMemo(() => {
    const pKg = Number(precoKg.replace(",", ".")) || 0;
    const qInput = Number(qtd.replace(",", ".")) || 0;
    if (!pKg || !qInput) return 0;

    const isEmbalagemUnit = selectedEmb.temEmbalagem && (
      unidade.toLowerCase().includes(selectedEmb.tipoEmbalagem) ||
      unidade === "saco" ||
      unidade === "pacote" ||
      unidade === "caixa" ||
      unidade === "fardo"
    );

    if (isEmbalagemUnit && selectedEmb.pesoEmbalagem) {
      const totalKg = qInput * selectedEmb.pesoEmbalagem;
      return pKg * totalKg;
    }

    if ((unidade === "g" || unidade === "ml") && (selectedEmb.unidadeBase === "kg" || selectedEmb.unidadeBase === "litro")) {
      return pKg * (qInput / 1000);
    }

    if (selectedEmb.unidadeBase === "g" && (unidade === "kg" || unidade === selectedEmb.unidadeBase)) {
      return pKg * qInput * 1000;
    }

    return pKg * qInput;
  }, [precoKg, qtd, unidade, selectedEmb]);

  const valorFinal = valorAuto > 0 ? valorAuto : Number(valorManual.replace(",", ".")) || 0;

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error("Sessão expirada.");
      if (!descricao.trim()) throw new Error("Informe a descrição.");
      if (!valorFinal || valorFinal <= 0) throw new Error("Informe o valor.");
      const qNum = Number(qtd.replace(",", ".")) || 0;
      const isNR = viveiroId === NAO_RATEADO;
      const { error } = await supabase.from("caixa_lancamentos").insert({
        user_id: userId,
        viveiro_id: (viveiroId === TODOS || isNR) ? null : viveiroId,
        data_lancamento: data,
        descricao: descricao.trim(),
        categoria: isNR ? NR_CAT : (categoria.trim() || (tipo === "receita" ? "venda" : "geral")),
        valor: valorFinal,
        tipo,
        quantidade: qNum > 0 ? qNum : null,
        unidade: qNum > 0 ? unidade : null,
        socio_id: socioId || null,
      });
      if (error) throw error;

      // Se for despesa e tiver um produto selecionado (ou correspondência por nome), contabilizar automaticamente no estoque
      if (tipo === "despesa") {
        const prod = produtoId
          ? listaProdutos.find((p) => p.id === produtoId)
          : listaProdutos.find((p) => descricao.toLowerCase().trim().includes(p.nome.toLowerCase().trim()));

        if (prod) {
          const emb = parseProdutoEmbalagem(prod.unidade);
          const qNumInput = qNum > 0 ? qNum : 1;
          const isEmbUnit = emb.temEmbalagem && (
            unidade.toLowerCase().includes(emb.tipoEmbalagem) ||
            unidade === "saco" ||
            unidade === "pacote" ||
            unidade === "caixa"
          );

          let totalQtdEstoque = qNumInput;
          let unitNameEstoque = emb.unidadeBase || "kg";

          if (isEmbUnit && emb.pesoEmbalagem) {
            totalQtdEstoque = qNumInput * emb.pesoEmbalagem;
          } else if (unidade === "g" && emb.unidadeBase === "kg") {
            totalQtdEstoque = qNumInput / 1000;
          }

          const unitPriceEstoque = Number(precoKg.replace(",", ".")) || prod.preco_unidade || (valorFinal / (totalQtdEstoque || 1));

          const obsEntrada = isEmbUnit && emb.pesoEmbalagem
            ? `Entrada automática via caixa: ${prod.nome} (${qNumInput} ${emb.tipoEmbalagem}(s) de ${emb.pesoEmbalagem} ${emb.unidadeBase} = ${totalQtdEstoque} ${emb.unidadeBase})`
            : `Entrada automática via caixa: ${prod.nome} (${totalQtdEstoque} ${unitNameEstoque})`;

          await supabase.from("estoque_entradas").insert({
            user_id: userId,
            produto_id: prod.id,
            quantidade: totalQtdEstoque,
            unidade: unitNameEstoque,
            preco_unidade: unitPriceEstoque > 0 ? unitPriceEstoque : null,
            custo_total: valorFinal,
            fornecedor: "Compra via Caixa",
            data_entrada: data,
            observacao: obsEntrada,
          });
        }
      }
    },
    onSuccess: () => {
      toast.success(tipo === "receita" ? "Receita registrada" : "Despesa registrada e estoque atualizado!");
      setProdutoId("");
      setDescricao("");
      setCategoria("");
      setPrecoKg("");
      setQtd("");
      setValorManual("");
      setSocioId("");
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
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

    const rateados = lancamentos.filter((l) => !l.viveiro_id && l.categoria !== NR_CAT);
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

  const socioMap = useMemo(() => new Map(socios.map((s) => [s.id, s.nome])), [socios]);
  const viveiroMap = useMemo(() => new Map(viveiros.map((v) => [v.id, v.nome])), [viveiros]);

  const despesasDiscriminadas = useMemo(() => {
    return lancamentos.filter((l) => {
      if (l.tipo === "receita") return false;
      if (filtroDestinoDisc !== "__todos__") {
        if (filtroDestinoDisc === "rateado") {
          if (l.viveiro_id || l.categoria === NR_CAT) return false;
        } else if (filtroDestinoDisc === "isento") {
          if (l.categoria !== NR_CAT) return false;
        } else {
          if (l.viveiro_id !== filtroDestinoDisc) return false;
        }
      }
      if (buscaDiscriminacao.trim()) {
        const term = buscaDiscriminacao.toLowerCase().trim();
        const descMatch = (l.descricao || "").toLowerCase().includes(term);
        const catMatch = (l.categoria || "").toLowerCase().includes(term);
        const socioName = l.socio_id ? (socioMap.get(l.socio_id) || "") : "";
        const socioMatch = socioName.toLowerCase().includes(term);
        if (!descMatch && !catMatch && !socioMatch) return false;
      }
      return true;
    });
  }, [lancamentos, filtroDestinoDisc, buscaDiscriminacao, socioMap]);



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

      <div className="flex gap-2 p-1 rounded-xl bg-muted overflow-x-auto">
        <button
          type="button"
          onClick={() => setSubTab("geral")}
          className={`flex-1 min-w-[140px] h-10 rounded-lg font-semibold text-sm transition ${
            subTab === "geral"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📊 Visão Geral & Viveiros
        </button>
        <button
          type="button"
          onClick={() => setSubTab("compras")}
          className={`flex-1 min-w-[140px] h-10 rounded-lg font-semibold text-sm transition ${
            subTab === "compras"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          🛍️ Compras por Sócio
        </button>
      </div>

      {subTab === "compras" ? (
        <CaixaComprasPorSocioView
          lancamentos={lancamentos}
          viveiros={viveiros}
          socios={socios}
          onEdit={(l) => setEditing(l)}
          onDel={(id) => delMut.mutate(id)}
          onAddSocio={(nome) => addSocioMut.mutate(nome)}
          onSaveCompra={async (data) => {
            await compraMut.mutateAsync(data);
          }}
          isPending={compraMut.isPending}
        />
      ) : (
        <>
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
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                Caixa por viveiro ({relatorio.porViveiro.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Arraste pro lado ou use as setas para navegar entre os viveiros
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => scrollViveiros("left")}
                className="size-9 rounded-xl border bg-card hover:bg-accent flex items-center justify-center text-foreground transition active:scale-95 shadow-sm"
                title="Rolar para esquerda"
                aria-label="Rolar para esquerda"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollViveiros("right")}
                className="size-9 rounded-xl border bg-card hover:bg-accent flex items-center justify-center text-foreground transition active:scale-95 shadow-sm"
                title="Rolar para direita"
                aria-label="Rolar para direita"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </div>

          <div
            ref={viveirosScrollRef}
            className="w-full overflow-x-auto scroll-smooth touch-pan-x py-2 px-1 flex gap-4 snap-x snap-mandatory focus:outline-none"
            style={{
              WebkitOverflowScrolling: "touch",
            }}
          >
            {relatorio.porViveiro.map((v) => (
              <div
                key={v.id}
                className="snap-start shrink-0 w-[85%] sm:w-[320px] rounded-2xl border bg-card p-4 shadow-sm flex flex-col gap-3"
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
                            {h.l.socio_id && socioMap.get(h.l.socio_id) && (
                              <span className="ml-1 text-[10px] text-primary/80">
                                · {socioMap.get(h.l.socio_id)}
                              </span>
                            )}
                          </span>

                          <span
                            className={`font-semibold tabular-nums ${h.l.tipo === "receita" ? "text-emerald-600" : "text-destructive"}`}
                          >
                            {h.l.tipo === "receita" ? "+" : "−"} {fmtBRL(h.valorMostrado)}
                          </span>

                          <div className="flex gap-0.5">
                            <button
                              type="button"
                              onClick={() => setEditing(h.l)}
                              className="size-6 rounded text-muted-foreground hover:bg-muted flex items-center justify-center"
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
              </div>
            ))}
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
              <option value={NAO_RATEADO}>🚫 Não rateado</option>
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


        {tipo === "despesa" && (
          <Field label="📦 Selecionar Produto Cadastrado (Opcional - Puxa valor e Aumenta o Estoque)">
            <select
              value={produtoId}
              onChange={(e) => {
                const pId = e.target.value;
                setProdutoId(pId);
                const prod = listaProdutos.find((p) => p.id === pId);
                if (prod) {
                  const emb = parseProdutoEmbalagem(prod.unidade);
                  setDescricao(prod.nome);
                  if (prod.categoria) setCategoria(prod.categoria);
                  if (prod.preco_unidade && prod.preco_unidade > 0) {
                    setPrecoKg(String(prod.preco_unidade));
                  }
                  if (emb.temEmbalagem) {
                    setUnidade(emb.tipoEmbalagem || "saco");
                  } else {
                    setUnidade(emb.unidadeBase || "kg");
                  }
                }
              }}
              className="app-input border-primary/40 bg-primary/5 font-semibold text-primary"
            >
              <option value="">— Nenhum produto (Lançamento manual / Serviço) —</option>
              {listaProdutos.map((p) => {
                const emb = parseProdutoEmbalagem(p.unidade);
                let labelPreco = "";
                if (p.preco_unidade) {
                  if (emb.temEmbalagem && emb.pesoEmbalagem) {
                    const precoSaco = p.preco_unidade * emb.pesoEmbalagem;
                    labelPreco = `(R$ ${p.preco_unidade.toFixed(2)}/${emb.unidadeBase} · R$ ${precoSaco.toFixed(2)}/${emb.tipoEmbalagem} de ${emb.pesoEmbalagem}${emb.unidadeBase})`;
                  } else {
                    labelPreco = `(R$ ${p.preco_unidade.toFixed(2)} / ${emb.unidadeBase})`;
                  }
                }
                return (
                  <option key={p.id} value={p.id}>
                    📦 {p.nome} {labelPreco}
                  </option>
                );
              })}
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
            <Field label={`Preço por ${selectedEmb.temEmbalagem && (unidade.toLowerCase().includes(selectedEmb.tipoEmbalagem) || unidade === "saco") ? selectedEmb.unidadeBase : (unidade || "un")} (R$)`}>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9.,]*"
                value={precoKg}
                onChange={(e) => setPrecoKg(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="app-input font-bold"
                placeholder="Ex: 5,00"
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
                  className="app-input flex-1 font-bold"
                  placeholder="Ex: 1"
                />
                {selectedEmb.temEmbalagem ? (
                  <select
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    className="app-input w-36 font-semibold text-primary"
                  >
                    <option value={selectedEmb.tipoEmbalagem}>{selectedEmb.tipoEmbalagem} ({selectedEmb.pesoEmbalagem} {selectedEmb.unidadeBase})</option>
                    {selectedEmb.unidadeBase === "kg" && <option value="g">g (gramas)</option>}
                    <option value={selectedEmb.unidadeBase}>{selectedEmb.unidadeBase}</option>
                    {selectedEmb.unidadeBase === "litro" && <option value="ml">ml (mililitro)</option>}
                  </select>
                ) : (
                  <select
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    className="app-input w-24"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="saco">saco</option>
                    <option value="sacola">sacola</option>
                    <option value="litro">litro</option>
                    <option value="un">unidade</option>
                  </select>
                )}
              </div>
            </Field>
          </div>

          {selectedEmb.temEmbalagem && (unidade.toLowerCase().includes(selectedEmb.tipoEmbalagem) || unidade === "saco") && Number(qtd) > 0 && selectedEmb.pesoEmbalagem && (
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
              💡 {qtd} {selectedEmb.tipoEmbalagem}(s) de {selectedEmb.pesoEmbalagem} {selectedEmb.unidadeBase} = <strong className="text-foreground">{Number(qtd) * selectedEmb.pesoEmbalagem} {selectedEmb.unidadeBase}</strong> no estoque
              {precoKg && ` (R$ ${(Number(precoKg.replace(",", ".")) * selectedEmb.pesoEmbalagem).toFixed(2)} por ${selectedEmb.tipoEmbalagem})`}
            </div>
          )}
          {(unidade === "g" || unidade === "ml") && (selectedEmb.unidadeBase === "kg" || selectedEmb.unidadeBase === "litro") && Number(qtd) > 0 && (
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
              💡 {qtd} {unidade} = <strong className="text-foreground">{(Number(qtd) / 1000).toFixed(3)} {selectedEmb.unidadeBase}</strong>
            </div>
          )}

          {valorAuto > 0 && (
            <p className="text-sm">
              Valor total calculado:{" "}
              <span className="font-bold text-emerald-600 text-base">{fmtBRL(valorAuto)}</span>
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
          {saveMut.isPending ? "Salvando..." : "Salvar"}
        </button>
      </form>

      {/* Seção de Discriminação de Gastos dos Viveiros */}
      <section className="rounded-2xl bg-card border p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b">
          <div>
            <h2 className="font-bold text-base flex items-center gap-2">
              <Boxes className="size-5 text-primary" /> Discriminação de Gastos & Serviços dos Viveiros
            </h2>
            <p className="text-xs text-muted-foreground">
              Detalhamento de produtos, eletricista, manutenção e serviços contratados
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={buscaDiscriminacao}
              onChange={(e) => setBuscaDiscriminacao(e.target.value)}
              placeholder="Buscar (ex: eletricista, ração, encanador)..."
              className="app-input text-xs py-1.5 h-9 min-w-[200px]"
            />
            <select
              value={filtroDestinoDisc}
              onChange={(e) => setFiltroDestinoDisc(e.target.value)}
              className="app-input text-xs py-1.5 h-9 w-auto"
            >
              <option value="__todos__">🏝️ Todos os Destinos</option>
              <option value="rateado">🔄 Rateado (Todos os Viveiros)</option>
              <option value="isento">🛑 Isento / Gasto Interno</option>
              {viveiros.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </div>
        </div>

        {despesasDiscriminadas.length === 0 ? (
          <div className="p-8 border-2 border-dashed rounded-2xl text-center text-xs text-muted-foreground italic">
            Nenhuma despesa ou serviço discriminado encontrado.
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {despesasDiscriminadas.map((l) => {
              const vivLabel = l.categoria === NR_CAT
                ? "Isento / Não Rateado"
                : l.viveiro_id
                  ? (viveiroMap.get(l.viveiro_id) ?? "—")
                  : "Rateado (Todos os Viveiros)";

              const isRateado = !l.viveiro_id && l.categoria !== NR_CAT;
              const isIsento = l.categoria === NR_CAT && !l.viveiro_id;
              const socioNome = l.socio_id ? socioMap.get(l.socio_id) : null;

              return (
                <div key={l.id} className="p-3.5 rounded-2xl bg-card border flex items-center justify-between gap-3 text-xs shadow-2xs hover:border-primary/40 transition">
                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground truncate">{l.descricao}</span>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        isRateado
                          ? "bg-primary/10 text-primary"
                          : isIsento
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      }`}>
                        {isRateado ? "🔄 Rateado (Todos)" : isIsento ? "🛑 Gasto Interno" : `🏝️ ${vivLabel}`}
                      </span>

                      {l.categoria && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                          {l.categoria}
                        </span>
                      )}

                      {socioNome && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400">
                          👤 {socioNome}
                        </span>
                      )}
                    </div>

                    <p className="text-muted-foreground text-[11px]">
                      Data: {fmtDate(l.data_lancamento)}
                      {l.quantidade && ` · Qtd: ${l.quantidade} ${l.unidade || "un"}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-base font-black text-destructive tabular-nums">
                      − {fmtBRL(Number(l.valor ?? 0))}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(l)}
                        className="size-8 rounded-xl border flex items-center justify-center hover:bg-accent transition"
                        title="Editar lançamento"
                      >
                        <Pencil className="size-3.5 text-muted-foreground" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Apagar "${l.descricao}"?`)) delMut.mutate(l.id);
                        }}
                        className="size-8 rounded-xl border flex items-center justify-center hover:bg-destructive/10 text-destructive transition"
                        title="Apagar lançamento"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!isLoading && lancamentos.length === 0 && (
        <div className="p-5 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground">
          Sem despesas ainda.
        </div>
      )}

      {lancamentos.length > 0 && (
        <section className="rounded-2xl bg-card border p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="font-bold">Histórico geral</h2>
              <p className="text-xs text-muted-foreground">
                {selectedIds.size > 0
                  ? `${selectedIds.size} selecionado(s)`
                  : `${lancamentos.length} lançamento(s)`}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="h-9 px-3 rounded-lg border text-xs font-semibold hover:bg-muted"
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => {
                  const rows = lancamentos.filter((l) => selectedIds.has(l.id));
                  const doc = new jsPDF();
                  buildFlatPDF(doc, rows, viveiroMap, "Caixa · Selecionados");
                  openPdf(doc, `caixa-selecionados-${new Date().toISOString().slice(0, 10)}.pdf`);
                  toast.success("PDF gerado");
                }}
                className="h-9 px-3 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 disabled:opacity-40 flex items-center gap-1.5"
              >
                <FileDown className="size-3.5" /> Imprimir selecionados
              </button>
              <button
                type="button"
                onClick={() => {
                  const doc = new jsPDF();
                  buildFlatPDF(doc, lancamentos, viveiroMap, "Caixa · Histórico completo");
                  openPdf(doc, `caixa-completo-${new Date().toISOString().slice(0, 10)}.pdf`);
                  toast.success("PDF gerado");
                }}
                className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 flex items-center gap-1.5"
              >
                <Download className="size-3.5" /> Imprimir tudo
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pb-2 border-b">
            <input
              type="checkbox"
              checked={selectedIds.size === lancamentos.length && lancamentos.length > 0}
              onChange={(e) => {
                if (e.target.checked) setSelectedIds(new Set(lancamentos.map((l) => l.id)));
                else setSelectedIds(new Set());
              }}
              className="size-4"
            />
            <span className="text-xs font-semibold text-muted-foreground">Selecionar todos</span>
          </div>

          <ul className="divide-y">
            {lancamentos.map((l) => {
              const checked = selectedIds.has(l.id);
              const vivLabel = l.categoria === NR_CAT
                ? "Não rateado"
                : l.viveiro_id
                  ? (viveiroMap.get(l.viveiro_id) ?? "—")
                  : "Rateado";
              return (
                <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(l.id);
                        else next.delete(l.id);
                        return next;
                      });
                    }}
                    className="size-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{l.descricao}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDate(l.data_lancamento)} · {vivLabel}
                    </p>
                  </div>
                  <span
                    className={`font-semibold tabular-nums text-sm shrink-0 ${l.tipo === "receita" ? "text-emerald-600" : "text-destructive"}`}
                  >
                    {l.tipo === "receita" ? "+" : "−"} {fmtBRL(Number(l.valor ?? 0))}
                  </span>
                  <div className="flex gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(l)}
                      className="size-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary flex items-center justify-center"
                      aria-label="Editar"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Apagar "${l.descricao}"?`)) delMut.mutate(l.id);
                      }}
                      className="size-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                      aria-label="Apagar"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
        </>
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
          socioMap={socioMap}
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
  socioMap,
  onClose,
  onEdit,
  onDelete,
}: {
  v: ViveiroRel;
  socioMap: Map<string, string>;
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
                        {h.l.socio_id && socioMap.get(h.l.socio_id) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Sócio: <span className="font-medium">{socioMap.get(h.l.socio_id)}</span>
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
  const [viveiroId, setViveiroId] = useState<string>(
    lanc.categoria === NR_CAT ? NAO_RATEADO : (lanc.viveiro_id ?? TODOS)
  );
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
          viveiro_id: (viveiroId === TODOS || viveiroId === NAO_RATEADO) ? null : viveiroId,
          data_lancamento: data,
          descricao: descricao.trim(),
          categoria: viveiroId === NAO_RATEADO ? NR_CAT : (categoria.trim() || "geral"),
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
              <option value={NAO_RATEADO}>🚫 Não rateado</option>
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

function CaixaComprasPorSocioView({
  lancamentos,
  viveiros,
  socios,
  onEdit,
  onDel,
  onAddSocio,
  onSaveCompra,
  isPending,
}: {
  lancamentos: Lanc[];
  viveiros: ViveiroOpt[];
  socios: Socio[];
  onEdit: (l: Lanc) => void;
  onDel: (id: string) => void;
  onAddSocio: (nome: string) => void;
  onSaveCompra: (data: {
    socioId: string;
    viveiroId: string;
    descricao: string;
    categoria: string;
    valor: number;
    data: string;
  }) => Promise<void>;
  isPending: boolean;
}) {
  const [filtroSocio, setFiltroSocio] = useState<string>("__todos__");
  const [filtroDestino, setFiltroDestino] = useState<string>("__todos__");
  const [busca, setBusca] = useState<string>("");

  const [socioId, setSocioId] = useState<string>("");
  const [viveiroId, setViveiroId] = useState<string>(NAO_RATEADO);
  const [descricao, setDescricao] = useState<string>("");
  const [categoria, setCategoria] = useState<string>("");
  const [valor, setValor] = useState<string>("");
  const [data, setData] = useState<string>(todayLocal());

  const socioMap = useMemo(() => new Map(socios.map((s) => [s.id, s.nome])), [socios]);
  const viveiroMap = useMemo(() => new Map(viveiros.map((v) => [v.id, v.nome])), [viveiros]);

  const despesas = useMemo(() => lancamentos.filter((l) => l.tipo === "despesa"), [lancamentos]);

  const resumoPorSocio = useMemo(() => {
    const map = new Map<string, { total: number; viveiros: number; isento: number }>();

    for (const s of socios) {
      map.set(s.id, { total: 0, viveiros: 0, isento: 0 });
    }

    let semSocioTotal = 0;
    let semSocioViv = 0;
    let semSocioIsento = 0;

    for (const d of despesas) {
      const v = Number(d.valor ?? 0);
      const isIsentoOuGeral = !d.viveiro_id;

      if (d.socio_id && map.has(d.socio_id)) {
        const cur = map.get(d.socio_id)!;
        cur.total += v;
        if (isIsentoOuGeral) cur.isento += v;
        else cur.viveiros += v;
      } else {
        semSocioTotal += v;
        if (isIsentoOuGeral) semSocioIsento += v;
        else semSocioViv += v;
      }
    }

    return { map, semSocioTotal, semSocioViv, semSocioIsento };
  }, [despesas, socios]);

  const despesasFiltradas = useMemo(() => {
    return despesas.filter((d) => {
      if (filtroSocio !== "__todos__") {
        if (filtroSocio === "__sem_socio__" && d.socio_id) return false;
        if (filtroSocio !== "__sem_socio__" && d.socio_id !== filtroSocio) return false;
      }
      if (filtroDestino !== "__todos__") {
        if (filtroDestino === "isento") {
          if (d.viveiro_id || d.categoria !== NR_CAT) return false;
        } else if (filtroDestino === "rateado") {
          if (d.viveiro_id || d.categoria === NR_CAT) return false;
        } else {
          if (d.viveiro_id !== filtroDestino) return false;
        }
      }
      if (busca.trim()) {
        const term = busca.toLowerCase().trim();
        const descMatch = d.descricao.toLowerCase().includes(term);
        const catMatch = (d.categoria ?? "").toLowerCase().includes(term);
        const socioMatch = (socioMap.get(d.socio_id ?? "") ?? "").toLowerCase().includes(term);
        if (!descMatch && !catMatch && !socioMatch) return false;
      }
      return true;
    });
  }, [despesas, filtroSocio, filtroDestino, busca, socioMap]);

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valNum = Number(valor.replace(",", "."));
    if (!descricao.trim()) return toast.error("Informe a descrição da compra.");
    if (!valNum || valNum <= 0) return toast.error("Informe um valor válido.");

    await onSaveCompra({
      socioId,
      viveiroId,
      descricao: descricao.trim(),
      categoria,
      valor: valNum,
      data,
    });

    setDescricao("");
    setCategoria("");
    setValor("");
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <Users className="size-4" /> Compras & Despesas por Sócio
          </h2>
          <span className="text-xs text-muted-foreground">{socios.length} sócio(s) cadastrado(s)</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {socios.map((s) => {
            const dataS = resumoPorSocio.map.get(s.id) ?? { total: 0, viveiros: 0, isento: 0 };
            return (
              <div
                key={s.id}
                className="rounded-2xl border bg-card p-4 space-y-2 shadow-sm hover:border-primary/40 transition"
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-base truncate">{s.nome}</p>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    Pagador
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Pago</p>
                  <p className="text-2xl font-black text-primary tabular-nums">
                    {fmtBRL(dataS.total)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Em Viveiros</p>
                    <p className="font-semibold text-emerald-600 tabular-nums">{fmtBRL(dataS.viveiros)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Isento / Pessoal</p>
                    <p className="font-semibold text-amber-600 tabular-nums">{fmtBRL(dataS.isento)}</p>
                  </div>
                </div>
              </div>
            );
          })}

          {resumoPorSocio.semSocioTotal > 0 && (
            <div className="rounded-2xl border border-dashed bg-muted/20 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-bold text-base text-muted-foreground truncate">Sem Sócio Atribuído</p>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  Geral
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Não Atribuído</p>
                <p className="text-2xl font-black text-muted-foreground tabular-nums">
                  {fmtBRL(resumoPorSocio.semSocioTotal)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40">
                <div>
                  <p className="text-[10px] text-muted-foreground">Em Viveiros</p>
                  <p className="font-semibold text-emerald-600 tabular-nums">{fmtBRL(resumoPorSocio.semSocioViv)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Isento / Pessoal</p>
                  <p className="font-semibold text-amber-600 tabular-nums">{fmtBRL(resumoPorSocio.semSocioIsento)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-card border p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b">
          <div>
            <h3 className="font-bold text-base">Histórico Discriminado de Compras</h3>
            <p className="text-xs text-muted-foreground">
              {despesasFiltradas.length} compra(s) encontrada(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filtroSocio}
              onChange={(e) => setFiltroSocio(e.target.value)}
              className="app-input text-xs py-1.5 h-9 w-auto"
            >
              <option value="__todos__">👤 Todos os Sócios</option>
              <option value="__sem_socio__">Sem Sócio</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>

            <select
              value={filtroDestino}
              onChange={(e) => setFiltroDestino(e.target.value)}
              className="app-input text-xs py-1.5 h-9 w-auto"
            >
              <option value="__todos__">🏝️ Todos os Destinos</option>
              <option value="isento">🛑 Isento / Pessoal</option>
              <option value="rateado">🔄 Rateado (Geral)</option>
              {viveiros.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </div>
        </div>

        {despesasFiltradas.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground italic">
            Nenhuma compra registrada com os filtros selecionados.
          </p>
        ) : (
          <ul className="divide-y">
            {despesasFiltradas.map((d) => {
              const socioNome = d.socio_id ? socioMap.get(d.socio_id) : null;
              const isIsento = d.categoria === NR_CAT && !d.viveiro_id;
              const isRateado = !d.viveiro_id && !isIsento;
              const viveiroNome = d.viveiro_id ? viveiroMap.get(d.viveiro_id) : null;

              return (
                <li key={d.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{d.descricao}</p>
                      {socioNome ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          👤 {socioNome}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          Sem sócio
                        </span>
                      )}
                      {isIsento ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          🛑 Isento / Pessoal
                        </span>
                      ) : isRateado ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400">
                          🔄 Rateado entre todos
                        </span>
                      ) : viveiroNome ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                          🏝️ {viveiroNome}
                        </span>
                      ) : null}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {fmtDate(d.data_lancamento)}
                      {d.categoria && d.categoria !== NR_CAT && ` · Categoria: ${d.categoria}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-base text-destructive tabular-nums">
                      − {fmtBRL(Number(d.valor ?? 0))}
                    </span>

                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(d)}
                        className="size-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary flex items-center justify-center"
                        title="Editar"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Apagar "${d.descricao}"?`)) onDel(d.id);
                        }}
                        className="size-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                        title="Apagar"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
