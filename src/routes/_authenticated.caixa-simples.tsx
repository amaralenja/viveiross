import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Trash2, Plus, Link2, MessageCircle, Printer, FileDown, Zap, Check, Repeat } from "lucide-react";

const CS_TAG = "[cs]";
const stripTag = (o: string | null) => (o ?? "").replace(/^\[cs\]\s*/, "").trim();

export const Route = createFileRoute("/_authenticated/caixa-simples")({
  head: () => ({ meta: [{ title: "Caixa Simples" }] }),
  component: CaixaSimplesPage,
});

const TODOS = "__todos__";
const INTERNO = "__interno__";

type Socio = { id: string; nome: string };
type Viveiro = { id: string; nome: string };
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
};

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

async function buildPdfBlob(rows: Lanc[], socioMap: Map<string, string>, viveiroMap: Map<string, string>, totais: { despesas: number; contasPagar: number; vales: number; salarios: number }) {
  const [pdfModule, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const jsPDF = pdfModule.default;
  const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.text("Caixa Simples", 14, 16);
  doc.setFontSize(10);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
  doc.text(`Despesas: ${brl(totais.despesas)}  ·  Contas a pagar: ${brl(totais.contasPagar)}`, 14, 28);
  doc.text(`Vales: ${brl(totais.vales)}  ·  Salários base: ${brl(totais.salarios)}`, 14, 34);
  autoTable(doc, {
    startY: 40,
    head: [["Data", "Descrição", "Sócio", "Viveiro", "Qtd", "Valor"]],
    body: rows.map((r) => [
      fmtDate(r.data_lancamento),
      r.descricao,
      r.socio_id ? (socioMap.get(r.socio_id) ?? "—") : "—",
      r.viveiro_id ? (viveiroMap.get(r.viveiro_id) ?? "—") : "Rateado",
      r.quantidade != null ? `${r.quantidade} ${r.unidade ?? ""}` : "—",
      `- ${brl(Number(r.valor))}`,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  return {
    blob: doc.output("blob") as Blob,
    filename: `caixa-simples-${new Date().toISOString().slice(0, 10)}.pdf`,
  };
}

function CaixaSimplesPage() {
  const qc = useQueryClient();
  const [modo, setModo] = useState<"despesa" | "vale" | "conta_pagar">("despesa");
  const [funcionarioId, setFuncionarioId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [qtd, setQtd] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [data, setData] = useState(todayISO);
  const [socioId, setSocioId] = useState("");
  const [viveiroId, setViveiroId] = useState<string>(TODOS);
  const [observacao, setObservacao] = useState("");
  const [recorrencia, setRecorrencia] = useState<Conta["recorrencia"]>("none");
  const [busy, setBusy] = useState(false);
  const [showNovoSocio, setShowNovoSocio] = useState(false);
  const [novoSocioNome, setNovoSocioNome] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedContasIds, setSelectedContasIds] = useState<Set<string>>(new Set());

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "ativos", "simples"],
    queryFn: async () => {
      const { data, error } = await supabase.from("viveiros").select("id, nome").eq("status", "ativo").order("nome");
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
        .select("id, descricao, valor, data_vencimento, data_pagamento, pago, categoria, observacao, socio_id, viveiro_id, recorrencia")
        .order("pago", { ascending: true })
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Conta[];
    },
  });

  const { data: vales = [] } = useQuery({
    queryKey: ["vales", "totais"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vales").select("valor, data_vale, motivo");
      if (error) throw error;
      return (data ?? []) as { valor: number; data_vale: string; motivo: string | null }[];
    },
  });

  const { data: funcionarios = [] } = useQuery({
    queryKey: ["funcionarios", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("funcionarios").select("id, nome, salario").eq("ativo", true);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; salario: number | null }[];
    },
  });

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

      if (modo === "conta_pagar") {
        const isInterno = viveiroId === INTERNO;
        const { error } = await supabase.from("contas_pagar").insert({
          user_id: u.user.id,
          descricao: descricao.trim(),
          valor: v,
          data_vencimento: data,
          categoria: isInterno ? "interno" : "geral",
          observacao: observacao.trim() || null,
          socio_id: socioId || null,
          viveiro_id: (viveiroId === TODOS || isInterno) ? null : viveiroId,
          recorrencia,
        });
        if (error) throw error;
        return;
      }

      const qNum = Number(qtd.replace(",", ".")) || 0;
      const isInterno = viveiroId === INTERNO;
      const { error } = await supabase.from("caixa_lancamentos").insert({
        user_id: u.user.id,
        viveiro_id: (viveiroId === TODOS || isInterno) ? null : viveiroId,
        data_lancamento: data,
        descricao: descricao.trim(),
        categoria: isInterno ? "interno" : "geral",
        valor: v,
        tipo: "despesa",
        quantidade: qNum > 0 ? qNum : null,
        unidade: qNum > 0 ? unidade : null,
        socio_id: socioId || null,
        observacao: `${CS_TAG} ${observacao.trim()}`.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        modo === "vale" ? "Vale registrado" :
        modo === "conta_pagar" ? "Conta a pagar registrada" :
        "Despesa registrada"
      );
      setDescricao(""); setValor(""); setQtd(""); setObservacao(""); setRecorrencia("none");
      qc.invalidateQueries({ queryKey: ["caixa-simples", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
      qc.invalidateQueries({ queryKey: ["vales"] });
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pagarContaMut = useMutation({
    mutationFn: async (conta: Conta) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada.");
      const hoje = todayISO();
      // 1) lança no caixa (aparece nos relatórios)
      const { data: lanc, error: lErr } = await supabase.from("caixa_lancamentos").insert({
        user_id: u.user.id,
        viveiro_id: conta.viveiro_id,
        data_lancamento: hoje,
        descricao: `Conta paga: ${conta.descricao}`,
        categoria: conta.categoria ?? "geral",
        valor: Number(conta.valor),
        tipo: "despesa",
        socio_id: conta.socio_id,
        observacao: `${CS_TAG} Pagamento de conta`.trim(),
      }).select("id").single();
      if (lErr) throw lErr;
      // 2) marca como paga
      const { error: uErr } = await supabase.from("contas_pagar").update({
        pago: true,
        data_pagamento: hoje,
        caixa_lancamento_id: lanc?.id ?? null,
      }).eq("id", conta.id);
      if (uErr) throw uErr;
      // 3) se recorrente, cria próxima
      if (conta.recorrencia !== "none") {
        const prox = proximaData(conta.data_vencimento, conta.recorrencia);
        if (prox) {
          const { error: nErr } = await supabase.from("contas_pagar").insert({
            user_id: u.user.id,
            descricao: conta.descricao,
            valor: conta.valor,
            data_vencimento: prox,
            categoria: conta.categoria,
            observacao: conta.observacao,
            socio_id: conta.socio_id,
            viveiro_id: conta.viveiro_id,
            recorrencia: conta.recorrencia,
            parent_id: conta.id,
          });
          if (nErr) throw nErr;
        }
      }
    },
    onSuccess: () => {
      toast.success("Conta paga e lançada no caixa");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["caixa-simples", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeContaMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contas_pagar").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta removida");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totais = useMemo(() => {
    const despesas = lancamentos.reduce((s, l) => s + Number(l.valor ?? 0), 0);
    const contasPendentes = contas.filter((c) => !c.pago).reduce((s, c) => s + Number(c.valor ?? 0), 0);
    const contasPagas = contas.filter((c) => c.pago).reduce((s, c) => s + Number(c.valor ?? 0), 0);
    const totalVales = vales.reduce((s, v) => s + Number(v.valor ?? 0), 0);
    const mesAtual = new Date().toISOString().slice(0, 7);
    const valesMes = vales.filter((v) => v.data_vale?.startsWith(mesAtual)).reduce((s, v) => s + Number(v.valor ?? 0), 0);
    const salarios = funcionarios.reduce((s, f) => s + Number(f.salario ?? 0), 0);
    return { despesas, contasPendentes, contasPagas, vales: totalVales, valesMes, salarios };
  }, [lancamentos, contas, vales, funcionarios]);

  const exportRows = useMemo(() => {
    const rows = selectedIds.size > 0 ? lancamentos.filter((l) => selectedIds.has(l.id)) : lancamentos;
    const base = rows.map((l) => ({ ...l, observacao: stripTag(l.observacao) || null }));
    const contasSel = selectedContasIds.size > 0 ? contas.filter((c) => selectedContasIds.has(c.id)) : [];
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
    const despesas = exportRows.reduce((s, l) => s + Number(l.valor ?? 0), 0);
    return { despesas, contasPagar: totais.contasPendentes, vales: totais.vales, salarios: totais.salarios };
  }, [exportRows, totais]);

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
      const texto = `Caixa Simples\nDespesas: ${brl(exportTotais.despesas)}\nContas a pagar: ${brl(exportTotais.contasPagar)}\n${url}`;
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
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="size-6 text-primary" /> Caixa Simples</h1>
        <p className="text-sm text-muted-foreground">Lançamento rápido — reflete direto no Caixa e nos Relatórios</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Resumo geral</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi label="Despesas" value={brl(totais.despesas)} tone="bad" />
            <Kpi label="Contas a pagar (pendente)" value={brl(totais.contasPendentes)} tone="bad" />
            <Kpi label="Contas pagas" value={brl(totais.contasPagas)} tone="ok" />
            <Kpi label="Vales (total)" value={brl(totais.vales)} />
            <Kpi label="Vales do mês" value={brl(totais.valesMes)} />
            <Kpi label="Salários base" value={brl(totais.salarios)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="size-4" /> Novo lançamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" size="sm" variant={modo === "despesa" ? "default" : "outline"} onClick={() => setModo("despesa")}>Despesa</Button>
            <Button type="button" size="sm" variant={modo === "vale" ? "default" : "outline"} onClick={() => setModo("vale")}>Vale</Button>
            <Button type="button" size="sm" variant={modo === "conta_pagar" ? "default" : "outline"} onClick={() => setModo("conta_pagar")}>Contas a pagar</Button>
          </div>

          {modo === "vale" && (
            <div>
              <Label>Funcionário</Label>
              <Select value={funcionarioId || "__none__"} onValueChange={(v) => setFuncionarioId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— selecione —</SelectItem>
                  {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>{modo === "vale" ? "Motivo (opcional)" : "Descrição"}</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={modo === "conta_pagar" ? "Ex: Conta de luz" : modo === "vale" ? "Ex: adiantamento" : "Ex: Tinta pro viveiro"} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>{dataLabel}</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          {modo === "conta_pagar" && (
            <div className="rounded-md border border-dashed p-3 space-y-2">
              <Label className="flex items-center gap-2"><Repeat className="size-4" /> É conta recorrente?</Label>
              <p className="text-xs text-muted-foreground">Se sim, ao marcar como paga, a próxima parcela é criada automaticamente com o novo vencimento.</p>
              <Select value={recorrencia} onValueChange={(v) => setRecorrencia(v as Conta["recorrencia"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não, é única</SelectItem>
                  <SelectItem value="diaria">Sim — todo dia</SelectItem>
                  <SelectItem value="semanal">Sim — toda semana</SelectItem>
                  <SelectItem value="mensal">Sim — todo mês</SelectItem>
                  <SelectItem value="anual">Sim — todo ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {modo !== "vale" && (
            <>
              {modo === "despesa" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Quantidade (opcional)</Label>
                    <Input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <Label>Unidade</Label>
                    <Select value={unidade} onValueChange={setUnidade}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="un">un</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="cx">cx</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div>
                <Label>{modo === "conta_pagar" ? "Quem vai pagar (sócio)" : "Quem pagou (sócio)"}</Label>
                <div className="flex gap-2">
                  <Select value={socioId || "__none__"} onValueChange={(v) => setSocioId(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="— nenhum —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— nenhum —</SelectItem>
                      {socios.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={() => setShowNovoSocio((v) => !v)}>
                    {showNovoSocio ? "Cancelar" : "+ Novo"}
                  </Button>
                </div>
                {showNovoSocio && (
                  <div className="flex gap-2 mt-2">
                    <Input
                      autoFocus
                      value={novoSocioNome}
                      onChange={(e) => setNovoSocioNome(e.target.value)}
                      placeholder="Nome do novo sócio"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (novoSocioNome.trim()) addSocioMut.mutate(novoSocioNome.trim());
                        }
                      }}
                    />
                    <Button
                      type="button"
                      disabled={!novoSocioNome.trim() || addSocioMut.isPending}
                      onClick={() => addSocioMut.mutate(novoSocioNome.trim())}
                    >
                      Salvar
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <Label>Viveiro (ou rateado entre todos)</Label>
                <Select value={viveiroId} onValueChange={setViveiroId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Rateado entre todos os viveiros</SelectItem>
                    <SelectItem value={INTERNO}>Gasto interno (não vai pra nenhum viveiro)</SelectItem>
                    {viveiros.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Observação (opcional)</Label>
                <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
              </div>
            </>
          )}

          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="w-full">
            {saveMut.isPending ? "Salvando..." : "Salvar lançamento"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span>Contas a pagar</span>
            <div className="flex items-center gap-3 text-sm font-normal">
              <span className="text-muted-foreground">Pendente: <strong className="text-red-600">{brl(totais.contasPendentes)}</strong></span>
              {contas.length > 0 && (
                <Button size="sm" variant="ghost" onClick={toggleAllContas}>
                  {selectedContasIds.size === contas.length ? "Limpar" : "Selecionar todas"}
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contasPendentes.length === 0 && contasPagas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada. Crie uma acima escolhendo "Contas a pagar".</p>
          ) : (
            <div className="space-y-4">
              {contasPendentes.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Pendentes</h3>
                  <ul className="space-y-2">
                    {contasPendentes.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 border-b pb-2 last:border-0">
                        <Checkbox
                          checked={selectedContasIds.has(c.id)}
                          onCheckedChange={() => toggleSelectConta(c.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-red-600">- {brl(Number(c.valor))}</span>
                            <span className="font-medium truncate">{c.descricao}</span>
                            {c.recorrencia !== "none" && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 flex items-center gap-1">
                                <Repeat className="size-3" /> {RECORRENCIA_LABEL[c.recorrencia]}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 space-x-1">
                            <span>Vence {fmtDate(c.data_vencimento)}</span>
                            {c.viveiro_id && viveiroMap.get(c.viveiro_id) && (<><span>·</span><span>{viveiroMap.get(c.viveiro_id)}</span></>)}
                            {c.categoria === "interno" && (<><span>·</span><span>Interno</span></>)}
                            {c.socio_id && socioMap.get(c.socio_id) && (<><span>·</span><span>Sócio: {socioMap.get(c.socio_id)}</span></>)}
                          </div>
                          {c.observacao && <div className="text-xs text-muted-foreground mt-1 italic">{c.observacao}</div>}
                        </div>
                        <Button size="sm" variant="default" disabled={pagarContaMut.isPending} onClick={() => pagarContaMut.mutate(c)}>
                          <Check className="size-4 mr-1" /> Pagar
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover conta?")) removeContaMut.mutate(c.id); }}>
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {contasPagas.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Pagas recentemente</h3>
                  <ul className="space-y-2">
                    {contasPagas.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 border-b pb-2 last:border-0 opacity-70">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-emerald-600">✓ {brl(Number(c.valor))}</span>
                            <span className="font-medium truncate line-through">{c.descricao}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Paga em {c.data_pagamento ? fmtDate(c.data_pagamento) : "—"} · venceu {fmtDate(c.data_vencimento)}
                          </div>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover registro?")) removeContaMut.mutate(c.id); }}>
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compartilhar / Exportar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {selectedIds.size > 0
              ? `Exportando ${selectedIds.size} lançamento(s) selecionado(s)`
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
                      <span className="text-xs font-bold text-red-600">- {brl(Number(l.valor))}</span>
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
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-bold truncate ${color}`}>{value}</div>
    </div>
  );
}
