import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Pencil, X, Plus, TrendingUp, TrendingDown, FileDown, DollarSign, PieChart } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro Pessoal" }] }),
  component: FinanceiroPage,
});

type Lanc = { id: string; tipo: string; descricao: string; valor: number; categoria: string; data: string; observacao: string | null };

function brl(n: number) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtDate(d: string) { const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }
function today() { return new Date().toISOString().slice(0, 10); }

const CATEGORIAS = ["geral", "alimentação", "transporte", "moradia", "saúde", "lazer", "educação", "investimento", "salário", "freelance", "outros"];

function FinanceiroPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Lanc | null>(null);
  const [tipo, setTipo] = useState<"despesa" | "receita">("despesa");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [categoria, setCategoria] = useState("geral");
  const [data, setData] = useState(today());
  const [observacao, setObservacao] = useState("");
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0, 7));
  const [filtroCategoria, setFiltroCategoria] = useState("todas");

  const { data: lancs = [] } = useQuery({
    queryKey: ["financeiro_pessoal"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financeiro_pessoal").select("*").order("data", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lanc[];
    },
  });

  const filtrados = useMemo(() => lancs.filter(l => {
    if (filtroMes && !l.data.startsWith(filtroMes)) return false;
    if (filtroCategoria !== "todas" && l.categoria !== filtroCategoria) return false;
    return true;
  }), [lancs, filtroMes, filtroCategoria]);

  const totais = useMemo(() => {
    let receitas = 0, despesas = 0;
    const porCat: Record<string, number> = {};
    for (const l of filtrados) {
      if (l.tipo === "receita") receitas += Number(l.valor);
      else despesas += Number(l.valor);
      porCat[l.categoria] = (porCat[l.categoria] ?? 0) + Number(l.valor);
    }
    return { receitas, despesas, saldo: receitas - despesas, porCat };
  }, [filtrados]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const v = Number(valor.replace(",", "."));
      if (!descricao.trim() || !v || v <= 0) throw new Error("Preencha descrição e valor.");
      if (editing) {
        await supabase.from("financeiro_pessoal").update({ tipo, descricao: descricao.trim(), valor: v, categoria, data, observacao: observacao.trim() || null }).eq("id", editing.id);
      } else {
        const { data: u } = await supabase.auth.getUser();
        await supabase.from("financeiro_pessoal").insert({ user_id: u.user?.id, tipo, descricao: descricao.trim(), valor: v, categoria, data, observacao: observacao.trim() || null });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Atualizado!" : "Registrado!");
      reset(); qc.invalidateQueries({ queryKey: ["financeiro_pessoal"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => supabase.from("financeiro_pessoal").delete().eq("id", id),
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["financeiro_pessoal"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function reset() { setShowForm(false); setEditing(null); setDescricao(""); setValor(""); setCategoria("geral"); setData(today()); setObservacao(""); }
  function edit(l: Lanc) { setEditing(l); setTipo(l.tipo as "despesa"|"receita"); setDescricao(l.descricao); setValor(String(l.valor)); setCategoria(l.categoria); setData(l.data); setObservacao(l.observacao || ""); setShowForm(true); }

  async function pdf() {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Financeiro Pessoal", 14, 20);
    doc.setFontSize(9); doc.text(`Período: ${filtroMes || "Todos"} · ${fmtDate(today())}`, 14, 27);
    doc.setFontSize(12);
    doc.setTextColor(0,130,70); doc.text(`Receitas: ${brl(totais.receitas)}`, 14, 36);
    doc.setTextColor(180,30,30); doc.text(`Despesas: ${brl(totais.despesas)}`, 80, 36);
    doc.setTextColor(0); doc.text(`Saldo: ${brl(totais.saldo)}`, 150, 36);
    (doc as any).autoTable({
      startY: 42,
      head: [["Data", "Tipo", "Descrição", "Categoria", "Valor"]],
      body: filtrados.map(l => [fmtDate(l.data), l.tipo === "receita" ? "Receita" : "Despesa", l.descricao, l.categoria, `${l.tipo === "receita" ? "+" : "-"} ${brl(Number(l.valor))}`]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [30,41,59] },
    });
    window.open(URL.createObjectURL(doc.output("blob")));
    toast.success("PDF gerado!");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><DollarSign className="size-6" /></div>
        <div><h1 className="text-2xl font-bold">Financeiro Pessoal</h1><p className="text-sm text-muted-foreground">Controle suas finanças separado do caixa</p></div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4"><p className="text-[10px] uppercase text-emerald-600 font-semibold">Receitas</p><p className="text-xl font-black text-emerald-600">{brl(totais.receitas)}</p></div>
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4"><p className="text-[10px] uppercase text-rose-600 font-semibold">Despesas</p><p className="text-xl font-black text-rose-600">{brl(totais.despesas)}</p></div>
        <div className={`rounded-2xl border p-4 ${totais.saldo >= 0 ? "bg-muted/40" : "bg-rose-500/5 border-rose-500/30"}`}><p className="text-[10px] uppercase text-muted-foreground font-semibold">Saldo</p><p className={`text-xl font-black ${totais.saldo >= 0 ? "text-foreground" : "text-rose-600"}`}>{brl(totais.saldo)}</p></div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} className="app-input h-9 w-auto text-xs" />
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className="app-input h-9 w-auto text-xs">
          <option value="todas">Todas categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={pdf} className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5"><FileDown className="size-3.5" />PDF</button>
        <div className="flex-1" />
        <button onClick={() => { reset(); setShowForm(true); }} className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-bold flex items-center gap-1.5"><Plus className="size-4" />Novo</button>
      </div>

      {showForm && (
        <form onSubmit={e => { e.preventDefault(); saveMut.mutate(); }} className="rounded-2xl bg-card border p-4 space-y-3">
          <h3 className="font-bold text-sm">{editing ? "Editar" : "Novo"} Lançamento</h3>
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl">
            <button type="button" onClick={() => setTipo("despesa")} className={`h-10 rounded-lg font-semibold text-sm ${tipo === "despesa" ? "bg-rose-500 text-white" : "text-muted-foreground"}`}><TrendingDown className="size-4 inline mr-1" />Despesa</button>
            <button type="button" onClick={() => setTipo("receita")} className={`h-10 rounded-lg font-semibold text-sm ${tipo === "receita" ? "bg-emerald-600 text-white" : "text-muted-foreground"}`}><TrendingUp className="size-4 inline mr-1" />Receita</button>
          </div>
          <input required value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição" className="app-input h-10 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input required value={valor} onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g,""))} placeholder="Valor R$" className="app-input h-10 text-sm" inputMode="decimal" />
            <input required type="date" value={data} onChange={e => setData(e.target.value)} className="app-input h-10 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={categoria} onChange={e => setCategoria(e.target.value)} className="app-input h-10 text-sm">
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Observação" className="app-input h-10 text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="flex-1 h-10 rounded-xl border font-semibold text-sm">Cancelar</button>
            <button type="submit" disabled={saveMut.isPending} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">{saveMut.isPending ? "Salvando..." : "Salvar"}</button>
          </div>
        </form>
      )}

      {filtrados.length === 0 ? (
        <div className="p-8 rounded-2xl border-2 border-dashed text-center text-muted-foreground text-sm">Nenhum lançamento no período.</div>
      ) : (
        <div className="space-y-1.5">
          {filtrados.map(l => (
            <div key={l.id} className="flex items-center justify-between p-2.5 rounded-xl bg-card border text-sm gap-2">
              <span className="text-muted-foreground w-20 shrink-0 text-xs">{fmtDate(l.data)}</span>
              <span className={`font-bold text-xs w-12 shrink-0 ${l.tipo === "receita" ? "text-emerald-600" : "text-rose-600"}`}>{l.tipo === "receita" ? "+" : "-"}{brl(Number(l.valor))}</span>
              <span className="font-medium truncate flex-1 min-w-0">{l.descricao}</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{l.categoria}</span>
              <button onClick={() => edit(l)} className="size-7 rounded-lg hover:bg-muted flex items-center justify-center shrink-0"><Pencil className="size-3.5" /></button>
              <button onClick={() => { if (confirm("Apagar?")) delMut.mutate(l.id); }} className="size-7 rounded-lg hover:bg-destructive/10 hover:text-destructive flex items-center justify-center shrink-0"><Trash2 className="size-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
