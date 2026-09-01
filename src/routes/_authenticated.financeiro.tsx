import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus, Link2, MessageCircle, Printer, FileDown, Zap, Check, Repeat, Pencil, Receipt, History, DollarSign, Users, RotateCcw, Tag, List, BarChart3, TrendingUp, TrendingDown, PieChart, Wallet, Landmark, ChevronRight, Paperclip, Archive, ArchiveRestore } from "lucide-react";
import { BtnTutorial } from "@/components/BtnTutorial";


const CS_TAG = "[cs]";
const stripTag = (o: string | null) => (o ?? "").replace(/^\[cs\]\s*/, "").trim();

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro" }] }),
  component: FinanceiroPage,
});

function FinanceiroPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-10 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><DollarSign className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Financeiro</h1>
          <p className="text-xs text-muted-foreground truncate">Sua conta pessoal — débito, crédito e saldo por pessoa</p>
        </div>
        <BtnTutorial videoId="VrvKKymfpAE" label="Financeiro" />
      </div>
      <PessoalTab />
    </div>
  );
}

const CAT_PADRAO = ["Salário", "Alimentação", "Transporte", "Moradia", "Energia", "Água", "Internet", "Saúde", "Educação", "Lazer", "Freelance", "Compras", "Investimento", "Outros"];
type FpLanc = { id: string; tipo: string; descricao: string; valor: number; categoria: string; data: string; observacao: string | null; anexo_url?: string | null; created_at?: string };
type FpCat = { id: string; nome: string; icone: string; excluida: boolean; arquivada?: boolean };

