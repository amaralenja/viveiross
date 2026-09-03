import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Receipt, FileDown } from "lucide-react";
import { todayLocal } from "@/lib/date";

type Despesa = {
  id: string;
  viveiro_id: string | null;
  descricao: string;
  categoria: string | null;
  valor: number;
  data_despesa: string;
  rateio: string;
  observacao: string | null;
};
type ViveiroOpt = { id: string; nome: string };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function DespesasExtras() {
  const qc = useQueryClient();
  const [openDesp, setOpenDesp] = useState(false);
  const [editando, setEditando] = useState<Despesa | null>(null);

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("viveiros").select("id, nome, status").eq("status", "ativo").order("nome");
      if (error) { console.error(error); return []; }
      return (data ?? []) as ViveiroOpt[];
    },
  });

  const { data: despesas = [] } = useQuery({
    queryKey: ["despesas_gerais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despesas_gerais")
        .select("id, viveiro_id, descricao, categoria, valor, data_despesa, rateio, observacao")
        .order("data_despesa", { ascending: false });
      if (error) { console.error(error); return []; }
      return (data ?? []) as Despesa[];
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("despesas_gerais").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["despesas_gerais"] }); qc.invalidateQueries({ queryKey: ["caixa"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <DespesasExtrasView
        despesas={despesas}
        viveiros={viveiros}
        onNova={() => { setEditando(null); setOpenDesp(true); }}
        onEdit={(d) => setEditando(d)}
        onDel={(d) => { if (confirm(`Remover "${d.descricao}"?`)) delMut.mutate(d.id); }}
      />
      {(openDesp || editando) && (
        <DespesaModal
          despesa={editando}
          viveiros={viveiros}
          onClose={() => { setOpenDesp(false); setEditando(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["despesas_gerais"] }); qc.invalidateQueries({ queryKey: ["caixa"] }); setOpenDesp(false); setEditando(null); }}
        />
      )}
    </>
  );
}

