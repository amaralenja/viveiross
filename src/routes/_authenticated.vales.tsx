import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Link2, MessageCircle, Printer, FileDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vales")({
  component: ValesPage,
});

type Funcionario = { id: string; nome: string; salario: number | null };
type Vale = {
  id: string;
  funcionario_id: string;
  valor: number;
  motivo: string | null;
  data_vale: string;
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  if (y && m && day) return `${day}/${m}/${y}`;
  return new Date(d).toLocaleDateString("pt-BR");
}

async function buildValePdfBlob(func: Funcionario, list: Vale[]) {
  const [pdfModule, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const jsPDF = pdfModule.default;
  const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.text(`Relatório de Vales — ${func.nome}`, 14, 16);
  doc.setFontSize(10);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
  const total = list.reduce((s, v) => s + Number(v.valor ?? 0), 0);
  doc.text(`Total de vales: ${brl(total)}   ·   Qtd: ${list.length}`, 14, 28);
  if (func.salario != null) doc.text(`Salário base: ${brl(Number(func.salario))}`, 14, 34);
  autoTable(doc, {
    startY: 40,
    head: [["Data", "Valor", "Motivo"]],
    body: list.map((v) => [fmtDate(v.data_vale), brl(Number(v.valor)), v.motivo ?? "—"]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  return {
    blob: doc.output("blob") as Blob,
    filename: `vales-${func.nome.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`,
  };
}

function ValesPage() {
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [vales, setVales] = useState<Vale[]>([]);
  const [funcId, setFuncId] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const { data: f } = await supabase.from("funcionarios").select("id,nome,salario").eq("ativo", true).order("nome");
    setFuncs(f ?? []);
    const { data: v } = await supabase.from("vales").select("*").order("data_vale", { ascending: false });
    setVales(v ?? []);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!funcId || !valor) return toast.error("Selecione funcionário e valor");
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("vales").insert({
      user_id: u.user!.id,
      funcionario_id: funcId,
      valor: Number(valor),
      motivo: motivo || null,
      data_vale: data,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setValor(""); setMotivo("");
    toast.success("Vale registrado");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remover vale?")) return;
    await supabase.from("vales").delete().eq("id", id);
    load();
  }

  async function gerarPdfLink(func: Funcionario, list: Vale[]): Promise<string | null> {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Sessão expirada."); return null; }
    const { blob, filename } = await buildValePdfBlob(func, list);
    const path = `${u.user.id}/vales/${Date.now()}-${filename}`;
    const { error: upErr } = await supabase.storage
      .from("relatorios-pdf")
      .upload(path, blob, { contentType: "application/pdf", upsert: true });
    if (upErr) { toast.error(upErr.message); return null; }
    const { data: signed, error: sErr } = await supabase.storage
      .from("relatorios-pdf")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (sErr || !signed) { toast.error(sErr?.message ?? "Falha ao gerar link."); return null; }
    const token = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    const { error: insErr } = await supabase.from("pdf_shares").insert({
      token, user_id: u.user.id, signed_url: signed.signedUrl, filename,
    });
    if (insErr) { toast.error(insErr.message); return null; }
    return `${window.location.origin}/p/${token}`;
  }

  async function copiarLink(func: Funcionario, list: Vale[]) {
    if (list.length === 0) return toast.error("Sem vales pra compartilhar");
    setBusyId(func.id);
    const tid = toast.loading("Gerando link...");
    try {
      const url = await gerarPdfLink(func, list);
      if (!url) { toast.dismiss(tid); return; }
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado!", { id: tid, description: url });
      } catch {
        toast.dismiss(tid);
        window.prompt("Copie o link:", url);
      }
    } finally { setBusyId(null); }
  }

  async function compartilharWhats(func: Funcionario, list: Vale[]) {
    if (list.length === 0) return toast.error("Sem vales pra compartilhar");
    setBusyId(func.id);
    const tid = toast.loading("Gerando link...");
    try {
      const url = await gerarPdfLink(func, list);
      toast.dismiss(tid);
      if (!url) return;
      const total = list.reduce((s, v) => s + Number(v.valor), 0);
      const texto = `Relatório de Vales — ${func.nome}\nTotal: ${brl(total)}\n${url}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
    } finally { setBusyId(null); }
  }

  async function baixarPdf(func: Funcionario, list: Vale[]) {
    if (list.length === 0) return toast.error("Sem vales");
    const { blob, filename } = await buildValePdfBlob(func, list);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function imprimir(func: Funcionario, list: Vale[]) {
    if (list.length === 0) return toast.error("Sem vales");
    const { blob } = await buildValePdfBlob(func, list);
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) {
      w.addEventListener("load", () => {
        try { w.print(); } catch { /* ignore */ }
      });
    }
  }

  const porFunc = funcs.map((f) => {
    const list = vales.filter((v) => v.funcionario_id === f.id);
    const total = list.reduce((s, v) => s + Number(v.valor), 0);
    return { ...f, list, total };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vales</h1>
        <p className="text-sm text-muted-foreground">Adiantamentos para funcionários</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="size-4" /> Novo vale
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Funcionário</Label>
            <Select value={funcId} onValueChange={setFuncId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {funcs.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Motivo</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que o vale?" />
          </div>
          <Button onClick={add} disabled={loading} className="w-full">Registrar vale</Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {porFunc.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum funcionário cadastrado. Cadastre em Produtos → Funcionários.</p>
        )}
        {porFunc.map((f) => (
          <Card key={f.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{f.nome}</CardTitle>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="font-bold text-primary">{brl(f.total)}</div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button size="sm" variant="outline" disabled={busyId === f.id || f.list.length === 0}
                  onClick={() => copiarLink(f, f.list)}>
                  <Link2 className="size-4 mr-1" /> Link
                </Button>
                <Button size="sm" variant="outline" disabled={busyId === f.id || f.list.length === 0}
                  onClick={() => compartilharWhats(f, f.list)}>
                  <MessageCircle className="size-4 mr-1" /> WhatsApp
                </Button>
                <Button size="sm" variant="outline" disabled={f.list.length === 0}
                  onClick={() => baixarPdf(f, f.list)}>
                  <FileDown className="size-4 mr-1" /> PDF
                </Button>
                <Button size="sm" variant="outline" disabled={f.list.length === 0}
                  onClick={() => imprimir(f, f.list)}>
                  <Printer className="size-4 mr-1" /> Imprimir
                </Button>
              </div>

              {f.list.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem vales</p>
              ) : (
                <ul className="space-y-2">
                  {f.list.map((v) => (
                    <li key={v.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                      <div className="min-w-0">
                        <div className="font-medium">{brl(Number(v.valor))}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(v.data_vale)}
                        </div>
                        {v.motivo && <div className="text-sm mt-1">{v.motivo}</div>}
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => remove(v.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