function PessoalTab() {
  const qc = useQueryClient();
  const [reportPessoa, setReportPessoa] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FpLanc | null>(null);
  const [pessoaForm, setPessoaForm] = useState("");
  const [tipo, setTipo] = useState<"despesa" | "receita">("despesa");
  const [val, setVal] = useState("");
  const [desc, setDesc] = useState("");
  const [forma, setForma] = useState("");
  const [dt, setDt] = useState(todayISO());
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [anexoAtual, setAnexoAtual] = useState<string | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);

  const { data: lancs = [] } = useQuery({ queryKey: ["fp"], queryFn: async () => { const r = await supabase.from("financeiro_pessoal").select("*").order("data", { ascending: false }).order("created_at", { ascending: false }); if (r.error) throw r.error; return (r.data ?? []) as FpLanc[]; } });
  const { data: cats = [] } = useQuery({ queryKey: ["fp_cats"], queryFn: async () => { const r = await supabase.from("categorias_financeiro").select("*").order("nome"); if (r.error) throw r.error; return (r.data ?? []) as FpCat[]; } });

  const contas = useMemo(() => {
    const m: Record<string, { debito: number; credito: number }> = {};
    for (const l of lancs) {
      const c = m[l.categoria] ?? { debito: 0, credito: 0 };
      if (l.tipo === "receita") c.credito += Number(l.valor); else c.debito += Number(l.valor);
      m[l.categoria] = c;
    }
    return m;
  }, [lancs]);

  const arquivadasSet = useMemo(() => new Set(cats.filter((c) => c.arquivada && !c.excluida).map((c) => c.nome)), [cats]);
  const pessoasList = useMemo(() => {
    const s = new Set<string>();
    cats.filter((c) => !c.excluida).forEach((c) => s.add(c.nome));
    Object.keys(contas).forEach((n) => s.add(n));
    return Array.from(s)
      .filter((n) => n !== "geral" || contas[n])
      .filter((n) => (verArquivados ? arquivadasSet.has(n) : !arquivadasSet.has(n)))
      .sort((a, b) => {
        const sa = Math.abs((contas[a]?.credito ?? 0) - (contas[a]?.debito ?? 0));
        const sb = Math.abs((contas[b]?.credito ?? 0) - (contas[b]?.debito ?? 0));
        return sb - sa || a.localeCompare(b);
      });
  }, [cats, contas, verArquivados, arquivadasSet]);
  const qtdArquivadas = arquivadasSet.size;

  const { totDeb, totCred } = useMemo(() => {
    let d = 0, c = 0;
    for (const nome of pessoasList) {
      const x = contas[nome] ?? { debito: 0, credito: 0 };
      d += x.debito; c += x.credito;
    }
    return { totDeb: d, totCred: c };
  }, [pessoasList, contas]);
  const saldoGeral = totCred - totDeb;

  const saveMut = useMutation({
    mutationFn: async () => {
      const v = Number(val.replace(",", "."));
      if (!v || v <= 0) throw new Error("Informe o valor.");
      if (!desc.trim()) throw new Error("Diga o que foi (especificação).");
      if (!pessoaForm.trim()) throw new Error("Escolha a pessoa.");
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      const obsFinal = forma.trim() || null;
      // Upload do comprovante (se anexado)
      let anexoPath: string | null | undefined = undefined; // undefined = não mexe
      if (anexoFile) {
        const ext = anexoFile.name.split(".").pop() || "dat";
        const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("comprovantes").upload(path, anexoFile, { upsert: false, contentType: anexoFile.type || undefined });
        if (upErr) throw new Error("Falha ao enviar comprovante: " + upErr.message);
        anexoPath = path;
      }
      if (editing) {
        const patch: Record<string, unknown> = { tipo, descricao: desc.trim(), valor: v, categoria: pessoaForm, data: dt, observacao: obsFinal };
        if (anexoPath !== undefined) patch.anexo_url = anexoPath;
        const { error } = await supabase.from("financeiro_pessoal").update(patch).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financeiro_pessoal").insert({ user_id: uid, tipo, descricao: desc.trim(), valor: v, categoria: pessoaForm, data: dt, observacao: obsFinal, anexo_url: anexoPath ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Atualizado" : "Registrado"); reset(); qc.invalidateQueries({ queryKey: ["fp"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({ mutationFn: (id: string) => supabase.from("financeiro_pessoal").delete().eq("id", id), onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["fp"] }); }, onError: (e: Error) => toast.error(e.message) });
  const addPessoaMut = useMutation({ mutationFn: async (nome: string) => { const { data: u } = await supabase.auth.getUser(); const { error } = await supabase.from("categorias_financeiro").insert({ user_id: u.user?.id, nome, icone: "👤" }); if (error) throw error; }, onSuccess: () => { toast.success("Pessoa cadastrada"); qc.invalidateQueries({ queryKey: ["fp_cats"] }); }, onError: (e: Error) => toast.error(e.message) });
  const delPessoaMut = useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from("financeiro_pessoal").delete().eq("categoria", nome);
      if (error) throw error;
      const cat = cats.find((c) => c.nome === nome && !c.excluida);
      if (cat) await supabase.from("categorias_financeiro").delete().eq("id", cat.id);
    },
    onSuccess: () => { toast.success("Pessoa apagada"); setReportPessoa(null); qc.invalidateQueries({ queryKey: ["fp"] }); qc.invalidateQueries({ queryKey: ["fp_cats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const transferPessoaMut = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      if (!to) throw new Error("Escolha a pessoa destino.");
      const { error } = await supabase.from("financeiro_pessoal").update({ categoria: to }).eq("categoria", from);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(`Movido para ${v.to}`); setTransferTo(""); setReportPessoa(v.to); qc.invalidateQueries({ queryKey: ["fp"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const renamePessoaMut = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const novo = to.trim();
      if (!novo) throw new Error("Nome inválido.");
      if (novo === from) return;
      const { error } = await supabase.from("financeiro_pessoal").update({ categoria: novo }).eq("categoria", from);
      if (error) throw error;
      const cat = cats.find((c) => c.nome === from && !c.excluida);
      if (cat) { const { error: e2 } = await supabase.from("categorias_financeiro").update({ nome: novo }).eq("id", cat.id); if (e2) throw e2; }
    },
    onSuccess: (_d, v) => { toast.success("Nome atualizado"); setReportPessoa(v.to.trim()); qc.invalidateQueries({ queryKey: ["fp"] }); qc.invalidateQueries({ queryKey: ["fp_cats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const arquivarPessoaMut = useMutation({
    mutationFn: async ({ nome, arquivar }: { nome: string; arquivar: boolean }) => {
      const { data: u } = await supabase.auth.getUser();
      const cat = cats.find((c) => c.nome === nome && !c.excluida);
      if (cat) {
        const { error } = await supabase.from("categorias_financeiro").update({ arquivada: arquivar }).eq("id", cat.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categorias_financeiro").insert({ user_id: u.user?.id, nome, icone: "👤", arquivada: arquivar });
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => { toast.success(v.arquivar ? "Conta arquivada" : "Conta desarquivada"); setReportPessoa(null); qc.invalidateQueries({ queryKey: ["fp_cats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function reset() { setShowForm(false); setEditing(null); setTipo("despesa"); setVal(""); setDesc(""); setForma(""); setDt(todayISO()); setAnexoFile(null); setAnexoAtual(null); }
  function novoLanc(pessoa: string, t: "despesa" | "receita") { setEditing(null); setPessoaForm(pessoa); setTipo(t); setVal(""); setDesc(""); setForma(""); setDt(todayISO()); setAnexoFile(null); setAnexoAtual(null); setReportPessoa(null); setShowForm(true); }
  function novoLancGlobal() { setEditing(null); if (!pessoaForm || !pessoasList.includes(pessoaForm)) setPessoaForm(lancs[0]?.categoria ?? pessoasList[0] ?? ""); setTipo("despesa"); setVal(""); setDesc(""); setForma(""); setDt(todayISO()); setAnexoFile(null); setAnexoAtual(null); setReportPessoa(null); setShowForm(true); }
  function editLanc(l: FpLanc) { setEditing(l); setPessoaForm(l.categoria); setTipo(l.tipo === "receita" ? "receita" : "despesa"); setVal(String(l.valor)); setDesc(l.descricao); setForma(["Pix", "Dinheiro", "Outro"].includes(l.observacao || "") ? (l.observacao || "") : ""); setDt(l.data); setAnexoFile(null); setAnexoAtual(l.anexo_url ?? null); setReportPessoa(null); setShowForm(true); }
  async function abrirComprovante(path: string) {
    const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { toast.error("Não foi possível abrir o comprovante."); return; }
    window.open(data.signedUrl, "_blank");
  }
  function novaPessoa() { const nome = window.prompt("Nome da pessoa (quem te deve ou quem você deve):")?.trim(); if (nome) addPessoaMut.mutate(nome); }

  async function pdfPessoa(nome: string) {
    const x = contas[nome] ?? { debito: 0, credito: 0 };
    const entries = lancs.filter((l) => l.categoria === nome).slice().sort((a, b) => a.data.localeCompare(b.data) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
    const saldo = x.credito - x.debito; // crédito - débito (positivo = a favor)
    const [pdfModule, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const jsPDF = pdfModule.default; const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Cabecalho
    doc.setFillColor(16, 185, 129); doc.rect(0, 0, 210, 24, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(`EXTRATO - ${nome}`, 14, 11);
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.text(`Emitido em ${fmtDate(todayISO())}`, 14, 18);

    // Resumo em 3 caixas: Débito, Crédito e Saldo
    const boxes: Array<[string, string, [number, number, number]]> = [
      ["DÉBITO", brl(x.debito), [225, 29, 72]],
      ["CRÉDITO", brl(x.credito), [16, 185, 129]],
      ["SALDO", brl(saldo), saldo >= 0 ? [37, 99, 235] : [225, 29, 72]],
    ];
    const bw = 60, bx0 = 14, gap = 3, by = 30;
    boxes.forEach(([label, valor, color], i) => {
      const bxx = bx0 + i * (bw + gap);
      doc.setFillColor(245, 247, 250); doc.roundedRect(bxx, by, bw, 20, 2, 2, "F");
      doc.setFontSize(6.5); doc.setTextColor(100, 116, 139); doc.setFont("helvetica", "bold");
      doc.text(label, bxx + 3, by + 6, { maxWidth: bw - 6 });
      doc.setFontSize(13); doc.setTextColor(color[0], color[1], color[2]);
      doc.text(valor, bxx + 3, by + 16);
    });

    // Extrato: saldo correndo = crédito - débito acumulado (positivo = a favor)
    let debAcc = 0, credAcc = 0;
    doc.setTextColor(30, 41, 59); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("HISTORICO", 14, 60);
    autoTable(doc, {
      startY: 63,
      head: [["Data", "O que foi", "Débito", "Crédito", "Saldo"]],
      body: entries.map((l) => {
        const v = Number(l.valor); const isCred = l.tipo === "receita";
        if (isCred) credAcc += v; else debAcc += v;
        const run = credAcc - debAcc;
        return [fmtDate(l.data), l.descricao + (l.observacao ? ` (${l.observacao})` : ""), isCred ? "-" : brl(v), isCred ? brl(v) : "-", brl(run)];
      }),
      foot: [["", "TOTAL", brl(x.debito), brl(x.credito), brl(x.credito - x.debito)]],
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
      footStyles: { fillColor: [226, 232, 240], textColor: [30, 41, 59], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
      margin: { left: 14, right: 14 },
    });
    doc.save(`extrato-${nome.replace(/\s+/g, "-")}.pdf`);
    toast.success("PDF gerado!");
  }

  async function pdfGeral() {
    const [pdfModule, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const jsPDF = pdfModule.default; const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFillColor(16, 185, 129); doc.rect(0, 0, 210, 22, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text("FINANCEIRO - PESSOAS", 14, 11);
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.text(`Emitido em ${fmtDate(todayISO())}`, 14, 18);
    doc.setTextColor(30, 41, 59); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(`Débito total: ${brl(totDeb)}    Crédito total: ${brl(totCred)}    Saldo: ${brl(saldoGeral)}`, 14, 30);
    autoTable(doc, {
      startY: 35,
      head: [["Pessoa", "Débito", "Crédito", "Saldo"]],
      body: pessoasList.map((nome) => { const x = contas[nome] ?? { debito: 0, credito: 0 }; const saldo = x.credito - x.debito; return [nome, brl(x.debito), brl(x.credito), brl(saldo)]; }),
      foot: [["TOTAL", brl(totDeb), brl(totCred), brl(saldoGeral)]],
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
      footStyles: { fillColor: [226, 232, 240], textColor: [30, 41, 59], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    doc.save(`financeiro-pessoas-${fmtDate(todayISO()).replace(/\//g, "-")}.pdf`);
    toast.success("PDF gerado!");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-3 min-w-0 overflow-hidden">
          <p className="text-[10px] uppercase text-rose-600 font-bold">Débito</p>
          <p className="text-base sm:text-xl font-black text-rose-600 tabular-nums leading-tight break-words">{brl(totDeb)}</p>
        </div>
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3 min-w-0 overflow-hidden">
          <p className="text-[10px] uppercase text-emerald-600 font-bold">Crédito</p>
          <p className="text-base sm:text-xl font-black text-emerald-600 tabular-nums leading-tight break-words">{brl(totCred)}</p>
        </div>
        <div className={`rounded-2xl border p-3 min-w-0 overflow-hidden ${saldoGeral >= 0 ? "bg-blue-500/10 border-blue-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
          <p className="text-[10px] uppercase text-muted-foreground font-bold">Saldo</p>
          <p className={`text-base sm:text-xl font-black tabular-nums leading-tight break-words ${saldoGeral >= 0 ? "text-blue-600" : "text-rose-600"}`}>{brl(saldoGeral)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => novoLancGlobal()} className="flex-1 h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 active:scale-[0.99] transition">
          <Plus className="size-5" /> Novo lançamento
        </button>
        <button onClick={novaPessoa} className="h-14 px-4 rounded-2xl border font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-muted shrink-0"><Users className="size-5" /><span className="hidden sm:inline">Nova pessoa</span></button>
        {pessoasList.length > 0 && (
          <button onClick={pdfGeral} title="PDF geral" className="h-14 px-4 rounded-2xl border font-bold flex items-center justify-center hover:bg-muted shrink-0"><FileDown className="size-5" /></button>
        )}
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        <button onClick={() => setVerArquivados(false)} className={`flex-1 h-9 rounded-lg font-semibold text-xs transition ${!verArquivados ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>Ativos</button>
        <button onClick={() => setVerArquivados(true)} className={`flex-1 h-9 rounded-lg font-semibold text-xs transition flex items-center justify-center gap-1 ${verArquivados ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}><Archive className="size-3.5" />Arquivados{qtdArquivadas > 0 ? ` (${qtdArquivadas})` : ""}</button>
      </div>

      <p className="text-[11px] text-muted-foreground px-0.5">{verArquivados ? "Contas arquivadas — toque pra ver ou desarquivar." : "Toque numa pessoa pra ver o histórico."} Saldo = Crédito − Débito · <span className="text-blue-600 font-semibold">azul</span> = a favor · <span className="text-rose-600 font-semibold">vermelho</span> = negativo.</p>

      <div className="space-y-2.5">
        {pessoasList.map((nome) => {
          const x = contas[nome] ?? { debito: 0, credito: 0 };
          const saldo = x.credito - x.debito;
          const recentes = lancs.filter((l) => l.categoria === nome).slice(0, 3);
          return (
            <button key={nome} onClick={() => setReportPessoa(nome)} className="w-full text-left rounded-2xl border bg-card p-3.5 space-y-2.5 hover:bg-muted/30 transition">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-lg shrink-0">{nome.charAt(0).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-base truncate">{nome}</p>
                  <p className="text-[11px] mt-0.5 tabular-nums text-muted-foreground">Déb {brl(x.debito)} · Créd {brl(x.credito)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xl font-black tabular-nums leading-none ${saldo >= 0 ? "text-blue-600" : "text-rose-600"}`}>{brl(saldo)}</p>
                  <p className="text-[9px] uppercase text-muted-foreground font-bold mt-0.5">saldo</p>
                </div>
              </div>
              {recentes.length > 0 && (
                <div className="border-t pt-2 space-y-1">
                  {recentes.map((l) => {
                    const isCred = l.tipo === "receita";
                    return (
                      <div key={l.id} className="flex items-center gap-2 text-[11px]">
                        <span className="text-muted-foreground shrink-0 tabular-nums">{fmtDate(l.data)}</span>
                        <span className="truncate flex-1 min-w-0 text-muted-foreground">{l.descricao}{l.anexo_url ? " 📎" : ""}</span>
                        <span className={`font-bold shrink-0 tabular-nums ${isCred ? "text-emerald-600" : "text-rose-600"}`}>{isCred ? "+" : "−"}{brl(Number(l.valor))}</span>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-primary font-semibold pt-0.5">Ver histórico completo →</p>
                </div>
              )}
            </button>
          );
        })}
        {pessoasList.length === 0 && (verArquivados
          ? <div className="p-8 rounded-2xl border-2 border-dashed text-center text-sm text-muted-foreground">Nenhuma conta arquivada.</div>
          : <div className="p-8 rounded-2xl border-2 border-dashed text-center text-sm text-muted-foreground">Nenhuma pessoa ainda.<br />Toque em <span className="font-semibold text-foreground">"Nova pessoa"</span> pra começar.</div>)}
      </div>

      {/* Detalhe da pessoa */}
      <Dialog open={!!reportPessoa} onOpenChange={(o) => { if (!o) setReportPessoa(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          {reportPessoa && (() => {
            const c = reportPessoa;
            const entries = lancs.filter((l) => l.categoria === c).slice().sort((a2, b2) => (a2.data.localeCompare(b2.data)) || String(a2.created_at ?? "").localeCompare(String(b2.created_at ?? "")));
            const x = contas[c] ?? { debito: 0, credito: 0 };
            const saldo = x.credito - x.debito;
            let run = 0;
            const withRun = entries.map((l) => { const v = Number(l.valor); const isCred = l.tipo === "receita"; run += isCred ? v : -v; return { l, v, isCred, run }; }).reverse();
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-2 pr-6">
                    <DialogTitle className="truncate min-w-0">{c}</DialogTitle>
                    <button type="button" onClick={() => { const novo = window.prompt("Novo nome da pessoa:", c)?.trim(); if (novo && novo !== c) renamePessoaMut.mutate({ from: c, to: novo }); }} className="size-7 rounded-lg border hover:bg-muted flex items-center justify-center shrink-0" title="Editar nome"><Pencil className="size-3.5" /></button>
                  </div>
                </DialogHeader>
                <div className={`rounded-2xl border p-3 flex items-center justify-between ${saldo >= 0 ? "bg-blue-500/5 border-blue-500/30" : "bg-rose-500/5 border-rose-500/30"}`}>
                  <div><p className="text-[10px] uppercase text-muted-foreground font-bold">Saldo</p><p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">Déb {brl(x.debito)} · Créd {brl(x.credito)}</p></div>
                  <span className={`text-2xl font-black tabular-nums ${saldo >= 0 ? "text-blue-600" : "text-rose-600"}`}>{brl(saldo)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => novoLanc(c, "receita")} className="h-11 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-500/20">💰 Recebi</button>
                  <button onClick={() => novoLanc(c, "despesa")} className="h-11 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-1 hover:bg-rose-500/20">💸 Dei/paguei</button>
                  <button onClick={() => pdfPessoa(c)} className="h-11 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 hover:bg-muted"><FileDown className="size-4" />PDF</button>
                </div>
                <div className="space-y-2">
                  {withRun.map(({ l, v, isCred, run: r }) => (
                    <div key={l.id} className="p-3 rounded-xl bg-card border space-y-2">
                      <div className="flex items-start gap-2">
                        <p className="text-sm font-medium flex-1 min-w-0 break-words leading-snug">{l.descricao}</p>
                        <p className={`text-sm font-bold tabular-nums shrink-0 ${isCred ? "text-emerald-600" : "text-rose-600"}`}>{isCred ? "+" : "−"}{brl(v)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-muted-foreground">{fmtDate(l.data)}</span>
                        {l.observacao ? <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{l.observacao}</span> : null}
                        <span className="text-[11px] text-muted-foreground tabular-nums">saldo {brl(r)}</span>
                        <div className="flex-1" />
                        {l.anexo_url ? <button onClick={() => abrirComprovante(l.anexo_url!)} className="size-8 rounded-lg border text-primary hover:bg-primary/5 flex items-center justify-center" title="Ver comprovante"><Paperclip className="size-3.5" /></button> : null}
                        <button onClick={() => editLanc(l)} className="size-8 rounded-lg border hover:bg-muted flex items-center justify-center" title="Editar"><Pencil className="size-3.5" /></button>
                        <button onClick={() => { if (confirm(`Apagar "${l.descricao}"?`)) delMut.mutate(l.id); }} className="size-8 rounded-lg border hover:bg-destructive/10 hover:text-destructive flex items-center justify-center" title="Apagar"><Trash2 className="size-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  {entries.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Nenhum lançamento ainda. Use Recebi ou Dei/paguei acima.</p>}
                </div>
                <div className="border-t pt-3 space-y-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold">Gerenciar</p>
                  <div className="flex gap-2">
                    <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="app-input h-10 text-xs flex-1 min-w-0">
                      <option value="">Transferir tudo para…</option>
                      {pessoasList.filter((p) => p !== c).map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button onClick={() => { if (transferTo && confirm(`Mover TODOS os lançamentos de "${c}" para "${transferTo}"?`)) transferPessoaMut.mutate({ from: c, to: transferTo }); }} disabled={!transferTo || transferPessoaMut.isPending} className="h-10 px-3 rounded-lg border text-xs font-bold hover:bg-muted disabled:opacity-40 shrink-0">Transferir</button>
                  </div>
                  <button onClick={() => arquivarPessoaMut.mutate({ nome: c, arquivar: !arquivadasSet.has(c) })} disabled={arquivarPessoaMut.isPending} className="w-full h-10 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-muted disabled:opacity-40">
                    {arquivadasSet.has(c) ? <><ArchiveRestore className="size-3.5" />Desarquivar conta</> : <><Archive className="size-3.5" />Arquivar conta</>}
                  </button>
                  <button onClick={() => { if (confirm(`APAGAR "${c}" e todos os lançamentos dela? Isso não dá pra desfazer.`)) delPessoaMut.mutate(c); }} disabled={delPessoaMut.isPending} className="w-full h-10 rounded-lg border border-destructive/40 text-destructive text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-destructive/10 disabled:opacity-40"><Trash2 className="size-3.5" />Apagar pessoa</button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Novo / editar lançamento */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo lançamento"}{pessoaForm ? ` · ${pessoaForm}` : ""}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }} className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] uppercase text-muted-foreground font-bold">Pessoa</label>
              <div className="flex gap-2">
                <select value={pessoaForm} onChange={(e) => setPessoaForm(e.target.value)} className="app-input h-11 text-sm flex-1 min-w-0">
                  <option value="">— escolha —</option>
                  {pessoasList.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button type="button" onClick={() => { const nome = window.prompt("Nome da pessoa:")?.trim(); if (nome) { addPessoaMut.mutate(nome); setPessoaForm(nome); } }} className="h-11 px-3 rounded-xl border text-sm font-bold text-primary hover:bg-primary/5 shrink-0 flex items-center gap-1"><Plus className="size-4" />Nova</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTipo("receita")} className={`h-16 rounded-xl font-bold text-sm flex flex-col items-center justify-center leading-tight transition ${tipo === "receita" ? "bg-emerald-600 text-white shadow-sm" : "bg-muted text-muted-foreground"}`}>💰 Recebi<span className="text-[10px] font-medium opacity-80 mt-0.5">entrou dinheiro pra você</span></button>
              <button type="button" onClick={() => setTipo("despesa")} className={`h-16 rounded-xl font-bold text-sm flex flex-col items-center justify-center leading-tight transition ${tipo === "despesa" ? "bg-rose-500 text-white shadow-sm" : "bg-muted text-muted-foreground"}`}>💸 Dei / paguei<span className="text-[10px] font-medium opacity-80 mt-0.5">saiu dinheiro de você</span></button>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase text-muted-foreground font-bold">Valor</label>
              <input value={val} onChange={(e) => setVal(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="R$ 0,00" className="app-input h-12 text-lg font-bold w-full" inputMode="decimal" autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase text-muted-foreground font-bold">O que foi</label>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex: emprestei / me pagou / comprou" className="app-input h-11 text-sm w-full" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase text-muted-foreground font-bold">Forma</label>
              <div className="grid grid-cols-3 gap-2">
                {[{ v: "Pix", ic: "📱" }, { v: "Dinheiro", ic: "💵" }, { v: "Outro", ic: "🔁" }].map((f) => (
                  <button key={f.v} type="button" onClick={() => setForma(forma === f.v ? "" : f.v)} className={`h-10 rounded-xl text-xs font-bold border transition ${forma === f.v ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-transparent"}`}>{f.ic} {f.v}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase text-muted-foreground font-bold">Data</label>
              <input type="date" value={dt} onChange={(e) => setDt(e.target.value)} className="app-input h-11 text-sm w-full" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase text-muted-foreground font-bold">Comprovante (opcional)</label>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setAnexoFile(e.target.files?.[0] ?? null)} className="block w-full text-xs file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:bg-muted file:text-foreground file:font-semibold file:text-xs" />
              {anexoFile ? (
                <p className="text-[11px] text-emerald-600 font-medium truncate">📎 {anexoFile.name}</p>
              ) : anexoAtual ? (
                <div className="flex items-center gap-2 text-[11px]">
                  <button type="button" onClick={() => abrirComprovante(anexoAtual)} className="text-primary font-semibold hover:underline">📎 Ver comprovante atual</button>
                  <span className="text-muted-foreground">· escolha um arquivo pra substituir</span>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1"><button type="button" onClick={reset} className="h-11 rounded-xl border text-sm font-semibold hover:bg-muted">Cancelar</button><button type="submit" disabled={saveMut.isPending} className="h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50">{saveMut.isPending ? "Salvando..." : "Salvar"}</button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TODOS = "__todos__";
const INTERNO = "__interno__";

type Socio = { id: string; nome: string };
type Viveiro = { id: string; nome: string; data_povoamento: string | null };
type Lanc = {
  id: string;
  viveiro_id: string | null;
  data_lancamento: string;
  descricao: string;
  categoria: string | null;
  valor: number;
  tipo: string;
  quantidade: number | null;
  unidade: string | null;
  socio_id: string | null;
  observacao: string | null;
};
type Conta = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  pago: boolean;
  categoria: string | null;
  observacao: string | null;
  socio_id: string | null;
  viveiro_id: string | null;
  recorrencia: "none" | "diaria" | "semanal" | "mensal" | "anual";
  tipo_operacao: "pagar" | "receber";
};

export type PartialPayment = {
  id: string;
  data: string; // YYYY-MM-DD
  valor: number;
  caixa_id?: string | null;
  observacao?: string | null;
};

const PAGAMENTOS_TAG = "__PAGAMENTOS_JSON__:";

export function parseContaObservacao(rawObs: string | null): {
  userObs: string;
  pagamentos: PartialPayment[];
} {
  if (!rawObs) return { userObs: "", pagamentos: [] };
  const idx = rawObs.indexOf(PAGAMENTOS_TAG);
  if (idx === -1) {
    return { userObs: rawObs, pagamentos: [] };
  }
  const userObs = rawObs.slice(0, idx).trim();
  const jsonStr = rawObs.slice(idx + PAGAMENTOS_TAG.length).trim();
  try {
    const pagamentos = JSON.parse(jsonStr);
    if (Array.isArray(pagamentos)) {
      return { userObs, pagamentos };
    }
  } catch {
    /* ignore error */
  }
  return { userObs, pagamentos: [] };
}

export function serializeContaObservacao(
  userObs: string | null | undefined,
  pagamentos: PartialPayment[]
): string | null {
  const cleanObs = (userObs ?? "").trim();
  if (!pagamentos || pagamentos.length === 0) {
    return cleanObs || null;
  }
  const jsonStr = JSON.stringify(pagamentos);
  if (cleanObs) {
    return `${cleanObs}\n${PAGAMENTOS_TAG}${jsonStr}`;
  }
  return `${PAGAMENTOS_TAG}${jsonStr}`;
}

export function getContaFinancialInfo(c: Conta) {
  const { userObs, pagamentos } = parseContaObservacao(c.observacao);
  const total = Number(c.valor ?? 0);

  let valorPago = 0;
  let paymentList = pagamentos;

  if (pagamentos.length > 0) {
    valorPago = pagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
  } else if (c.pago) {
    valorPago = total;
    paymentList = [
      {
        id: "legacy",
        data: c.data_pagamento || c.data_vencimento,
        valor: total,
        observacao: "Quitação total",
      },
    ];
  }

  const valorRestante = Math.max(0, total - valorPago);
  const isPago = c.pago || (total > 0 && valorPago >= total - 0.001);
  const isParcial = !isPago && valorPago > 0;
  const percentualPago = total > 0 ? Math.min(100, Math.round((valorPago / total) * 100)) : 0;

  return {
    userObs,
    pagamentos: paymentList,
    total,
    valorPago,
    valorRestante,
    isPago,
    isParcial,
    percentualPago,
  };
}

const RECORRENCIA_LABEL: Record<Conta["recorrencia"], string> = {
  none: "Sem recorrência",
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
  anual: "Anual",
};

function brl(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  if (y && m && day) return `${day}/${m}/${y}`;
  return new Date(d).toLocaleDateString("pt-BR");
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function diasDeCultivo(data: string) {
  const [y, m, d] = data.split("-").map(Number);
  const inicio = new Date(Date.UTC(y, m - 1, d));
  const hoje = new Date();
  const local = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  const diff = Math.floor((local.getTime() - inicio.getTime()) / 86400000) + 1;
  return Math.max(1, diff);
}
function proximaData(atual: string, rec: Conta["recorrencia"]): string | null {
  if (rec === "none") return null;
  const [y, m, d] = atual.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (rec === "diaria") dt.setUTCDate(dt.getUTCDate() + 1);
  else if (rec === "semanal") dt.setUTCDate(dt.getUTCDate() + 7);
  else if (rec === "mensal") dt.setUTCMonth(dt.getUTCMonth() + 1);
  else if (rec === "anual") dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  return dt.toISOString().slice(0, 10);
}

async function buildPdfBlob(rows: Lanc[], socioMap: Map<string, string>, viveiroMap: Map<string, string>, totais: { contasPagar: number }) {
  const [pdfModule, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const jsPDF = pdfModule.default;
  const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.text("Financeiro", 14, 16);
  doc.setFontSize(10);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
  doc.text(`Contas a pagar: ${brl(totais.contasPagar)}`, 14, 28);
  autoTable(doc, {
    startY: 34,
    head: [["Data", "Descrição", "Sócio", "Viveiro", "Qtd", "Valor"]],
    body: rows.map((r) => [
      fmtDate(r.data_lancamento),
      r.descricao,
      r.socio_id ? (socioMap.get(r.socio_id) ?? "—") : "—",
      r.viveiro_id ? (viveiroMap.get(r.viveiro_id) ?? "—") : (r.categoria === "interno" ? "Gasto interno" : r.tipo === "conta_pagar" ? "—" : "Rateado"),
      r.quantidade != null ? `${r.quantidade} ${r.unidade ?? ""}` : "—",
      `${r.tipo === "receita" ? "+" : "-"} ${brl(Number(r.valor))}`,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  return {
    blob: doc.output("blob") as Blob,
    filename: `caixa-simples-${new Date().toISOString().slice(0, 10)}.pdf`,
  };
}

async function buildContaPdf(conta: Conta, info: ReturnType<typeof getContaFinancialInfo>, socioMap: Map<string, string>, viveiroMap: Map<string, string>) {
  const [pdfModule, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const jsPDF = pdfModule.default;
  const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`Conta: ${conta.descricao}`, 14, 20);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 14, 27);

  doc.setTextColor(0);
  doc.setFontSize(10);
  let y = 36;
  const isReceber = conta.tipo_operacao === "receber";
  const status = info.isPago ? "QUITADA" : info.isParcial ? `PARCIAL (${info.percentualPago}%)` : "PENDENTE";
  doc.setFont("helvetica", "bold");
  doc.text(`${isReceber ? "Conta a receber" : "Conta a pagar"} — ${status}`, 14, y); y += 7;
  doc.setFont("helvetica", "normal");
  doc.text(`Débito (total): ${brl(info.total)}`, 14, y); y += 6;
  doc.text(`Crédito (pago): ${brl(info.valorPago)}`, 14, y); y += 6;
  doc.setFont("helvetica", "bold");
  doc.text(`Saldo${isReceber ? " a receber" : " devedor"}: ${brl(info.valorRestante)}`, 14, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Vencimento: ${fmtDate(conta.data_vencimento)}`, 14, y); y += 6;
  if (conta.viveiro_id && viveiroMap.get(conta.viveiro_id)) {
    doc.text(`Viveiro: ${viveiroMap.get(conta.viveiro_id)}`, 14, y); y += 6;
  }
  if (conta.socio_id && socioMap.get(conta.socio_id)) {
    doc.text(`Sócio: ${socioMap.get(conta.socio_id)}`, 14, y); y += 6;
  }
  y += 4;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Extrato · Débito · Crédito · Saldo", 14, y);
  doc.setFont("helvetica", "normal");
  y += 2;

  // Linha 1 = o débito (valor da conta). Depois cada pagamento (crédito) com o saldo correndo até zero.
  const pagsOrd = [...info.pagamentos].sort((a, b) => (a.data < b.data ? -1 : 1));
  let saldoRun = info.total;
  const rows: string[][] = [[fmtDate(conta.data_vencimento), isReceber ? "Valor a receber" : "Valor da conta", brl(info.total), "—", brl(saldoRun)]];
  for (const p of pagsOrd) {
    saldoRun = Math.max(0, saldoRun - Number(p.valor));
    rows.push([fmtDate(p.data), (p.observacao && p.observacao.trim()) || (isReceber ? "Recebimento" : "Pagamento"), "—", brl(Number(p.valor)), brl(saldoRun)]);
  }
  autoTable(doc, {
    startY: y + 4,
    head: [["Data", "Histórico", "Débito", "Crédito", "Saldo"]],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
  });

  const blob = doc.output("blob") as Blob;
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  toast.success("PDF da conta gerado!");
}

async function buildFuncionarioPdf(
  f: { id: string; nome: string; salario: number | null },
  meusVales: Array<{ id: string; valor: number; data_vale: string; motivo: string | null }>,
  totalPago: number,
  saldoRestante: number
) {
  const [pdfModule, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const jsPDF = pdfModule.default;
  const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`Funcionário: ${f.nome}`, 14, 20);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 14, 27);

  doc.setTextColor(0);
  doc.setFontSize(10);
  let y = 36;
  const salario = Number(f.salario ?? 0);
  doc.text(`Salário base: ${brl(salario)}`, 14, y); y += 6;
  doc.text(`Já pago este mês: ${brl(totalPago)}`, 14, y); y += 6;
  doc.text(`Saldo a pagar: ${brl(saldoRestante)}`, 14, y); y += 6;
  y += 4;

  if (meusVales.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Histórico de Vales e Pagamentos", 14, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [["Data", "Valor", "Motivo"]],
      body: meusVales.map((v) => [
        fmtDate(v.data_vale),
        brl(Number(v.valor)),
        v.motivo || "Vale",
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  } else {
    doc.text("Nenhum vale ou pagamento registrado.", 14, y);
  }

  const blob = doc.output("blob") as Blob;
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  toast.success("PDF do funcionário gerado!");
}

function CaixaSimplesSections({ tab }: { tab: "contas" | "funcionarios" }) {
  const qc = useQueryClient();
  const [modo, setModo] = useState<"vale" | "conta_pagar" | "conta_receber">("vale");
  const [funcionarioId, setFuncionarioId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [qtd, setQtd] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [data, setData] = useState(todayISO);
  const [socioId, setSocioId] = useState("");
  const [viveiroId, setViveiroId] = useState<string>(TODOS);
  const [selectedViveiros, setSelectedViveiros] = useState<Set<string>>(new Set());
  const [observacao, setObservacao] = useState("");
  const [recorrencia, setRecorrencia] = useState<Conta["recorrencia"]>("none");
  const [busy, setBusy] = useState(false);
  const [showNovoSocio, setShowNovoSocio] = useState(false);
  const [novoSocioNome, setNovoSocioNome] = useState("");
  const [showNovoFunc, setShowNovoFunc] = useState(false);
  const [novoFuncNome, setNovoFuncNome] = useState("");
  const [novoFuncSalario, setNovoFuncSalario] = useState("");
  const [novoFuncTipo, setNovoFuncTipo] = useState<"mensal" | "diaria">("mensal");
  const [novoFuncViveiroId, setNovoFuncViveiroId] = useState<string>(TODOS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedContasIds, setSelectedContasIds] = useState<Set<string>>(new Set());
  const [editingConta, setEditingConta] = useState<Conta | null>(null);

  // Partial Payment State
  const [payingParcialConta, setPayingParcialConta] = useState<Conta | null>(null);
  const [valorParcial, setValorParcial] = useState("");
  const [dataParcial, setDataParcial] = useState(todayISO);
  const [obsParcial, setObsParcial] = useState("");
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());

  function toggleExpandHistory(id: string) {
    setExpandedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openPagarParcial(c: Conta) {
    const info = getContaFinancialInfo(c);
    setPayingParcialConta(c);
    setValorParcial(info.valorRestante > 0 ? info.valorRestante.toFixed(2) : Number(c.valor).toFixed(2));
    setDataParcial(todayISO());
    setObsParcial("");
  }

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "ativos", "simples"],
    queryFn: async () => {
      const { data, error } = await supabase.from("viveiros").select("id, nome, data_povoamento").eq("status", "ativo").order("nome");
      if (error) throw error;
      return (data ?? []) as Viveiro[];
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

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["caixa-simples", "lancamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixa_lancamentos")
        .select("id, viveiro_id, data_lancamento, descricao, categoria, valor, observacao, tipo, quantidade, unidade, socio_id, lancamento_id, despesa_id")
        .is("lancamento_id", null)
        .is("despesa_id", null)
        .like("observacao", `${CS_TAG}%`)
        .order("data_lancamento", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data ?? []) as Lanc[];
    },
  });

  const { data: contas = [] } = useQuery({
    queryKey: ["contas-pagar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar")
        .select("id, descricao, valor, data_vencimento, data_pagamento, pago, categoria, observacao, socio_id, viveiro_id, recorrencia, tipo_operacao")
        .neq("tipo_operacao", "receber")
        .order("pago", { ascending: true })
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Conta[];
    },
  });

  const { data: contasReceber = [] } = useQuery({
    queryKey: ["contas-receber"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar")
        .select("id, descricao, valor, data_vencimento, data_pagamento, pago, categoria, observacao, socio_id, viveiro_id, recorrencia, tipo_operacao")
        .eq("tipo_operacao", "receber")
        .order("pago", { ascending: true })
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Conta[];
    },
  });

  const { data: vales = [] } = useQuery({
    queryKey: ["vales", "totais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vales")
        .select("id, funcionario_id, valor, data_vale, motivo")
        .order("data_vale", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as { id: string; funcionario_id: string; valor: number; data_vale: string; motivo: string | null }[];
    },
  });

  const { data: funcionarios = [] } = useQuery({
    queryKey: ["funcionarios", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("funcionarios").select("id, nome, salario, tipo_remuneracao, viveiro_id, data_inicio").eq("ativo", true);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; salario: number | null; tipo_remuneracao: "mensal" | "diaria" | null; viveiro_id: string | null; data_inicio: string | null }[];
    },
  });

  const funcionarioMap = useMemo(() => new Map(funcionarios.map((f) => [f.id, f.nome])), [funcionarios]);

  // Funcionario Partial Payment State
  const [payingFuncionario, setPayingFuncionario] = useState<{ id: string; nome: string; salario: number | null } | null>(null);
  const [valorParcialFunc, setValorParcialFunc] = useState("");
  const [dataParcialFunc, setDataParcialFunc] = useState(todayISO);
  const [motivoParcialFunc, setMotivoParcialFunc] = useState("");
  const [expandedFuncHistoryIds, setExpandedFuncHistoryIds] = useState<Set<string>>(new Set());

  function toggleExpandFuncHistory(id: string) {
    setExpandedFuncHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openPagarParcialFunc(f: { id: string; nome: string; salario: number | null }) {
    const mesAtual = new Date().toISOString().slice(0, 7);
    const meusVales = vales.filter((v) => v.funcionario_id === f.id);
    const valesMes = meusVales.filter((v) => v.data_vale?.startsWith(mesAtual));
    const totalPago = valesMes.reduce((s, v) => s + Number(v.valor ?? 0), 0);
    const salario = Number(f.salario ?? 0);
    const saldoRestante = Math.max(0, salario - totalPago);

    setPayingFuncionario(f);
    setValorParcialFunc(saldoRestante > 0 ? saldoRestante.toFixed(2) : "");
    setDataParcialFunc(todayISO());
    setMotivoParcialFunc("Adiantamento / Pagamento de salário");
  }

  const pagarParcialFuncMut = useMutation({
    mutationFn: async ({
      funcionarioId,
      nomeFuncionario,
      valor,
      data,
      motivo,
    }: {
      funcionarioId: string;
      nomeFuncionario: string;
      valor: number;
      data: string;
      motivo?: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada.");
      if (valor <= 0) throw new Error("Informe um valor válido.");

      const mot = motivo?.trim() || "Pagamento parcial de salário";

      const { data: valeData, error: vErr } = await supabase
        .from("vales")
        .insert({
          user_id: u.user.id,
          funcionario_id: funcionarioId,
          valor,
          motivo: mot,
          data_vale: data,
        })
        .select("id")
        .single();

      if (vErr) throw vErr;

      const { error: cErr } = await supabase.from("caixa_lancamentos").insert({
        user_id: u.user.id,
        data_lancamento: data,
        descricao: `Pagamento funcionário: ${nomeFuncionario}`,
        categoria: "folha_pagamento",
        valor,
        tipo: "despesa",
        observacao: `${CS_TAG} [VALE:${valeData.id}] ${mot}`.trim(),
      });

      if (cErr) throw cErr;
    },
    onSuccess: () => {
      toast.success("Pagamento de funcionário registrado no caixa com sucesso!");
      setPayingFuncionario(null);
      setValorParcialFunc("");
      setMotivoParcialFunc("");
      qc.invalidateQueries({ queryKey: ["vales"] });
      qc.invalidateQueries({ queryKey: ["caixa-simples", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeValeMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("caixa_lancamentos").delete().like("observacao", `%[VALE:${id}]%`);
      const { error } = await supabase.from("vales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vale/Pagamento removido");
      qc.invalidateQueries({ queryKey: ["vales"] });
      qc.invalidateQueries({ queryKey: ["caixa-simples", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFuncMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("funcionarios").update({ ativo: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Funcionário removido");
      qc.invalidateQueries({ queryKey: ["funcionarios"] });
      qc.invalidateQueries({ queryKey: ["funcionarios", "ativos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editingFunc, setEditingFunc] = useState<{ id: string; nome: string; salario: number | null; tipo_remuneracao: "mensal" | "diaria" | null; viveiro_id: string | null } | null>(null);
  const [aumentarConta, setAumentarConta] = useState<Conta | null>(null);
  const [aumentarValor, setAumentarValor] = useState("");
  const [editFuncNome, setEditFuncNome] = useState("");
  const [editFuncSalario, setEditFuncSalario] = useState("");
  const [editFuncTipo, setEditFuncTipo] = useState<"mensal" | "diaria">("mensal");
  const [editFuncViveiroId, setEditFuncViveiroId] = useState<string>(TODOS);

  const updateFuncMut = useMutation({
    mutationFn: async () => {
      if (!editingFunc) return;
      const s = Number(editFuncSalario.replace(",", "."));
      if (!editFuncNome.trim() || isNaN(s) || s <= 0) throw new Error("Preencha nome e salário");
      const vid = editFuncViveiroId === TODOS ? null : (editFuncViveiroId === INTERNO ? null : editFuncViveiroId);
      const { error } = await supabase.from("funcionarios").update({
        nome: editFuncNome.trim(), salario: s,
        tipo_remuneracao: editFuncTipo, viveiro_id: vid || null,
      }).eq("id", editingFunc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Funcionário atualizado!");
      setEditingFunc(null);
      qc.invalidateQueries({ queryKey: ["funcionarios"] });
      qc.invalidateQueries({ queryKey: ["funcionarios", "ativos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aumentarContaMut = useMutation({
    mutationFn: async ({ conta, adicional }: { conta: Conta; adicional: number }) => {
      const { data: atual } = await supabase.from("contas_pagar").select("valor").eq("id", conta.id).single();
      const valorAtual = Number(atual?.valor ?? conta.valor);
      const novoValor = valorAtual + adicional;
      const { error } = await supabase.from("contas_pagar").update({ valor: novoValor }).eq("id", conta.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Valor da conta aumentado!");
      setAumentarConta(null); setAumentarValor("");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["contas-receber"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [aumentarSalario, setAumentarSalario] = useState<{ id: string; nome: string; salario: number } | null>(null);
  const [aumentarSalarioValor, setAumentarSalarioValor] = useState("");

  const aumentarSalarioMut = useMutation({
    mutationFn: async ({ id, adicional }: { id: string; adicional: number }) => {
      const { data: atual } = await supabase.from("funcionarios").select("salario").eq("id", id).single();
      const novo = Number(atual?.salario ?? 0) + adicional;
      const { error } = await supabase.from("funcionarios").update({ salario: novo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Salário aumentado!"); setAumentarSalario(null); setAumentarSalarioValor(""); qc.invalidateQueries({ queryKey: ["funcionarios"] }); qc.invalidateQueries({ queryKey: ["funcionarios", "ativos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const valesPorFuncionario = useMemo(() => {
    const groups = new Map<string, { nome: string; total: number; itens: typeof vales }>();
    for (const v of vales) {
      const nome = funcionarioMap.get(v.funcionario_id) ?? "Funcionário removido";
      const g = groups.get(v.funcionario_id) ?? { nome, total: 0, itens: [] };
      g.total += Number(v.valor ?? 0);
      g.itens.push(v);
      groups.set(v.funcionario_id, g);
    }
    return Array.from(groups.entries()).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  }, [vales, funcionarioMap]);

  const socioMap = useMemo(() => new Map(socios.map((s) => [s.id, s.nome])), [socios]);
  const viveiroMap = useMemo(() => new Map(viveiros.map((v) => [v.id, v.nome])), [viveiros]);

  const addSocioMut = useMutation({
    mutationFn: async (nome: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada.");
      const { data, error } = await supabase.from("socios").insert({ user_id: u.user.id, nome: nome.trim() }).select("id, nome").single();
      if (error) throw error;
      return data as Socio;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["socios"] });
      setSocioId(s.id);
      setNovoSocioNome("");
      setShowNovoSocio(false);
      toast.success(`Sócio "${s.nome}" adicionado`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addFuncMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada.");
      if (!novoFuncNome.trim()) throw new Error("Informe o nome.");
      const salarioNum = Number(novoFuncSalario.replace(",", "."));
      if (isNaN(salarioNum) || salarioNum <= 0) throw new Error("Informe o salário.");
      const vid = novoFuncViveiroId === TODOS ? null : (novoFuncViveiroId === INTERNO ? null : novoFuncViveiroId);
      const { data, error } = await supabase.from("funcionarios").insert({
        user_id: u.user.id,
        nome: novoFuncNome.trim(),
        salario: salarioNum,
        tipo_remuneracao: novoFuncTipo,
        viveiro_id: vid || null,
        ativo: true,
      }).select("id, nome").single();
      if (error) throw error;
      return data as { id: string; nome: string };
    },
    onSuccess: (f) => {
      qc.invalidateQueries({ queryKey: ["funcionarios"] });
      qc.invalidateQueries({ queryKey: ["funcionarios", "ativos"] });
      setFuncionarioId(f.id);
      setShowNovoFunc(false);
      setNovoFuncNome("");
      setNovoFuncSalario("");
      setNovoFuncTipo("mensal");
      setNovoFuncViveiroId(TODOS);
      toast.success(`Funcionário "${f.nome}" criado!`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada.");
      const v = Number(valor.replace(",", ".")) || 0;
      if (v <= 0) throw new Error("Informe o valor.");

      if (modo === "vale") {
        if (!funcionarioId) throw new Error("Selecione o funcionário.");
        const motivo = descricao.trim() || "Vale";
        const { error } = await supabase.from("vales").insert({
          user_id: u.user.id,
          funcionario_id: funcionarioId,
          valor: v,
          motivo,
          data_vale: data,
        });
        if (error) throw error;
        return;
      }

      if (!descricao.trim()) throw new Error("Informe a descrição.");

      if (modo === "conta_pagar" || modo === "conta_receber") {
        const isReceber = modo === "conta_receber";
        const isMulti = selectedViveiros.size > 0;
        const targets = isMulti ? Array.from(selectedViveiros) : [viveiroId === TODOS || viveiroId === INTERNO ? null : viveiroId];
        for (const targetId of targets) {
          const { error } = await supabase.from("contas_pagar").insert({
            user_id: u.user.id, descricao: descricao.trim(), valor: isMulti ? v / targets.length : v,
            data_vencimento: data, categoria: viveiroId === INTERNO ? "interno" : "geral",
            observacao: observacao.trim() || null, socio_id: socioId || null,
            viveiro_id: targetId, recorrencia,
            tipo_operacao: isReceber ? "receber" : "pagar",
          });
          if (error) throw error;
        }
        return;
      }

      const qNum = Number(qtd.replace(",", ".")) || 0;
      const isMulti = selectedViveiros.size > 0;
      const targets = isMulti ? Array.from(selectedViveiros) : [(viveiroId === TODOS || viveiroId === INTERNO) ? null : viveiroId];
      for (const targetId of targets) {
        const { error } = await supabase.from("caixa_lancamentos").insert({
          user_id: u.user.id,
          viveiro_id: targetId, data_lancamento: data, descricao: descricao.trim(),
          categoria: viveiroId === INTERNO ? "interno" : "geral",
          valor: isMulti ? v / targets.length : v, tipo: "despesa",
          quantidade: qNum > 0 ? (isMulti ? qNum / targets.length : qNum) : null,
          unidade: qNum > 0 ? unidade : null, socio_id: socioId || null,
          observacao: `${CS_TAG} ${observacao.trim()}`.trim(),
        });
        if (error) throw error;
      }

      // Auto-contabilizar no estoque se a descrição bater com algum produto cadastrado
      if (modo !== "vale" && modo !== "conta_pagar") {
        const { data: prods } = await supabase.from("produtos").select("id, nome, unidade, preco_unidade").order("nome");
        if (prods && prods.length > 0) {
          const descLower = descricao.toLowerCase().trim();
          const match = prods.find((p) =>
            descLower.includes(p.nome.toLowerCase().trim()) || p.nome.toLowerCase().trim().includes(descLower)
          );
          if (match) {
            const matchQtd = descricao.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|un|saco|sc|g|ml|l|litro)?/i);
            let qtdNum = matchQtd ? Number(matchQtd[1].replace(",", ".")) : 0;
            if (qtdNum <= 0 && match.preco_unidade && match.preco_unidade > 0) {
              qtdNum = v / match.preco_unidade;
            }
            if (qtdNum <= 0) qtdNum = 1;

            await supabase.from("estoque_entradas").insert({
              user_id: u.user.id,
              produto_id: match.id,
              quantidade: qtdNum,
              unidade: match.unidade ?? "kg",
              preco_unidade: match.preco_unidade ?? null,
              custo_total: v,
              fornecedor: "Compra via Financeiro",
              data_entrada: data,
              observacao: `Automático via caixa simples: ${descricao}`,
            });
          }
        }
      }
    },
    onSuccess: () => {
      toast.success(
        modo === "vale" ? "Vale registrado" :
        modo === "conta_pagar" ? "Conta a pagar registrada" :
        modo === "conta_receber" ? "Conta a receber registrada" :
        "Despesa registrada"
      );
      setDescricao(""); setValor(""); setQtd(""); setObservacao(""); setRecorrencia("none");
      qc.invalidateQueries({ queryKey: ["caixa-simples", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["vales"] });
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["contas-receber"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("caixa_lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      setSelectedIds((prev) => new Set(prev));
      qc.invalidateQueries({ queryKey: ["caixa-simples", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pagarParcialMut = useMutation({
    mutationFn: async ({
      conta,
      valorPagamento,
      dataPagamento,
      obsPagamento,
    }: {
      conta: Conta;
      valorPagamento: number;
      dataPagamento: string;
      obsPagamento?: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada.");

      const info = getContaFinancialInfo(conta);
      if (valorPagamento <= 0) throw new Error("Informe um valor válido.");
      if (valorPagamento > info.valorRestante + 0.01) {
        throw new Error(`O valor excede o saldo restante de ${brl(info.valorRestante)}`);
      }

      const isReceber = conta.tipo_operacao === "receber";
      const isTotal = Math.abs(valorPagamento - info.valorRestante) < 0.01 || info.valorRestante === 0;
      const descLancamento = isReceber
        ? (isTotal ? `Recebimento total: ${conta.descricao}` : `Recebimento parcial: ${conta.descricao}`)
        : (isTotal ? `Quitação de conta: ${conta.descricao}` : `Pagamento parcial: ${conta.descricao}`);

      const { data: lanc, error: lErr } = await supabase
        .from("caixa_lancamentos")
        .insert({
          user_id: u.user.id,
          viveiro_id: conta.viveiro_id,
          data_lancamento: dataPagamento,
          descricao: descLancamento,
          categoria: conta.categoria ?? "geral",
          valor: valorPagamento,
          tipo: isReceber ? "receita" : "despesa",
          socio_id: conta.socio_id,
          observacao: `${CS_TAG} [CONTA:${conta.id}] ${descLancamento}`.trim(),
        })
        .select("id")
        .single();

      if (lErr) throw lErr;

      const newPayment: PartialPayment = {
        id: crypto.randomUUID(),
        data: dataPagamento,
        valor: valorPagamento,
        caixa_id: lanc?.id ?? null,
        observacao: obsPagamento?.trim() || null,
      };

      const existingPayments = info.pagamentos.filter((p) => p.id !== "legacy");
      const newPagamentos = [...existingPayments, newPayment];
      const totalPago = newPagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
      const isNowFullyPaid = totalPago >= Number(conta.valor) - 0.001;

      const newObs = serializeContaObservacao(info.userObs, newPagamentos);

      const { error: uErr } = await supabase
        .from("contas_pagar")
        .update({
          pago: isNowFullyPaid,
          data_pagamento: dataPagamento,
          observacao: newObs,
          caixa_lancamento_id: lanc?.id ?? conta.caixa_lancamento_id,
        })
        .eq("id", conta.id);

      if (uErr) throw uErr;

      if (isNowFullyPaid && conta.recorrencia !== "none") {
        const prox = proximaData(conta.data_vencimento, conta.recorrencia);
        if (prox) {
          const { error: nErr } = await supabase.from("contas_pagar").insert({
            user_id: u.user.id,
            descricao: conta.descricao,
            valor: conta.valor,
            data_vencimento: prox,
            categoria: conta.categoria,
            observacao: info.userObs || null,
            socio_id: conta.socio_id,
            viveiro_id: conta.viveiro_id,
            recorrencia: conta.recorrencia,
            parent_id: conta.id,
            tipo_operacao: conta.tipo_operacao,
          });
          if (nErr) throw nErr;
        }
      }
    },
    onSuccess: () => {
      toast.success("Pagamento registrado com sucesso!");
      setPayingParcialConta(null);
      setValorParcial("");
      setObsParcial("");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["contas-receber"] });
      qc.invalidateQueries({ queryKey: ["caixa-simples", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removerPagamentoParcialMut = useMutation({
    mutationFn: async ({ conta, paymentId }: { conta: Conta; paymentId: string }) => {
      const info = getContaFinancialInfo(conta);
      const targetPayment = info.pagamentos.find((p) => p.id === paymentId);

      if (targetPayment?.caixa_id) {
        await supabase.from("caixa_lancamentos").delete().eq("id", targetPayment.caixa_id);
      }

      const newPagamentos = info.pagamentos.filter((p) => p.id !== paymentId && p.id !== "legacy");
      const totalPago = newPagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
      const isFullyPaid = totalPago >= Number(conta.valor) - 0.001;

      const newObs = serializeContaObservacao(info.userObs, newPagamentos);

      const { error } = await supabase
        .from("contas_pagar")
        .update({
          pago: isFullyPaid,
          observacao: newObs,
        })
        .eq("id", conta.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento parcial removido");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["contas-receber"] });
      qc.invalidateQueries({ queryKey: ["caixa-simples", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reverterDividaMut = useMutation({
    mutationFn: async (conta: Conta) => {
      const info = getContaFinancialInfo(conta);
      const caixaIds = info.pagamentos.map((p) => p.caixa_id).filter(Boolean) as string[];
      if (conta.caixa_lancamento_id) {
        caixaIds.push(conta.caixa_lancamento_id);
      }
      if (caixaIds.length > 0) {
        await supabase.from("caixa_lancamentos").delete().in("id", caixaIds);
      }

      const { error } = await supabase
        .from("contas_pagar")
        .update({
          pago: false,
          data_pagamento: null,
          caixa_lancamento_id: null,
          observacao: info.userObs || null,
        })
        .eq("id", conta.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dívida revertida para Em Aberto! Lançamentos removidos do caixa e viveiros.");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["contas-receber"] });
      qc.invalidateQueries({ queryKey: ["caixa-simples", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pagarContaMut = useMutation({
    mutationFn: async (conta: Conta) => {
      const info = getContaFinancialInfo(conta);
      const valorRestante = info.valorRestante > 0 ? info.valorRestante : Number(conta.valor);
      const hoje = todayISO();
      await pagarParcialMut.mutateAsync({
        conta,
        valorPagamento: valorRestante,
        dataPagamento: hoje,
        obsPagamento: "Quitação total",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeContaMut = useMutation({
    mutationFn: async (conta: Conta) => {
      const info = getContaFinancialInfo(conta);
      const caixaIds = info.pagamentos.map((p) => p.caixa_id).filter(Boolean) as string[];
      if (conta.caixa_lancamento_id) {
        caixaIds.push(conta.caixa_lancamento_id);
      }
      if (caixaIds.length > 0) {
        await supabase.from("caixa_lancamentos").delete().in("id", caixaIds);
      }
      const { error } = await supabase.from("contas_pagar").delete().eq("id", conta.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta e seus lançamentos removidos");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["contas-receber"] });
      qc.invalidateQueries({ queryKey: ["caixa-simples", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateContaMut = useMutation({
    mutationFn: async (c: Conta) => {
      const info = getContaFinancialInfo(c);
      const updatedObs = serializeContaObservacao(c.observacao, info.pagamentos);
      const isFullyPaid = info.valorPago >= Number(c.valor) - 0.001;

      const { error } = await supabase
        .from("contas_pagar")
        .update({
          descricao: c.descricao,
          valor: c.valor,
          data_vencimento: c.data_vencimento,
          categoria: c.categoria,
          observacao: updatedObs,
          socio_id: c.socio_id,
          viveiro_id: c.viveiro_id,
          recorrencia: c.recorrencia,
          pago: isFullyPaid,
        })
        .eq("id", c.id);
      if (error) throw error;

      // Sincronizar todos os lançamentos do caixa/viveiros associados a esta conta
      const caixaIds = info.pagamentos.map((p) => p.caixa_id).filter(Boolean) as string[];
      if (c.caixa_lancamento_id) {
        caixaIds.push(c.caixa_lancamento_id);
      }

      const newCategory = c.categoria ?? (c.viveiro_id ? "geral" : "geral");
      const newViveiroId = c.categoria === "interno" ? null : c.viveiro_id;

      if (caixaIds.length > 0) {
        await supabase
          .from("caixa_lancamentos")
          .update({
            categoria: newCategory,
            viveiro_id: newViveiroId,
            socio_id: c.socio_id ?? null,
          })
          .in("id", caixaIds);
      }

      // Atualizar também por tag [CONTA:<id>] na observação
      await supabase
        .from("caixa_lancamentos")
        .update({
          categoria: newCategory,
          viveiro_id: newViveiroId,
          socio_id: c.socio_id ?? null,
        })
        .ilike("observacao", `%[CONTA:${c.id}]%`);
    },
    onSuccess: () => {
      toast.success("Conta atualizada e rateio dos viveiros recalculado!");
      setEditingConta(null);
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["contas-receber"] });
      qc.invalidateQueries({ queryKey: ["caixa-simples", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const totais = useMemo(() => {
    const despesas = lancamentos.filter((l) => l.tipo !== "receita").reduce((s, l) => s + Number(l.valor ?? 0), 0);
    const receitas = lancamentos.filter((l) => l.tipo === "receita").reduce((s, l) => s + Number(l.valor ?? 0), 0);
    let contasPendentes = 0;
    let contasPagas = 0;
    for (const c of contas) {
      const info = getContaFinancialInfo(c);
      contasPagas += info.valorPago;
      if (!info.isPago) {
        contasPendentes += info.valorRestante;
      }
    }
    const totalVales = vales.reduce((s, v) => s + Number(v.valor ?? 0), 0);
    const mesAtual = new Date().toISOString().slice(0, 7);
    const valesMes = vales.filter((v) => v.data_vale?.startsWith(mesAtual)).reduce((s, v) => s + Number(v.valor ?? 0), 0);
    const salarios = funcionarios.reduce((s, f) => s + Number(f.salario ?? 0), 0);
    return { despesas, receitas, contasPendentes, contasPagas, vales: totalVales, valesMes, salarios };
  }, [lancamentos, contas, vales, funcionarios]);

  const exportRows = useMemo(() => {
    const hasSelection = selectedIds.size > 0 || selectedContasIds.size > 0;
    const lancsSel = hasSelection
      ? lancamentos.filter((l) => selectedIds.has(l.id))
      : lancamentos;
    const base = lancsSel.map((l) => ({ ...l, observacao: stripTag(l.observacao) || null }));
    const contasSel = hasSelection
      ? contas.filter((c) => selectedContasIds.has(c.id))
      : [];
    const contasAsRows: Lanc[] = contasSel.map((c) => ({
      id: `conta-${c.id}`,
      viveiro_id: c.viveiro_id,
      data_lancamento: c.pago && c.data_pagamento ? c.data_pagamento : c.data_vencimento,
      descricao: (c.pago ? "✓ " : "⏳ ") + c.descricao,
      categoria: c.categoria,
      valor: Number(c.valor),
      tipo: "conta_pagar",
      quantidade: null,
      unidade: null,
      socio_id: c.socio_id,
      observacao: c.pago ? "Conta paga" : `Conta a pagar · vence ${fmtDate(c.data_vencimento)}`,
    }));
    return [...base, ...contasAsRows];
  }, [lancamentos, selectedIds, contas, selectedContasIds]);

  const exportTotais = useMemo(() => {
    return { contasPagar: totais.contasPendentes };
  }, [totais]);

  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleAll = () => setSelectedIds((prev) => prev.size === lancamentos.length ? new Set() : new Set(lancamentos.map((l) => l.id)));
  const toggleSelectConta = (id: string) => setSelectedContasIds((prev) => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleAllContas = () => setSelectedContasIds((prev) => prev.size === contas.length ? new Set() : new Set(contas.map((c) => c.id)));

  async function gerarPdfLink(): Promise<string | null> {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Sessão expirada."); return null; }
    const { blob, filename } = await buildPdfBlob(exportRows, socioMap, viveiroMap, exportTotais);
    const path = `${u.user.id}/caixa-simples/${Date.now()}-${filename}`;
    const { error: upErr } = await supabase.storage.from("relatorios-pdf").upload(path, blob, { contentType: "application/pdf", upsert: true });
    if (upErr) { toast.error(upErr.message); return null; }
    const { data: signed, error: sErr } = await supabase.storage.from("relatorios-pdf").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (sErr || !signed) { toast.error(sErr?.message ?? "Falha ao gerar link."); return null; }
    const token = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    const { error: insErr } = await supabase.from("pdf_shares").insert({ token, user_id: u.user.id, signed_url: signed.signedUrl, filename });
    if (insErr) { toast.error(insErr.message); return null; }
    return `${window.location.origin}/p/${token}`;
  }

  async function copiarLink() {
    if (exportRows.length === 0) return toast.error("Sem lançamentos");
    setBusy(true);
    const tid = toast.loading("Gerando link...");
    try {
      const url = await gerarPdfLink();
      if (!url) { toast.dismiss(tid); return; }
      try { await navigator.clipboard.writeText(url); toast.success("Link copiado!", { id: tid, description: url }); }
      catch { toast.dismiss(tid); window.prompt("Copie o link:", url); }
    } finally { setBusy(false); }
  }
  async function compartilharWhats() {
    if (exportRows.length === 0) return toast.error("Sem lançamentos");
    setBusy(true);
    const tid = toast.loading("Gerando link...");
    try {
      const url = await gerarPdfLink();
      toast.dismiss(tid);
      if (!url) return;
      const texto = `Financeiro\nContas a pagar: ${brl(exportTotais.contasPagar)}\n${url}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
    } finally { setBusy(false); }
  }
  async function baixarPdf() {
    if (exportRows.length === 0) return toast.error("Sem lançamentos");
    const { blob, filename } = await buildPdfBlob(exportRows, socioMap, viveiroMap, exportTotais);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function imprimir() {
    if (exportRows.length === 0) return toast.error("Sem lançamentos");
    const { blob } = await buildPdfBlob(exportRows, socioMap, viveiroMap, exportTotais);
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) w.addEventListener("load", () => { try { w.print(); } catch { /* ignore */ } });
  }

  const dataLabel = modo === "conta_pagar" ? "Data de vencimento" : "Data";
  const contasPendentes = contas.filter((c) => !c.pago);
  const contasPagas = contas.filter((c) => c.pago).slice(0, 20);

  return (
    <div className="space-y-6">
      {tab === "contas" && (<>
      <Card>
        <CardHeader><CardTitle className="text-base">Resumo geral</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Contas a pagar (pendente)" value={brl(totais.contasPendentes)} tone="bad" />
            <Kpi label="Contas pagas" value={brl(totais.contasPagas)} tone="ok" />

          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span>Contas a pagar / Dívidas</span>
            <div className="flex items-center gap-3 text-sm font-normal">
              <span className="text-muted-foreground">Saldo a pagar: <strong className="text-red-600">{brl(totais.contasPendentes)}</strong></span>
              {contas.length > 0 && (
                <>
                  <Button size="sm" variant="ghost" onClick={toggleAllContas}>
                    {selectedContasIds.size === contas.length ? "Limpar" : "Selecionar todas"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    const sel = selectedContasIds.size > 0 ? contas.filter(c => selectedContasIds.has(c.id)) : contas;
                    const [pdfModule, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
                    const jsPDF = pdfModule.default;
                    const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
                    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                    doc.setFontSize(14); doc.setFont("helvetica", "bold");
                    doc.text("Contas a Pagar - Histórico Completo", 14, 20);
                    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
                    doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")} · ${sel.length} conta(s)`, 14, 27);
                    let y = 36;
                    for (const c of sel) {
                      const fin = getContaFinancialInfo(c);
                      if (y > 260) { doc.addPage(); y = 20; }
                      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
                      const status = fin.isPago ? "QUITADA" : fin.isParcial ? `PARCIAL (${fin.percentualPago}%)` : "PENDENTE";
                      doc.text(`${c.descricao} — ${status}`, 14, y); y += 7;
                      doc.setFontSize(9); doc.setFont("helvetica", "normal");
                      doc.text(`Total: ${brl(fin.total)} · Pago: ${brl(fin.valorPago)} · Restante: ${brl(fin.valorRestante)} · Vence: ${fmtDate(c.data_vencimento)}`, 14, y); y += 6;
                      if (fin.pagamentos.length > 0) {
                        autoTable(doc, {
                          startY: y,
                          head: [["Data", "Valor", "Observação"]],
                          body: fin.pagamentos.map(p => [fmtDate(p.data), brl(Number(p.valor)), p.observacao || "—"]),
                          styles: { fontSize: 7, cellPadding: 1.5 },
                          headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
                          alternateRowStyles: { fillColor: [248, 250, 252] },
                          margin: { left: 14 },
                        });
                        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
                      } else {
                        doc.text("Nenhum pagamento.", 14, y); y += 8;
                      }
                    }
                    const blob = doc.output("blob") as Blob;
                    window.open(URL.createObjectURL(blob), "_blank");
                    toast.success("PDF das contas gerado!");
                  }} className="text-emerald-700 border-emerald-500/40 hover:bg-emerald-50 font-bold text-xs">
                    <FileDown className="size-3.5 mr-1" /> PDF Contas
                  </Button>
                </>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contasPendentes.length === 0 && contasPagas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta a pagar. Crie em <span className="font-semibold">Pessoal → Novo → A pagar</span>.</p>
          ) : (
            <div className="space-y-4">
              {contasPendentes.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Dívidas e Contas Pendentes</h3>
                  <ul className="space-y-3">
                    {contasPendentes.map((c) => {
                      const info = getContaFinancialInfo(c);
                      const isExpanded = expandedHistoryIds.has(c.id);

                      return (
                        <li key={c.id} className="border rounded-xl p-3.5 space-y-2 bg-card/60">
                          <div className="flex items-start gap-2">
                            <Checkbox
                              checked={selectedContasIds.has(c.id)}
                              onCheckedChange={() => toggleSelectConta(c.id)}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-base truncate">{c.descricao}</span>
                                {info.isParcial ? (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                    Parcialmente Paga ({info.percentualPago}%)
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                                    Pendente
                                  </span>
                                )}
                                {c.recorrencia !== "none" && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 flex items-center gap-1">
                                    <Repeat className="size-3" /> {RECORRENCIA_LABEL[c.recorrencia]}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-4 text-sm mt-1.5 flex-wrap">
                                <div>
                                  <span className="text-xs text-muted-foreground block">Falta pagar</span>
                                  <span className="font-bold text-red-600 text-base">{brl(info.valorRestante)}</span>
                                </div>
                                {info.valorPago > 0 && (
                                  <div>
                                    <span className="text-xs text-muted-foreground block">Já pago</span>
                                    <span className="font-bold text-emerald-600 text-sm">{brl(info.valorPago)}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-xs text-muted-foreground block">Valor original</span>
                                  <span className="font-medium text-muted-foreground text-sm">{brl(info.total)}</span>
                                </div>
                              </div>

                              {info.valorPago > 0 && (
                                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden mt-2">
                                  <div
                                    className="bg-amber-500 h-full transition-all duration-300"
                                    style={{ width: `${info.percentualPago}%` }}
                                  />
                                </div>
                              )}

                              <div className="text-xs text-muted-foreground mt-2 space-x-1">
                                <span>Vence {fmtDate(c.data_vencimento)}</span>
                                {c.viveiro_id && viveiroMap.get(c.viveiro_id) && (<><span>·</span><span>{viveiroMap.get(c.viveiro_id)}</span></>)}
                                {c.categoria === "interno" && (<><span>·</span><span>Interno</span></>)}
                                {c.socio_id && socioMap.get(c.socio_id) && (<><span>·</span><span>Sócio: {socioMap.get(c.socio_id)}</span></>)}
                              </div>
                              {info.userObs && <div className="text-xs text-muted-foreground mt-1 italic">{info.userObs}</div>}
                            </div>

                            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="default"
                                disabled={pagarContaMut.isPending || pagarParcialMut.isPending}
                                onClick={() => pagarContaMut.mutate(c)}
                                title="Quitar o saldo restante"
                              >
                                <Check className="size-4 mr-1" /> Quitar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pagarParcialMut.isPending}
                                onClick={() => openPagarParcial(c)}
                                className="text-primary border-primary/30 hover:bg-primary/5"
                              >
                                <Receipt className="size-4 mr-1" /> Pagar Parte
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setAumentarConta(c); setAumentarValor(""); }}
                                className="text-amber-700 border-amber-500/40 text-[11px]">+ Aumentar</Button>
                              {info.valorPago > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={reverterDividaMut.isPending}
                                  onClick={() => {
                                    if (confirm(`Reverter os pagamentos efetuados da dívida "${c.descricao}"?\n\nOs pagamentos serão desfeitos, os lançamentos sairão do caixa/viveiros e a dívida voltará a ficar 100% em aberto.`)) {
                                      reverterDividaMut.mutate(c);
                                    }
                                  }}
                                  className="text-amber-700 border-amber-500/40 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700/50 font-bold text-xs"
                                  title="Desfazer pagamentos parciais e reverter dívida para Em Aberto"
                                >
                                  <RotateCcw className="size-3.5 mr-1" /> Reverter
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" onClick={() => buildContaPdf(c, info, socioMap, viveiroMap)} title="Gerar PDF da conta">
                                <FileDown className="size-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setEditingConta(c)} title="Editar conta">
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  if (confirm("Remover conta e seus lançamentos do caixa?")) removeContaMut.mutate(c);
                                }}
                                title="Remover conta"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Histórico de pagamentos */}
                          {info.pagamentos.length > 0 && (
                            <div className="pt-2 border-t mt-2">
                              <button
                                type="button"
                                onClick={() => toggleExpandHistory(c.id)}
                                className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
                              >
                                <History className="size-3.5" />
                                {isExpanded ? "Ocultar histórico" : `Ver histórico de pagamentos (${info.pagamentos.length})`}
                              </button>

                              {isExpanded && (
                                <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-primary/20">
                                  <div className="text-[11px] font-semibold text-muted-foreground uppercase">
                                    Histórico de pagamentos efetuados
                                  </div>
                                  {info.pagamentos.map((p, idx) => {
                                    const saldoApos = Math.max(0, info.total - info.pagamentos.slice(0, idx + 1).reduce((s, pp) => s + Number(pp.valor || 0), 0));
                                    return (
                                    <div key={p.id || idx} className="flex items-center justify-between text-xs bg-muted/40 p-2 rounded-lg">
                                      <div className="space-y-0.5">
                                        <div className="font-semibold flex items-center gap-2 flex-wrap">
                                          <span className="text-emerald-600 font-bold">✓ {brl(Number(p.valor))}</span>
                                          <span className="text-muted-foreground font-normal">em {fmtDate(p.data)}</span>
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">saldo {brl(saldoApos)}</span>
                                        </div>
                                        {p.observacao && <div className="text-muted-foreground text-[11px] italic">{p.observacao}</div>}
                                      </div>
                                      {p.id !== "legacy" && (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="size-7 text-destructive hover:bg-destructive/10"
                                          title="Estornar/Remover este pagamento parcial"
                                          onClick={() => {
                                            if (confirm(`Remover o pagamento parcial de ${brl(p.valor)} de ${fmtDate(p.data)}?`)) {
                                              removerPagamentoParcialMut.mutate({ conta: c, paymentId: p.id });
                                            }
                                          }}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  ); })}
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {contasPagas.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Contas Quitadas Recentemente</h3>
                  <ul className="space-y-2">
                    {contasPagas.map((c) => {
                      const info = getContaFinancialInfo(c);
                      const isExpanded = expandedHistoryIds.has(c.id);

                      return (
                        <li key={c.id} className="border rounded-xl p-3 bg-card/40 opacity-85 space-y-2">
                          <div className="flex items-start gap-2">
                            <Checkbox
                              checked={selectedContasIds.has(c.id)}
                              onCheckedChange={() => toggleSelectConta(c.id)}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-emerald-600">✓ {brl(Number(c.valor))}</span>
                                <span className="font-medium truncate line-through">{c.descricao}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  Quitada
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Paga em {c.data_pagamento ? fmtDate(c.data_pagamento) : "—"} · venceu {fmtDate(c.data_vencimento)}
                              </div>
                              {info.userObs && <div className="text-xs text-muted-foreground mt-1 italic">{info.userObs}</div>}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={reverterDividaMut.isPending}
                              onClick={() => {
                                if (confirm(`Reverter a dívida "${c.descricao}" para em aberto?\n\nO pagamento será cancelado, os lançamentos sairão do caixa/viveiros e a dívida voltará a ficar pendente.`)) {
                                  reverterDividaMut.mutate(c);
                                }
                              }}
                              className="text-amber-700 border-amber-500/40 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700/50 font-bold text-xs"
                              title="Reverter quitação e colocar dívida em aberto novamente"
                            >
                              <RotateCcw className="size-3.5 mr-1" /> Reverter
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => buildContaPdf(c, info, socioMap, viveiroMap)} title="Gerar PDF da conta">
                              <FileDown className="size-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setEditingConta(c)} title="Editar conta">
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("Remover registro da conta e lançamentos do caixa?")) removeContaMut.mutate(c);
                              }}
                              title="Remover conta"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>

                          {/* Histórico de pagamentos */}
                          {info.pagamentos.length > 0 && (
                            <div className="pt-1.5 border-t">
                              <button
                                type="button"
                                onClick={() => toggleExpandHistory(c.id)}
                                className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
                              >
                                <History className="size-3.5" />
                                {isExpanded ? "Ocultar histórico" : `Ver histórico de pagamentos (${info.pagamentos.length})`}
                              </button>

                              {isExpanded && (
                                <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-emerald-500/40">
                                  {info.pagamentos.map((p, idx) => {
                                    const saldoApos = Math.max(0, info.total - info.pagamentos.slice(0, idx + 1).reduce((s, pp) => s + Number(pp.valor || 0), 0));
                                    return (
                                    <div key={p.id || idx} className="flex items-center justify-between text-xs bg-muted/40 p-2 rounded-lg">
                                      <div className="space-y-0.5">
                                        <div className="font-semibold flex items-center gap-2 flex-wrap">
                                          <span className="text-emerald-600 font-bold">✓ {brl(Number(p.valor))}</span>
                                          <span className="text-muted-foreground font-normal">em {fmtDate(p.data)}</span>
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">saldo {brl(saldoApos)}</span>
                                        </div>
                                        {p.observacao && <div className="text-muted-foreground text-[11px] italic">{p.observacao}</div>}
                                      </div>
                                      {p.id !== "legacy" && (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="size-7 text-destructive hover:bg-destructive/10"
                                          title="Estornar/Remover este pagamento"
                                          onClick={() => {
                                            if (confirm(`Remover o pagamento parcial de ${brl(p.valor)} de ${fmtDate(p.data)}?`)) {
                                              removerPagamentoParcialMut.mutate({ conta: c, paymentId: p.id });
                                            }
                                          }}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  ); })}
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span>💰 Contas a Receber</span>
            <Button size="sm" variant="outline" onClick={async () => {
              const [m,a] = await Promise.all([import("jspdf"),import("jspdf-autotable")]);
              const J=m.default; const A=(a as any).default;
              const doc=new J(); doc.setFontSize(16); doc.text("Contas a Receber",14,20);
              doc.setFontSize(9); doc.text(new Date().toLocaleString("pt-BR"),14,27);
              const pend=contasReceber.filter(c=>!c.pago); const pag=contasReceber.filter(c=>c.pago);
              let y=36; doc.setFontSize(10);
              if(pend.length){doc.text(`Pendentes (${pend.length})`,14,y);y+=6;
                A(doc,{startY:y,head:[["Descrição","Valor","Vence"]],body:pend.map(c=>[c.descricao,brl(Number(c.valor)),fmtDate(c.data_vencimento)]),styles:{fontSize:7},headStyles:{fillColor:[180,30,30]},margin:{left:14}});
                y=(doc as any).lastAutoTable.finalY+8;}
              if(pag.length){if(y>240){doc.addPage();y=20;}doc.text(`Recebidas (${pag.length})`,14,y);y+=6;
                A(doc,{startY:y,head:[["Descrição","Valor","Data"]],body:pag.map(c=>[c.descricao,brl(Number(c.valor)),c.data_pagamento?fmtDate(c.data_pagamento):"-"]),styles:{fontSize:7},headStyles:{fillColor:[30,41,59]},margin:{left:14}});}
              window.open(URL.createObjectURL(doc.output("blob")));
              toast.success("PDF gerado!");
            }} className="text-emerald-700 border-emerald-500/40 font-bold text-xs"><FileDown className="size-3.5 mr-1"/>PDF</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contasReceber.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta a receber. Crie em <span className="font-semibold">Pessoal → Novo → A receber</span>.</p>
          ) : (
            <div className="space-y-3">
              {contasReceber.filter(c => !c.pago).length > 0 && (<div><h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Pendentes</h3><ul className="space-y-3">
                {contasReceber.filter(c => !c.pago).map((c) => {
                  const info = getContaFinancialInfo(c);
                  return (<li key={c.id} className="border rounded-xl p-3.5 space-y-2 bg-card/60">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-base truncate">{c.descricao}</span>
                        {info.isParcial && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 ml-2">Parcial ({info.percentualPago}%)</span>}
                        <div className="flex items-center gap-4 text-sm mt-1.5 flex-wrap">
                          <div><span className="text-xs text-muted-foreground block">Falta receber</span><span className="font-bold text-emerald-600 text-base">{brl(info.valorRestante)}</span></div>
                          {info.valorPago > 0 && <div><span className="text-xs text-muted-foreground block">Já recebido</span><span className="font-bold text-foreground text-sm">{brl(info.valorPago)}</span></div>}
                          <div><span className="text-xs text-muted-foreground block">Valor original</span><span className="font-medium text-muted-foreground text-sm">{brl(info.total)}</span></div>
                        </div>
                        {info.valorPago > 0 && <div className="w-full bg-secondary h-2 rounded-full overflow-hidden mt-2"><div className="bg-emerald-500 h-full" style={{width:`${info.percentualPago}%`}}/></div>}
                        <div className="text-xs text-muted-foreground mt-2">Vence {fmtDate(c.data_vencimento)}{c.viveiro_id && viveiroMap.get(c.viveiro_id) ? ` · ${viveiroMap.get(c.viveiro_id)}` : ""}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button size="sm" variant="default" onClick={() => pagarContaMut.mutate(c)}><Check className="size-3.5 mr-0.5"/>Receber</Button>
                        <Button size="sm" variant="outline" onClick={() => openPagarParcial(c)} className="text-primary border-primary/30"><Receipt className="size-3.5 mr-0.5"/>Parcial</Button>
                        <Button size="sm" variant="outline" onClick={() => { setAumentarConta(c); setAumentarValor(""); }} className="text-amber-700 border-amber-500/40 text-[11px]">+ Aumentar</Button>
                        <Button size="icon" variant="ghost" className="size-7" onClick={async () => {
                          const [m,a]=await Promise.all([import("jspdf"),import("jspdf-autotable")]);
                          const J=m.default; const A=(a as any).default; const doc=new J();
                          const info=getContaFinancialInfo(c);
                          doc.setFontSize(14); doc.text(`Conta a Receber: ${c.descricao}`,14,20);
                          doc.setFontSize(9); doc.text(new Date().toLocaleString("pt-BR"),14,27);
                          let y=36; doc.setFontSize(10);
                          doc.text(`Valor: ${brl(Number(c.valor))}`,14,y);y+=6;
                          doc.text(`Recebido: ${brl(info.valorPago)}`,14,y);y+=6;
                          doc.text(`Restante: ${brl(info.valorRestante)}`,14,y);y+=6;
                          doc.text(`Vencimento: ${fmtDate(c.data_vencimento)}`,14,y);y+=8;
                          if(info.pagamentos.length>0){doc.text("Histórico:",14,y);y+=6;
                            A(doc,{startY:y,head:[["Data","Valor"]],body:info.pagamentos.map(p=>[fmtDate(p.data),brl(Number(p.valor))]),styles:{fontSize:8},headStyles:{fillColor:[30,41,59]},margin:{left:14}});}
                          window.open(URL.createObjectURL(doc.output("blob")));
                          toast.success("PDF gerado!");
                        }} title="PDF individual"><FileDown className="size-3.5"/></Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingConta(c)}><Pencil className="size-4"/></Button>
                        <Button size="icon" variant="ghost" onClick={() => { if(confirm("Remover?")) removeContaMut.mutate(c); }}><Trash2 className="size-4"/></Button>
                      </div>
                    </div>
                    {info.pagamentos.length > 0 && (
                      <div className="pt-2 border-t mt-2 space-y-1">
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Histórico de recebimentos</p>
                        {info.pagamentos.map((p,idx) => (
                          <div key={p.id||idx} className="flex items-center justify-between text-xs bg-muted/40 p-1.5 rounded-lg">
                            <span className="font-semibold text-emerald-600">✓ {brl(Number(p.valor))} <span className="text-muted-foreground font-normal ml-1">em {fmtDate(p.data)}</span></span>
                            {p.id!=="legacy" && <Button size="icon" variant="ghost" className="size-6 text-destructive hover:bg-destructive/10" onClick={()=>{if(confirm(`Remover pagamento de ${brl(p.valor)}?`))removerPagamentoParcialMut.mutate({conta:c,paymentId:p.id})}}><Trash2 className="size-3"/></Button>}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>);
                })}
              </ul></div>)}
              {contasReceber.filter(c => c.pago).length > 0 && (<div><h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Recebidas</h3><ul className="space-y-2">
                {contasReceber.filter(c => c.pago).map((c) => { const info = getContaFinancialInfo(c); return (<li key={c.id} className="border rounded-xl p-2.5 bg-card/40 space-y-1.5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-emerald-600 shrink-0">✓ {brl(Number(c.valor))}</span><span className="text-sm truncate line-through flex-1 min-w-0">{c.descricao}</span><Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => { if (confirm("Remover?")) removeContaMut.mutate(c); }}><Trash2 className="size-3.5" /></Button></div>{info.pagamentos.length > 0 && (<div className="pt-1.5 border-t space-y-1"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Histórico de recebimentos</p>{info.pagamentos.map((p,idx) => (<div key={p.id||idx} className="flex items-center justify-between text-xs bg-muted/40 p-1.5 rounded-lg"><span className="font-semibold text-emerald-600">✓ {brl(Number(p.valor))} <span className="text-muted-foreground font-normal ml-1">em {fmtDate(p.data)}</span></span>{p.id!=="legacy" && <Button size="icon" variant="ghost" className="size-6 text-destructive hover:bg-destructive/10" onClick={()=>{if(confirm(`Remover recebimento de ${brl(p.valor)}?`))removerPagamentoParcialMut.mutate({conta:c,paymentId:p.id})}}><Trash2 className="size-3"/></Button>}</div>))}</div>)}</li>); })}
              </ul></div>)}
            </div>
          )}
        </CardContent>
      </Card>
      </>)}

      {tab === "funcionarios" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <Users className="size-5 text-primary" /> Pagamentos e Vales de Funcionários
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              Total de vales/pagos: <strong className="text-red-600">{brl(totais.vales)}</strong>
            </span>
            <Button size="sm" variant="outline" onClick={async () => {
              const [pdfModule, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
              const jsPDF = pdfModule.default;
              const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
              const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
              doc.setFontSize(14); doc.setFont("helvetica", "bold");
              doc.text("Pagamentos e Vales de Funcionários", 14, 20);
              doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
              doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 14, 27);
              let y = 36;
              for (const f of funcionarios) {
                const mesAtual2 = new Date().toISOString().slice(0, 7);
                const meusVales2 = vales.filter(v => v.funcionario_id === f.id);
                const valesMes2 = meusVales2.filter(v => v.data_vale?.startsWith(mesAtual2));
                const totalPago2 = valesMes2.reduce((s, v) => s + Number(v.valor ?? 0), 0);
                const salario2 = Number(f.salario ?? 0);
                const saldo2 = Math.max(0, salario2 - totalPago2);
                if (y > 265) { doc.addPage(); y = 20; }
                doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
                doc.text(`${f.nome} — Salário: ${brl(salario2)} · Pago: ${brl(totalPago2)} · Restante: ${brl(saldo2)}`, 14, y); y += 8;
                if (meusVales2.length > 0) {
                  autoTable(doc, {
                    startY: y,
                    head: [["Data", "Valor", "Motivo"]],
                    body: meusVales2.map(v => [fmtDate(v.data_vale), brl(Number(v.valor)), v.motivo || "Vale"]),
                    styles: { fontSize: 7, cellPadding: 1.5 },
                    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                    margin: { left: 14 },
                  });
                  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
                } else { doc.text("Sem pagamentos.", 14, y); y += 8; }
              }
              const blob = doc.output("blob") as Blob;
              window.open(URL.createObjectURL(blob), "_blank");
              toast.success("PDF dos funcionários gerado!");
            }} className="text-emerald-700 border-emerald-500/40 hover:bg-emerald-50 font-bold text-xs">
              <FileDown className="size-3.5 mr-1" /> PDF Funcionários
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {funcionarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum funcionário cadastrado. Cadastre funcionários na aba Produtos & Funcionários.</p>
          ) : (
            <div className="space-y-3">
              {funcionarios.map((f) => {
                const mesAtual = new Date().toISOString().slice(0, 7);
                const meusVales = vales.filter((v) => v.funcionario_id === f.id);
                const valesMes = meusVales.filter((v) => v.data_vale?.startsWith(mesAtual));
                const totalPago = valesMes.reduce((s, v) => s + Number(v.valor ?? 0), 0);
                const baseSalario = Number(f.salario ?? 0);
                const isDiaria = f.tipo_remuneracao === "diaria";
                const viv = f.viveiro_id ? viveiros.find((v) => v.id === f.viveiro_id) : null;
                const dataBase = f.data_inicio ?? viv?.data_povoamento ?? null;
                const diasCultivo = isDiaria && dataBase ? diasDeCultivo(dataBase) : 1;
                const salario = isDiaria ? baseSalario * diasCultivo : baseSalario;
                const saldoRestante = Math.max(0, salario - totalPago);
                const percentualPago = salario > 0 ? Math.min(100, Math.round((totalPago / salario) * 100)) : (totalPago > 0 ? 100 : 0);
                const isQuitado = salario > 0 && totalPago >= salario - 0.001;
                const isParcial = !isQuitado && totalPago > 0;
                const isExpanded = expandedFuncHistoryIds.has(f.id);

                return (
                  <div key={f.id} className="border rounded-xl p-3.5 space-y-2 bg-card/60">
                    <div className="flex items-start justify-between gap-2 flex-wrap sm:flex-nowrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-base">{f.nome}</span>
                          {isQuitado ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Mês Quitado (100%)
                            </span>
                          ) : isParcial ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Parcialmente Pago ({percentualPago}%)
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              Sem pagamentos este mês
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-sm mt-1.5 flex-wrap">
                          {salario > 0 && (
                            <div>
                              <span className="text-xs text-muted-foreground block">{isDiaria ? `Diária (${diasCultivo} dias)` : "Salário base"}</span>
                              <span className="font-medium text-sm">{brl(salario)}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-xs text-muted-foreground block">Já pago este mês</span>
                            <span className="font-bold text-emerald-600 text-sm">{brl(totalPago)}</span>
                          </div>
                          {salario > 0 && (
                            <div>
                              <span className="text-xs text-muted-foreground block">Saldo a pagar</span>
                              <span className="font-bold text-red-600 text-base">{brl(saldoRestante)}</span>
                            </div>
                          )}
                        </div>

                        {salario > 0 && (
                          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden mt-2">
                            <div
                              className="bg-emerald-500 h-full transition-all duration-300"
                              style={{ width: `${percentualPago}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {saldoRestante > 0 && salario > 0 && (
                          <Button size="sm" variant="default" disabled={pagarParcialFuncMut.isPending}
                            onClick={() => pagarParcialFuncMut.mutate({ funcionarioId: f.id, nomeFuncionario: f.nome, valor: saldoRestante, data: todayISO(), motivo: "Quitação de salário do mês" })}>
                            <Check className="size-3.5 mr-0.5"/>Quitar Mês
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openPagarParcialFunc(f)} className="text-primary border-primary/30"><Receipt className="size-3.5 mr-0.5"/>Pagar Parte</Button>
                        <Button size="sm" variant="outline" onClick={() => { setAumentarSalario({ id: f.id, nome: f.nome, salario: Number(f.salario ?? 0) }); setAumentarSalarioValor(""); }} className="text-amber-700 border-amber-500/40 text-[11px]">+ Aumentar</Button>
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => buildFuncionarioPdf(f, meusVales, totalPago, saldoRestante)} title="PDF"><FileDown className="size-3.5"/></Button>
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => { setEditingFunc(f); setEditFuncNome(f.nome); setEditFuncSalario(f.salario != null ? String(f.salario) : ""); setEditFuncTipo(f.tipo_remuneracao === "diaria" ? "diaria" : "mensal"); setEditFuncViveiroId(f.viveiro_id || TODOS); }} title="Editar"><Pencil className="size-3.5"/></Button>
                        <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm(`Tem certeza que deseja apagar "${f.nome}"?`)) removeFuncMut.mutate(f.id); }} title="Remover"><Trash2 className="size-3.5"/></Button>
                      </div>
                    </div>

                    {/* Histórico de pagamentos/vales do funcionário */}
                    {meusVales.length > 0 && (
                      <div className="pt-2 border-t mt-2">
                        <button
                          type="button"
                          onClick={() => toggleExpandFuncHistory(f.id)}
                          className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
                        >
                          <History className="size-3.5" />
                          {isExpanded ? "Ocultar histórico" : `Ver histórico de pagamentos/vales (${meusVales.length})`}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-primary/20">
                            <div className="text-[11px] font-semibold text-muted-foreground uppercase">
                              Histórico de vales e pagamentos efetuados
                            </div>
                            {meusVales.map((v) => (
                              <div key={v.id} className="flex items-center justify-between text-xs bg-muted/40 p-2 rounded-lg">
                                <div className="space-y-0.5">
                                  <div className="font-semibold flex items-center gap-2">
                                    <span className="text-emerald-600 font-bold">✓ {brl(Number(v.valor))}</span>
                                    <span className="text-muted-foreground font-normal">em {fmtDate(v.data_vale)}</span>
                                  </div>
                                  <div className="text-muted-foreground text-[11px] italic">{v.motivo || "Vale"}</div>
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 text-destructive hover:bg-destructive/10"
                                  title="Remover este pagamento/vale"
                                  onClick={() => {
                                    if (confirm(`Remover o pagamento de ${brl(Number(v.valor))} de ${fmtDate(v.data_vale)}?`)) {
                                      removeValeMut.mutate(v.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {tab === "contas" && (<>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compartilhar / Exportar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {selectedIds.size > 0 || selectedContasIds.size > 0
              ? `Exportando ${selectedIds.size} lançamento(s) + ${selectedContasIds.size} conta(s) selecionada(s)`
              : "Sem seleção: exporta todos os lançamentos"}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button size="sm" variant="outline" disabled={busy || exportRows.length === 0} onClick={copiarLink}>
              <Link2 className="size-4 mr-1" /> Link
            </Button>
            <Button size="sm" variant="outline" disabled={busy || exportRows.length === 0} onClick={compartilharWhats}>
              <MessageCircle className="size-4 mr-1" /> WhatsApp
            </Button>
            <Button size="sm" variant="outline" disabled={exportRows.length === 0} onClick={baixarPdf}>
              <FileDown className="size-4 mr-1" /> PDF
            </Button>
            <Button size="sm" variant="outline" disabled={exportRows.length === 0} onClick={imprimir}>
              <Printer className="size-4 mr-1" /> Imprimir
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Últimos lançamentos</CardTitle>
          {lancamentos.length > 0 && (
            <Button size="sm" variant="ghost" onClick={toggleAll}>
              {selectedIds.size === lancamentos.length ? "Limpar seleção" : "Selecionar todos"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {lancamentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lançamento ainda.</p>
          ) : (
            <ul className="space-y-2">
              {lancamentos.map((l) => {
                const obs = stripTag(l.observacao);
                return (
                <li key={l.id} className="flex items-start gap-2 border-b pb-2 last:border-0">
                  <Checkbox
                    checked={selectedIds.has(l.id)}
                    onCheckedChange={() => toggleSelect(l.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold ${l.tipo === "receita" ? "text-emerald-600" : "text-red-600"}`}>{l.tipo === "receita" ? "+" : "-"} {brl(Number(l.valor))}</span>
                      <span className="font-medium truncate">{l.descricao}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 space-x-1">
                      <span>{fmtDate(l.data_lancamento)}</span>
                      <span>·</span>
                      <span>{l.viveiro_id ? (viveiroMap.get(l.viveiro_id) ?? "—") : (l.categoria === "interno" ? "Interno" : "Rateado")}</span>
                      {l.socio_id && socioMap.get(l.socio_id) && (<><span>·</span><span>Sócio: {socioMap.get(l.socio_id)}</span></>)}
                      {l.quantidade != null && (<><span>·</span><span>{l.quantidade} {l.unidade}</span></>)}
                    </div>
                    {obs && <div className="text-xs text-muted-foreground mt-1 italic">{obs}</div>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover lançamento?")) removeMut.mutate(l.id); }}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      </>)}

      <EditContaModal
        conta={editingConta}
        viveiros={viveiros}
        socios={socios}
        onClose={() => setEditingConta(null)}
        onSave={(c) => updateContaMut.mutate(c)}
        onReverter={(c) => reverterDividaMut.mutate(c)}
        saving={updateContaMut.isPending}
      />

      <Dialog open={!!editingFunc} onOpenChange={(open) => { if (!open) setEditingFunc(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Funcionário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={editFuncNome} onChange={e => setEditFuncNome(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Salário (R$)</Label><Input inputMode="decimal" value={editFuncSalario} onChange={e => setEditFuncSalario(e.target.value.replace(/[^0-9.,]/g,""))} /></div>
              <div><Label>Tipo</Label><Select value={editFuncTipo} onValueChange={v => setEditFuncTipo(v as "mensal"|"diaria")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mensal">Mensal</SelectItem><SelectItem value="diaria">Diária</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Alocação</Label><Select value={editFuncViveiroId} onValueChange={setEditFuncViveiroId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={TODOS}>🔄 Rateado entre todos</SelectItem><SelectItem value={INTERNO}>🏢 Nenhum viveiro</SelectItem>{viveiros.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditingFunc(null)}>Cancelar</Button><Button disabled={updateFuncMut.isPending} onClick={() => updateFuncMut.mutate()}>{updateFuncMut.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!aumentarConta} onOpenChange={(open) => { if (!open) setAumentarConta(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aumentar valor da conta</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{aumentarConta?.descricao} — valor atual: {aumentarConta ? brl(Number(aumentarConta.valor)) : ""}</p>
          <div className="space-y-2">
            <Label>Quanto adicionar? (R$)</Label>
            <Input inputMode="decimal" value={aumentarValor} onChange={e => setAumentarValor(e.target.value.replace(/[^0-9.,]/g,""))} placeholder="0,00" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAumentarConta(null)}>Cancelar</Button>
            <Button disabled={!aumentarValor || !aumentarConta} onClick={() => { const v=Number(aumentarValor.replace(",",".")); if(v>0&&aumentarConta) aumentarContaMut.mutate({conta:aumentarConta,adicional:v}); }}>Aumentar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!aumentarSalario} onOpenChange={(o) => { if(!o) setAumentarSalario(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Aumentar salário</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{aumentarSalario?.nome} — salário atual: {aumentarSalario ? brl(aumentarSalario.salario) : ""}</p>
          <div className="space-y-2"><Label>Quanto adicionar? (R$)</Label><Input inputMode="decimal" value={aumentarSalarioValor} onChange={e=>setAumentarSalarioValor(e.target.value.replace(/[^0-9.,]/g,""))} placeholder="0,00" autoFocus /></div>
          <DialogFooter><Button variant="outline" onClick={()=>setAumentarSalario(null)}>Cancelar</Button><Button disabled={!aumentarSalarioValor||!aumentarSalario} onClick={()=>{const v=Number(aumentarSalarioValor.replace(",","."));if(v>0&&aumentarSalario)aumentarSalarioMut.mutate({id:aumentarSalario.id,adicional:v});}}>Aumentar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payingParcialConta} onOpenChange={(open) => { if (!open) setPayingParcialConta(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="size-5 text-primary" /> Pagamento Parcial de Dívida
            </DialogTitle>
          </DialogHeader>

          {payingParcialConta && (() => {
            const info = getContaFinancialInfo(payingParcialConta);

            return (
              <div className="space-y-4 py-2">
                <div className="bg-muted p-3.5 rounded-xl space-y-1 text-sm">
                  <div className="font-semibold text-base">{payingParcialConta.descricao}</div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Valor Total</span>
                      <span className="font-medium">{brl(info.total)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Já pago</span>
                      <span className="font-medium text-emerald-600">{brl(info.valorPago)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Saldo restante</span>
                      <span className="font-bold text-red-600">{brl(info.valorRestante)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Valor a pagar agora (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={info.valorRestante}
                    value={valorParcial}
                    onChange={(e) => setValorParcial(e.target.value)}
                    placeholder={`Até ${info.valorRestante}`}
                  />
                  <div className="flex gap-1.5 flex-wrap pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2"
                      onClick={() => setValorParcial((info.valorRestante * 0.25).toFixed(2))}
                    >
                      25% ({brl(info.valorRestante * 0.25)})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2"
                      onClick={() => setValorParcial((info.valorRestante * 0.5).toFixed(2))}
                    >
                      50% ({brl(info.valorRestante * 0.5)})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2"
                      onClick={() => setValorParcial((info.valorRestante * 0.75).toFixed(2))}
                    >
                      75% ({brl(info.valorRestante * 0.75)})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="text-xs h-7 px-2 font-bold"
                      onClick={() => setValorParcial(info.valorRestante.toFixed(2))}
                    >
                      100% Total ({brl(info.valorRestante)})
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Data do pagamento</Label>
                  <Input
                    type="date"
                    value={dataParcial}
                    onChange={(e) => setDataParcial(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Observação / Comprovante (opcional)</Label>
                  <Input
                    value={obsParcial}
                    onChange={(e) => setObsParcial(e.target.value)}
                    placeholder="Ex: 1ª parcela via PIX"
                  />
                </div>

                <DialogFooter className="pt-2">
                  <Button variant="outline" type="button" onClick={() => setPayingParcialConta(null)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={pagarParcialMut.isPending || !valorParcial || Number(valorParcial) <= 0}
                    onClick={() => {
                      const v = Number(valorParcial.replace(",", "."));
                      if (v <= 0) return toast.error("Informe um valor válido.");
                      pagarParcialMut.mutate({
                        conta: payingParcialConta,
                        valorPagamento: v,
                        dataPagamento: dataParcial,
                        obsPagamento: obsParcial,
                      });
                    }}
                  >
                    {pagarParcialMut.isPending ? "Registrando..." : "Confirmar Pagamento"}
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!payingFuncionario} onOpenChange={(open) => { if (!open) setPayingFuncionario(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-primary" /> Pagamento Parcial de Funcionário
            </DialogTitle>
          </DialogHeader>

          {payingFuncionario && (() => {
            const mesAtual = new Date().toISOString().slice(0, 7);
            const meusVales = vales.filter((v) => v.funcionario_id === payingFuncionario.id);
            const valesMes = meusVales.filter((v) => v.data_vale?.startsWith(mesAtual));
            const totalPago = valesMes.reduce((s, v) => s + Number(v.valor ?? 0), 0);
            const salario = Number(payingFuncionario.salario ?? 0);
            const saldoRestante = Math.max(0, salario - totalPago);

            return (
              <div className="space-y-4 py-2">
                <div className="bg-muted p-3.5 rounded-xl space-y-1 text-sm">
                  <div className="font-semibold text-base">{payingFuncionario.nome}</div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Salário Base</span>
                      <span className="font-medium">{brl(salario)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Já pago (mês)</span>
                      <span className="font-medium text-emerald-600">{brl(totalPago)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Saldo a pagar</span>
                      <span className="font-bold text-red-600">{brl(saldoRestante > 0 ? saldoRestante : 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Valor a pagar (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={valorParcialFunc}
                    onChange={(e) => setValorParcialFunc(e.target.value)}
                    placeholder={saldoRestante > 0 ? `Saldo: ${saldoRestante}` : "Informe o valor"}
                  />
                  {saldoRestante > 0 && (
                    <div className="flex gap-1.5 flex-wrap pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2"
                        onClick={() => setValorParcialFunc((saldoRestante * 0.25).toFixed(2))}
                      >
                        25% ({brl(saldoRestante * 0.25)})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2"
                        onClick={() => setValorParcialFunc((saldoRestante * 0.5).toFixed(2))}
                      >
                        50% ({brl(saldoRestante * 0.5)})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2"
                        onClick={() => setValorParcialFunc((saldoRestante * 0.75).toFixed(2))}
                      >
                        75% ({brl(saldoRestante * 0.75)})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="text-xs h-7 px-2 font-bold"
                        onClick={() => setValorParcialFunc(saldoRestante.toFixed(2))}
                      >
                        100% Saldo ({brl(saldoRestante)})
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Data do pagamento</Label>
                  <Input
                    type="date"
                    value={dataParcialFunc}
                    onChange={(e) => setDataParcialFunc(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Motivo / Descrição</Label>
                  <Input
                    value={motivoParcialFunc}
                    onChange={(e) => setMotivoParcialFunc(e.target.value)}
                    placeholder="Ex: Adiantamento de quinzena"
                  />
                </div>

                <DialogFooter className="pt-2">
                  <Button variant="outline" type="button" onClick={() => setPayingFuncionario(null)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={pagarParcialFuncMut.isPending || !valorParcialFunc || Number(valorParcialFunc) <= 0}
                    onClick={() => {
                      const v = Number(valorParcialFunc.replace(",", "."));
                      if (v <= 0) return toast.error("Informe um valor válido.");
                      pagarParcialFuncMut.mutate({
                        funcionarioId: payingFuncionario.id,
                        nomeFuncionario: payingFuncionario.nome,
                        valor: v,
                        data: dataParcialFunc,
                        motivo: motivoParcialFunc,
                      });
                    }}
                  >
                    {pagarParcialFuncMut.isPending ? "Registrando..." : "Confirmar Pagamento"}
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditContaModal({
  conta, viveiros, socios, onClose, onSave, onReverter, saving,
}: {
  conta: Conta | null;
  viveiros: Viveiro[];
  socios: Socio[];
  onClose: () => void;
  onSave: (c: Conta) => void;
  onReverter?: (c: Conta) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Conta | null>(() => {
    if (!conta) return null;
    const info = getContaFinancialInfo(conta);
    return { ...conta, observacao: info.userObs || null };
  });

  useEffect(() => {
    if (conta) {
      const info = getContaFinancialInfo(conta);
      setForm({ ...conta, observacao: info.userObs || null });
    } else {
      setForm(null);
    }
  }, [conta]);
  if (!conta || !form) return null;
  const info = getContaFinancialInfo(conta);
  const vivValue = form.viveiro_id ?? (form.categoria === "interno" ? INTERNO : TODOS);
  return (
    <Dialog open={!!conta} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar conta</DialogTitle></DialogHeader>

        {info.valorPago > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
            <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center justify-between">
              <span>⚠️ Dívida com pagamentos (Já pago: {brl(info.valorPago)})</span>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Se você errou o valor pago ou o viveiro rateado, clique abaixo para desazeres os pagamentos, remover os lançamentos do caixa/viveiros e voltar a dívida para em aberto.
            </p>
            {onReverter && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full text-amber-800 border-amber-500/40 hover:bg-amber-100 dark:text-amber-300 font-bold"
                onClick={() => {
                  if (confirm(`Reverter a dívida "${conta.descricao}" para em aberto?\n\nOs lançamentos serão removidos do caixa/viveiros e a dívida voltará a ficar pendente.`)) {
                    onReverter(conta);
                    onClose();
                  }
                }}
              >
                <RotateCcw className="size-3.5 mr-1.5" /> Reverter Dívida para Em Aberto
              </Button>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input inputMode="decimal" value={String(form.valor)}
                onChange={(e) => setForm({ ...form, valor: Number(e.target.value.replace(",", ".")) || 0 })} />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={form.data_vencimento}
                onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Viveiro</Label>
            <Select value={vivValue} onValueChange={(v) => setForm({
              ...form,
              viveiro_id: (v === TODOS || v === INTERNO) ? null : v,
              categoria: v === INTERNO ? "interno" : (form.categoria === "interno" ? "geral" : form.categoria),
            })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Rateado entre todos</SelectItem>
                <SelectItem value={INTERNO}>Gasto interno</SelectItem>
                {viveiros.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sócio</Label>
            <Select value={form.socio_id ?? "__none__"} onValueChange={(v) => setForm({ ...form, socio_id: v === "__none__" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— nenhum —</SelectItem>
                {socios.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Recorrência</Label>
            <Select value={form.recorrencia} onValueChange={(v) => setForm({ ...form, recorrencia: v as Conta["recorrencia"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem recorrência</SelectItem>
                <SelectItem value="diaria">Diária</SelectItem>
                <SelectItem value="semanal">Semanal</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea rows={2} value={form.observacao ?? ""} onChange={(e) => setForm({ ...form, observacao: e.target.value || null })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={saving} onClick={() => onSave(form)}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "";
  return (
    <div className="rounded-md border p-3 min-w-0 overflow-hidden">
      <div className="text-xs text-muted-foreground truncate">{label}</div>
      <div className={`font-bold tabular-nums leading-tight break-words text-sm sm:text-base ${color}`}>{value}</div>
    </div>
  );
}