function DespesasExtrasView({ despesas, viveiros, onNova, onEdit, onDel }: {
  despesas: Despesa[];
  viveiros: ViveiroOpt[];
  onNova: () => void;
  onEdit: (d: Despesa) => void;
  onDel: (d: Despesa) => void;
}) {
  const [periodo, setPeriodo] = useState<"mes" | "30d" | "tudo" | "custom">("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtData = (iso: string) => { const p = (iso || "").slice(0, 10).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; };
  const viveiroMap = useMemo(() => new Map(viveiros.map((v) => [v.id, v.nome])), [viveiros]);
  const labelViveiro = (d: Despesa) =>
    d.rateio === "todos" || !d.viveiro_id ? "Geral (todos)" : (viveiroMap.get(d.viveiro_id) ?? "Viveiro");

  const filtradas = useMemo(() => {
    const hoje = new Date();
    let ini: string | null = null, fim: string | null = null;
    if (periodo === "mes") { const y = hoje.getFullYear(), m = String(hoje.getMonth() + 1).padStart(2, "0"); ini = `${y}-${m}-01`; fim = `${y}-${m}-31`; }
    else if (periodo === "30d") { const d = new Date(hoje); d.setDate(d.getDate() - 30); ini = d.toISOString().slice(0, 10); fim = hoje.toISOString().slice(0, 10); }
    else if (periodo === "custom") { ini = de || null; fim = ate || null; }
    return despesas.filter((x) => {
      const dt = (x.data_despesa || "").slice(0, 10);
      if (ini && dt < ini) return false;
      if (fim && dt > fim) return false;
      return true;
    });
  }, [despesas, periodo, de, ate]);

  const total = filtradas.reduce((s, x) => s + Number(x.valor ?? 0), 0);
  const periodoLabel = periodo === "mes" ? "Mês atual" : periodo === "30d" ? "Últimos 30 dias" : periodo === "custom" ? `${de ? fmtData(de) : "início"} a ${ate ? fmtData(ate) : "hoje"}` : "Todo o período";

  const porViveiro = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of filtradas) { const k = labelViveiro(x); m.set(k, (m.get(k) ?? 0) + Number(x.valor ?? 0)); }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas]);

  async function gerarPdf() {
    if (filtradas.length === 0) { toast.error("Nada para imprimir nesse período."); return; }
    const [pdfModule, tableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const jsPDF = pdfModule.default;
    const autoTable = (tableModule as unknown as { default: (d: unknown, o: unknown) => void }).default;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFillColor(220, 38, 38); doc.rect(0, 0, 210, 22, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text("Relatório de Despesas Extras", 14, 14);
    doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`Período: ${periodoLabel}`, 14, 30);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 36);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(`Total: ${brl(total)}`, 14, 45);
    autoTable(doc, {
      startY: 50,
      head: [["Resumo por destino", "Total"]],
      body: porViveiro.map(([nome, v]) => [nome, brl(v)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [71, 85, 105] },
      columnStyles: { 1: { halign: "right" } },
    });
    const y2 = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60;
    autoTable(doc, {
      startY: y2 + 6,
      head: [["Data", "Descrição", "Destino", "Categoria", "Valor"]],
      body: filtradas.map((x) => [fmtData(x.data_despesa), x.descricao || "—", labelViveiro(x), x.categoria || "—", brl(Number(x.valor ?? 0))]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 4: { halign: "right" } },
    });
    doc.save(`despesas-extras-${periodoLabel.replace(/[^0-9A-Za-z]+/g, "-").toLowerCase()}.pdf`);
    toast.success("PDF gerado");
  }

  const btnCls = (on: boolean) => `h-9 px-3 rounded-lg text-xs font-bold transition ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Receipt className="size-5 text-destructive" />
          <div className="min-w-0">
            <h2 className="font-bold text-base">Despesas extras dos viveiros</h2>
            <p className="text-xs text-muted-foreground">Manutenção, mão de obra, funcionário, ferramentas... Lance <span className="font-semibold">Geral</span> ou <span className="font-semibold">por viveiro</span>. Ração/insumo é no Estoque/Compras.</p>
          </div>
        </div>
        <button onClick={onNova} className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90"><Plus className="size-4" /> Nova despesa</button>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button onClick={() => setPeriodo("mes")} className={btnCls(periodo === "mes")}>Mês atual</button>
          <button onClick={() => setPeriodo("30d")} className={btnCls(periodo === "30d")}>Últimos 30 dias</button>
          <button onClick={() => setPeriodo("tudo")} className={btnCls(periodo === "tudo")}>Tudo</button>
          <button onClick={() => setPeriodo("custom")} className={btnCls(periodo === "custom")}>Personalizado</button>
        </div>
        {periodo === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-muted-foreground">De<input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="app-input mt-1 w-full" /></label>
            <label className="text-xs font-semibold text-muted-foreground">Até<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="app-input mt-1 w-full" /></label>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Total ({periodoLabel})</p>
            <p className="text-2xl font-black text-destructive tabular-nums">{brl(total)}</p>
            <p className="text-[11px] text-muted-foreground">{filtradas.length} despesa(s)</p>
          </div>
          <button onClick={gerarPdf} className="h-11 px-4 rounded-xl border font-bold text-sm flex items-center gap-2 hover:bg-muted shrink-0"><FileDown className="size-4" /> Imprimir (PDF)</button>
        </div>
      </div>

      {porViveiro.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Por destino</p>
          <div className="space-y-1.5">
            {porViveiro.map(([nome, v]) => (
              <div key={nome} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{nome}</span>
                <span className="font-bold tabular-nums text-destructive shrink-0">{brl(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtradas.length === 0 ? (
        <div className="p-8 rounded-2xl border-2 border-dashed text-center text-sm text-muted-foreground">Nenhuma despesa extra nesse período.<br />Toque em <span className="font-semibold text-foreground">"Nova despesa"</span> pra lançar.</div>
      ) : (
        <div className="rounded-2xl border bg-card divide-y">
          {filtradas.map((x) => (
            <div key={x.id} className="p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{x.descricao || "—"}</p>
                <p className="text-[11px] text-muted-foreground">{fmtData(x.data_despesa)} · <span className="font-medium text-foreground">{labelViveiro(x)}</span>{x.categoria ? ` · ${x.categoria}` : ""}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-black tabular-nums text-destructive">{brl(Number(x.valor ?? 0))}</span>
                <button onClick={() => onEdit(x)} className="size-8 rounded-lg border flex items-center justify-center hover:bg-muted" aria-label="Editar"><Pencil className="size-3.5 text-muted-foreground" /></button>
                <button onClick={() => onDel(x)} className="size-8 rounded-lg border flex items-center justify-center hover:bg-destructive/10 text-destructive" aria-label="Apagar"><Trash2 className="size-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DespesaModal({ despesa, viveiros, onClose, onSaved }: {
  despesa: Despesa | null;
  viveiros: ViveiroOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [descricao, setDescricao] = useState(despesa?.descricao ?? "");
  const [categoria, setCategoria] = useState(despesa?.categoria ?? "");
  const [valor, setValor] = useState(despesa?.valor != null ? String(despesa.valor) : "");
  const [data, setData] = useState(despesa?.data_despesa ?? todayLocal());
  const [rateio, setRateio] = useState<"todos" | "individual">(despesa?.rateio === "individual" ? "individual" : "todos");
  const [viveiroIds, setViveiroIds] = useState<string[]>(despesa?.viveiro_id ? [despesa.viveiro_id] : []);
  const [observacao, setObservacao] = useState(despesa?.observacao ?? "");
  const [saving, setSaving] = useState(false);

  function toggleViveiro(id: string) {
    setViveiroIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!descricao.trim() || !valor) { toast.error("Preencha descrição e valor."); return; }
    if (rateio === "individual" && viveiroIds.length === 0) { toast.error("Selecione pelo menos um viveiro."); return; }
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const userId = user.user?.id;
    if (!userId) { toast.error("Sessão expirada."); setSaving(false); return; }
    const base = { user_id: userId, descricao: descricao.trim(), categoria: categoria.trim() || null, valor: Number(valor), data_despesa: data, observacao: observacao.trim() || null };
    let error: { message: string } | null = null;
    if (despesa) {
      const payload = { ...base, rateio, viveiro_id: rateio === "individual" ? (viveiroIds[0] ?? null) : null };
      const res = await supabase.from("despesas_gerais").update(payload).eq("id", despesa.id);
      error = res.error;
    } else if (rateio === "todos") {
      const res = await supabase.from("despesas_gerais").insert({ ...base, rateio: "todos", viveiro_id: null });
      error = res.error;
    } else {
      const rows = viveiroIds.map((vid) => ({ ...base, rateio: "individual", viveiro_id: vid }));
      const res = await supabase.from("despesas_gerais").insert(rows);
      error = res.error;
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(despesa ? "Despesa atualizada" : "Despesa criada");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{despesa ? "Editar despesa" : "Nova despesa"}</h2>
          <button onClick={onClose} className="size-9 rounded-lg hover:bg-muted inline-flex items-center justify-center"><X className="size-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Descrição">
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background" placeholder="Ex: Energia, manutenção..." autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background" />
            </Field>
            <Field label="Data">
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background" />
            </Field>
          </div>
          <Field label="Categoria (opcional)">
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background" placeholder="Ex: energia, manutenção, combustível..." />
          </Field>
          <Field label="Destino">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              <button type="button" onClick={() => { setRateio("todos"); setViveiroIds([]); }} className={`py-2 px-2 rounded-lg border text-xs font-bold text-left truncate ${rateio === "todos" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted text-muted-foreground"}`}>🔄 Todos</button>
              {viveiros.map((v) => {
                const checked = rateio === "individual" && viveiroIds.includes(v.id);
                return (
                  <button key={v.id} type="button" onClick={() => { if (rateio !== "individual") setRateio("individual"); toggleViveiro(v.id); }} className={`py-2 px-2 rounded-lg border text-xs font-semibold text-left truncate ${checked ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted text-muted-foreground"}`}>{checked ? "✓ " : ""}{v.nome}</button>
                );
              })}
            </div>
            {viveiros.length === 0 && <p className="text-xs text-muted-foreground mt-1">Nenhum viveiro cadastrado.</p>}
            {!despesa && rateio === "individual" && viveiroIds.length > 1 && (
              <p className="text-xs text-muted-foreground mt-1">Será criada uma despesa para cada viveiro selecionado.</p>
            )}
          </Field>
          <Field label="Observação (opcional)">
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background min-h-[60px]" />
          </Field>
          <button type="submit" disabled={saving} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">{saving ? "Salvando..." : "Salvar"}</button>
        </form>
      </div>
    </div>
  );
}
