import { todayLocal } from "@/lib/date";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Pencil, X, ClipboardList, Scale, TrendingUp, TrendingDown, ArrowRight, FileDown, Printer, Calendar as CalendarIcon, Megaphone, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { sortByViveiroNome } from "@/lib/sort";
import { Calculadora } from "@/components/Calculadora";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";
import { usePwConfig } from "@/lib/password-config";
import { PasswordLock } from "@/components/PasswordLock";
import { parseProdutoEmbalagem, quantidadeEmKg } from "@/lib/embalagem";
import { BtnTutorial } from "@/components/BtnTutorial";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Início — Viveiros" }] }),
  component: Dashboard,
});

type ViveiroOpt = { id: string; nome: string };

type Lanc = {
  id: string;
  viveiro_id: string;
  data_lancamento: string;
  produto_nome: string;
  quantidade: number;
  unidade: string;
  tipo: string;
  preco_unidade: number | null;
  custo_total: number | null;
  viveiros: { nome: string } | { nome: string }[] | null;
};

function relName(rel: { nome: string } | { nome: string }[] | null | undefined): string {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.nome ?? "";
  return rel.nome ?? "";
}

// Dias de cultivo desde a data de povoamento (YYYY-MM-DD)
function diasCultivoDe(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000));
}

// Formata "2026-08-17" como "17/08"
function fmtDiaMes(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}` : iso;
}

// Adivinha o tipo do insumo pelo nome do produto, pra não precisar escolher de novo
function guessTipoInsumo(nome: string): "racao" | "probiotico" | "medicamento" | "fertilizante" | "outro" | null {
  const n = (nome || "").toLowerCase();
  if (/(prob[ií]ot|probiot|bacter|lactob|bacillus|prob\b)/.test(n)) return "probiotico";
  if (/(ra[çc][aã]o|racao|alimento|feed|farelo)/.test(n)) return "racao";
  if (/(medic|rem[ée]dio|antibi[óo]t|florfenic|oxitetra|vitamina|premix)/.test(n)) return "medicamento";
  if (/(fertil|adubo|calc[áa]rio|calcario|[óo]xido|oxido|cal\b|dolomita|ureia|ur[ée]ia|melaço|melaco|silicato)/.test(n)) return "fertilizante";
  return null;
}

function AvisosDashboard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const pwCfg = usePwConfig(user?.id);
  const [novoTexto, setNovoTexto] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: avisos = [] } = useQuery({
    queryKey: ["avisos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avisos")
        .select("id, texto, ordem, created_at")
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; texto: string; ordem: number; created_at: string }[];
    },
  });

  const addMut = useMutation({
    mutationFn: async (texto: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada.");
      const maxOrdem = avisos.length > 0 ? Math.max(...avisos.map((a) => a.ordem)) : -1;
      const { error } = await supabase.from("avisos").insert({
        user_id: u.user.id,
        texto,
        ordem: maxOrdem + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aviso adicionado!");
      setNovoTexto("");
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["avisos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderMut = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: "up" | "down" }) => {
      const idx = avisos.findIndex((a) => a.id === id);
      if (idx === -1) return;
      if (dir === "up" && idx === 0) return;
      if (dir === "down" && idx === avisos.length - 1) return;
      const other = dir === "up" ? avisos[idx - 1] : avisos[idx + 1];
      const { error: e1 } = await supabase.from("avisos").update({ ordem: other.ordem }).eq("id", id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("avisos").update({ ordem: avisos[idx].ordem }).eq("id", other.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avisos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("avisos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aviso removido");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["avisos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleDelete(id: string) {
    if (pwCfg.enabled && pwCfg.pin) {
      setDeleteTarget(id);
    } else {
      if (confirm("Remover este aviso?")) delMut.mutate(id);
    }
  }

  return (
    <section className="rounded-2xl border bg-amber-500/5 border-amber-500/20 p-4 space-y-3 shadow-sm">
      {deleteTarget && pwCfg.enabled && pwCfg.pin && (
        <PasswordLock
          pin={pwCfg.pin}
          onUnlock={() => {
            delMut.mutate(deleteTarget);
          }}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center">
            <Megaphone className="size-4" />
          </div>
          <h2 className="text-sm font-bold text-foreground">
            Avisos {avisos.length > 0 && <span className="text-amber-600 font-black ml-1">({avisos.length})</span>}
          </h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen((v) => !v)}
          className="h-8 gap-1.5 rounded-xl border-amber-500/30 text-amber-700 text-xs font-bold hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
        >
          <Plus className="size-3.5" /> {addOpen ? "Fechar" : "Novo Aviso"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Importante: ao marcar a setinha de baixo uma vez, o aviso desce uma ordem. Marque várias vezes para descer até onde quiser.
        A exclusão de avisos exige senha se o bloqueio estiver ativo.
      </p>

      {addOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (novoTexto.trim()) addMut.mutate(novoTexto.trim());
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            value={novoTexto}
            onChange={(e) => setNovoTexto(e.target.value)}
            className="app-input flex-1 h-10 text-sm"
            placeholder="Escreva o aviso..."
          />
          <Button
            type="submit"
            disabled={!novoTexto.trim() || addMut.isPending}
            className="h-10 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm"
          >
            {addMut.isPending ? "..." : "Salvar"}
          </Button>
        </form>
      )}

      {avisos.length > 0 ? (
        <ul className="space-y-2">
          {avisos.map((a, idx) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-amber-500/8 border border-amber-500/15 text-sm"
            >
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-amber-600 mt-0.5 shrink-0">⚠️</span>
                <p className="text-foreground font-medium whitespace-pre-wrap break-words">{a.texto}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => reorderMut.mutate({ id: a.id, dir: "up" })}
                  disabled={idx === 0}
                  className="size-7 rounded-lg text-muted-foreground hover:bg-muted flex items-center justify-center disabled:opacity-30"
                  title="Subir"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => reorderMut.mutate({ id: a.id, dir: "down" })}
                  disabled={idx === avisos.length - 1}
                  className="size-7 rounded-lg text-muted-foreground hover:bg-muted flex items-center justify-center disabled:opacity-30"
                  title="Descer"
                >
                  <ChevronDown className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  className="size-7 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                  title={pwCfg.enabled ? "Excluir (requer senha)" : "Excluir"}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        !addOpen && (
          <div className="p-3 rounded-xl bg-muted/30 border border-dashed text-center text-xs text-muted-foreground">
            Nenhum aviso cadastrado. Clique em "Novo Aviso" para adicionar.
          </div>
        )
      )}
    </section>
  );
}

function Dashboard() {
  const qc = useQueryClient();

  const [viveiroId, setViveiroId] = useState("");
  const [selectedViveiros, setSelectedViveiros] = useState<Set<string>>(new Set());
  const [data, setData] = useState(todayLocal());
  const [produtoId, setProdutoId] = useState("");
  const [produto, setProduto] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [valor, setValor] = useState("");
  const [unidadeLancamento, setUnidadeLancamento] = useState("kg");
  const [embInfo, setEmbInfo] = useState<ReturnType<typeof parseProdutoEmbalagem> | null>(null);
  const [tipoLancamento, setTipoLancamento] = useState("racao");
  const [editing, setEditing] = useState<Lanc | null>(null);

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

  const { data: produtosList = [] } = useQuery({
    queryKey: ["produtos", "dashboard-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, unidade, preco_unidade, ordem")
        .order("ordem", { ascending: true, nullsFirst: false })
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; unidade: string; preco_unidade: number | null; ordem: number | null }[];
    },
  });

  const { data: ultimos = [], isLoading } = useQuery({
    queryKey: ["dashboard", "ultimos-lancamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select(
          "id, viveiro_id, data_lancamento, produto_nome, quantidade, unidade, tipo, preco_unidade, custo_total, viveiros(nome)",
        )
        .eq("data_lancamento", todayLocal())
        .order("data_lancamento", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      return (data ?? []) as Lanc[];
    },
  });

  const produtoSelecionado = produtosList.find((p) => p.id === produtoId);
  const precoCadastrado = produtoSelecionado?.preco_unidade ?? null;
  const valorIsAuto = precoCadastrado != null;
  const qNum = Number(quantidade.replace(",", ".")) || 0;
  const unitNum = valorIsAuto
    ? Number(precoCadastrado)
    : valor
      ? Number(valor.replace(",", "."))
      : 0;
  const totalCalc = unitNum > 0 && qNum > 0
    ? unitNum * qNum * (embInfo?.temEmbalagem && embInfo.pesoEmbalagem && unidadeLancamento === embInfo.tipoEmbalagem ? embInfo.pesoEmbalagem : 1)
      / (unidadeLancamento === "g" ? 1000 : 1)
    : 0;

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada.");
      if (!viveiroId && selectedViveiros.size === 0) throw new Error("Escolha um viveiro.");
      if (!produto.trim()) throw new Error("Informe o nome da ração.");
      const q = Number(quantidade.replace(",", "."));
      if (!q || q <= 0) throw new Error("Informe a quantidade.");
      const unit = valorIsAuto
        ? Number(precoCadastrado)
        : valor
          ? Number(valor.replace(",", "."))
          : null;
      if (unit != null && Number.isNaN(unit)) throw new Error("Valor inválido.");
      const total = unit != null
        ? unit * q * (embInfo?.temEmbalagem && embInfo.pesoEmbalagem && unidadeLancamento === embInfo.tipoEmbalagem ? embInfo.pesoEmbalagem : 1)
          / (unidadeLancamento === "g" ? 1000 : 1)
        : null;
      let linkedProdutoId: string | null = null;
      if (produtoSelecionado && !produtoSelecionado.id.startsWith("hist:")) {
        linkedProdutoId = produtoSelecionado.id;
      } else {
        const found = produtosList.find(
          (p) => !p.id.startsWith("hist:") && p.nome.toLowerCase().trim() === produto.trim().toLowerCase()
        );
        if (found) linkedProdutoId = found.id;
      }

      const targets = selectedViveiros.size > 0 ? Array.from(selectedViveiros) : [viveiroId];
      for (const targetId of targets) {
        const { error } = await supabase.from("lancamentos").insert({
          user_id: userId,
          viveiro_id: targetId,
          produto_id: linkedProdutoId,
          data_lancamento: data,
          produto_nome: produto.trim(),
          quantidade: q,
          unidade: unidadeLancamento,
          tipo: tipoLancamento,
          preco_unidade: unit,
          custo_total: total ?? 0,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Lançamento salvo");
      setProdutoId("");
      setProduto("");
      setQuantidade("");
      setValor("");
      setViveiroId("");
      setSelectedViveiros(new Set());
      setData(todayLocal());
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalHoje = useMemo(() => {
    const hoje = todayLocal();
    return ultimos
      .filter((l) => l.data_lancamento === hoje)
      .reduce((s, l) => s + (quantidadeEmKg(l.unidade, Number(l.quantidade ?? 0)) ?? 0), 0);
  }, [ultimos]);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  async function handleExportPdf() {
    try {
      setIsGeneratingPdf(true);
      const hoje = todayLocal();
      const ontemDate = new Date();
      ontemDate.setDate(ontemDate.getDate() - 1);
      const ontem = ymd(ontemDate);
      const anteDate = new Date();
      anteDate.setDate(anteDate.getDate() - 2);
      const anteontem = ymd(anteDate);

      const [vivRes, racRes, bioRes, detRes] = await Promise.all([
        supabase.from("viveiros").select("id, nome, status, data_povoamento, qtd_povoada, biomassa_manual"),
        supabase.from("lancamentos")
          .select("viveiro_id, data_lancamento, quantidade, unidade, custo_total, preco_unidade, produtos(preco_unidade, unidade)")
          .eq("tipo", "racao"),
        supabase.from("biometrias")
          .select("viveiro_id, peso_medio_g, sobrevivencia_percent, data_biometria")
          .order("data_biometria", { ascending: false }),
        supabase.from("lancamentos")
          .select("id, viveiro_id, data_lancamento, produto_nome, quantidade, unidade, tipo, custo_total, viveiros(nome)")
          .in("data_lancamento", [hoje, ontem, anteontem])
          .order("data_lancamento", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      type Viv = { id: string; nome: string; status: string | null; data_povoamento: string | null; qtd_povoada: number | null; biomassa_manual: number | null };
      type Rac = { viveiro_id: string; data_lancamento: string; quantidade: number | null; unidade: string | null; custo_total: number | null; preco_unidade: number | null; produtos: { preco_unidade: number | null; unidade: string | null } | { preco_unidade: number | null; unidade: string | null }[] | null };
      type Bio = { viveiro_id: string; peso_medio_g: number; sobrevivencia_percent: number | null; data_biometria: string };
      const vivs = (vivRes.data ?? []) as Viv[];
      const racs = (racRes.data ?? []) as Rac[];
      const bios = (bioRes.data ?? []) as Bio[];

      const bioMap = new Map<string, Bio>();
      for (const b of bios) if (!bioMap.has(b.viveiro_id)) bioMap.set(b.viveiro_id, b);

      const agg = new Map<string, { hoje: number; ontem: number; acum: number; custo: number }>();
      for (const l of racs) {
        const prod = Array.isArray(l.produtos) ? l.produtos[0] : l.produtos;
        const kg = quantidadeEmKg(l.unidade, Number(l.quantidade ?? 0), prod?.unidade) ?? Number(l.quantidade ?? 0);
        let custo = 0;
        if (l.custo_total != null) custo = Number(l.custo_total);
        else if (prod?.preco_unidade != null) custo = Number(prod.preco_unidade) * kg;
        else if (l.preco_unidade != null) custo = Number(l.preco_unidade) * Number(l.quantidade ?? 0);
        const cur = agg.get(l.viveiro_id) ?? { hoje: 0, ontem: 0, acum: 0, custo: 0 };
        cur.acum += kg;
        cur.custo += custo;
        if (l.data_lancamento === hoje) cur.hoje += kg;
        else if (l.data_lancamento === ontem) cur.ontem += kg;
        agg.set(l.viveiro_id, cur);
      }

      const rows = vivs.map((v) => {
        const a = agg.get(v.id) ?? { hoje: 0, ontem: 0, acum: 0, custo: 0 };
        const b = bioMap.get(v.id);
        const sobrev = b?.sobrevivencia_percent != null ? Number(b.sobrevivencia_percent) / 100 : 1;
        const vivos = Number(v.qtd_povoada ?? 0) * sobrev;
        const biomassa = v.biomassa_manual != null ? Number(v.biomassa_manual) : (Number(b?.peso_medio_g ?? 0) * vivos) / 1000;
        const fca = a.acum > 0 && biomassa > 0 ? a.acum / biomassa : 0;
        return {
          nome: v.nome,
          ativo: v.status === "ativo",
          dias: diasCultivoDe(v.data_povoamento),
          povoada: v.qtd_povoada != null ? Number(v.qtd_povoada) : null,
          hoje: a.hoje,
          ontem: a.ontem,
          acum: a.acum,
          custo: a.custo,
          peso: b?.peso_medio_g != null ? Number(b.peso_medio_g) : null,
          biomassa,
          fca,
        };
      });
      const sorted = sortByViveiroNome(rows, (r) => r.nome);
      const detalhe = (detRes.data ?? []) as Lanc[];

      await gerarPdfInicio(detalhe, { hoje, ontem, rows: sorted });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-primary to-emerald-700 p-5 text-white shadow-lg shadow-emerald-500/20">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
          <div>
            <h1 className="text-xl font-black tracking-tight">Lançamento Rápido</h1>
            <p className="text-sm text-white/80 mt-0.5">Registre insumos nos viveiros</p>
          </div>
          <div className="flex items-center gap-2">
            <BtnTutorial videoId="D7GysoMWd-w" label="Início" />
            <div className="text-right shrink-0 bg-white/20 backdrop-blur px-4 py-2 rounded-xl">
              <span className="text-[10px] font-bold text-white/70 block uppercase">Total Hoje</span>
              <span className="text-xl font-black text-white tabular-nums">
                {totalHoje.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg
              </span>
            </div>
            <button type="button" onClick={handleExportPdf} disabled={isGeneratingPdf}
              className="h-10 px-3 rounded-xl bg-white/20 backdrop-blur hover:bg-white/30 font-bold text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 text-white">
              <FileDown className="size-4" /> {isGeneratingPdf ? "Gerando..." : "PDF"}
            </button>
          </div>
        </div>
      </div>

      <AvisosDashboard />

      {viveiros.length === 0 ? (
        <div className="p-8 rounded-2xl border-2 border-dashed text-center space-y-3">
          <p className="font-semibold text-base">Nenhum viveiro cadastrado</p>
          <p className="text-sm text-muted-foreground">Cadastre os viveiros primeiro para iniciar o lançamento.</p>
          <Link to="/viveiros" className="inline-flex h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow">
            Cadastrar Viveiros
          </Link>
        </div>
      ) : (
        /* Form Principal */
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate();
          }}
          className="space-y-4 rounded-2xl bg-card border p-5 shadow-sm"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">Viveiro(s)</label>
              <button type="button" onClick={() => {
                if (selectedViveiros.size === viveiros.length) {
                  setSelectedViveiros(new Set());
                  setViveiroId("");
                } else {
                  setSelectedViveiros(new Set(viveiros.map(v => v.id)));
                  setViveiroId("");
                }
              }} className="text-[11px] font-bold text-primary hover:underline">
                {selectedViveiros.size === viveiros.length ? "Limpar todos" : "Selecionar todos"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {viveiros.map((v) => {
                const isSelected = selectedViveiros.has(v.id) || (selectedViveiros.size === 0 && v.id === viveiroId);
                return (
                  <button key={v.id} type="button" onClick={() => {
                    const n = new Set(selectedViveiros);
                    if (n.has(v.id)) {
                      n.delete(v.id);
                      if (n.size === 0) setViveiroId("");
                    } else {
                      if (n.size === 0 && viveiroId && viveiroId !== v.id) n.add(viveiroId);
                      n.add(v.id);
                    }
                    setSelectedViveiros(n);
                    if (n.size === 1) setViveiroId(Array.from(n)[0]);
                    if (n.size === 0) setViveiroId("");
                  }} className={`py-2 px-3 rounded-xl border text-sm font-semibold text-left truncate transition active:scale-95 ${isSelected ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted text-muted-foreground"}`}>
                    {isSelected ? "✓ " : ""}{v.nome}
                  </button>
                );
              })}
            </div>
            {selectedViveiros.size > 1 && (
              <p className="text-[11px] text-muted-foreground">{selectedViveiros.size} viveiros selecionados</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground block">Insumo / Produto</label>
            <select
              value={produtoId}
              onChange={(e) => {
                const id = e.target.value;
                setProdutoId(id);
                const p = produtosList.find((x) => x.id === id);
                if (p) {
                  setProduto(p.nome);
                  const emb = parseProdutoEmbalagem(p.unidade);
                  setEmbInfo(emb);
                  setUnidadeLancamento(emb.unidadeBase || "kg");
                  setTipoLancamento(guessTipoInsumo(p.nome) ?? "racao");
                } else {
                  setProduto("");
                }
              }}
              className="app-input text-base h-12 font-medium"
              required
            >
              <option value="">{produtosList.length === 0 ? "Carregando produtos..." : "Selecione o insumo..."}</option>
              {produtosList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.preco_unidade != null ? ` — R$ ${Number(p.preco_unidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/kg` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground block">Quantidade</label>
              <div className="flex gap-2">
                <input
                  required
                  type="text"
                  inputMode="decimal"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value.replace(/[^0-9.,]/g, ""))}
                  className="app-input flex-1 min-w-0 h-12 text-lg font-bold"
                  placeholder="Ex: 50"
                />
                {embInfo?.temEmbalagem ? (
                  <select
                    value={unidadeLancamento}
                    onChange={(e) => setUnidadeLancamento(e.target.value)}
                    className="app-input w-28 h-12 font-semibold text-sm"
                  >
                    {Array.from(new Set([
                      embInfo.tipoEmbalagem,
                      embInfo.unidadeBase,
                      "kg",
                      "g",
                      ...(embInfo.unidadeBase === "litro" ? ["litro", "ml"] : []),
                    ].filter(Boolean) as string[])).map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={unidadeLancamento}
                    onChange={(e) => setUnidadeLancamento(e.target.value)}
                    className="app-input w-28 h-12 font-semibold text-sm"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="saco">saco</option>
                    <option value="litro">litro</option>
                    <option value="un">un</option>
                    <option value="ml">ml</option>
                  </select>
                )}
              </div>
              {embInfo?.temEmbalagem && qNum > 0 && embInfo.pesoEmbalagem && unidadeLancamento === embInfo.tipoEmbalagem && (
                <p className="text-[11px] text-primary font-medium">
                  💡 {qNum} {embInfo.tipoEmbalagem}(s) = {qNum * embInfo.pesoEmbalagem} {embInfo.unidadeBase} no total
                </p>
              )}
              {unidadeLancamento === "g" && qNum > 0 && (
                <p className="text-[11px] text-primary font-medium">
                  💡 {qNum}g = {(qNum / 1000).toFixed(3)} kg
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground block">Data</label>
              <input
                required
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="app-input h-12 w-full"
              />
            </div>
          </div>

          {totalCalc > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-xl flex items-center justify-between">
              <span className="text-emerald-700 font-semibold text-sm">Custo estimado</span>
              <span className="font-black text-emerald-700 tabular-nums text-xl">
                {totalCalc.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
          )}

          <button
            disabled={saveMut.isPending}
            type="submit"
            className="w-full h-13 rounded-xl bg-emerald-600 text-white font-bold text-base shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saveMut.isPending ? "Lançando..." : "🌾 Confirmar Lançamento"}
          </button>
        </form>
      )}

      {/* Painel Comparativo Ração Hoje x Ontem */}
      <RacaoHojeOntem />

      {/* Lançamentos de hoje e ontem */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-bold flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" /> Lançamentos de hoje ({ultimos.length})
          </h2>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Carregando lançamentos...</p>
        ) : ultimos.length === 0 ? (
          <div className="p-6 rounded-2xl border-2 border-dashed text-center text-sm text-muted-foreground">
            Nenhum lançamento hoje.
          </div>
        ) : (
          <div className="space-y-2">
            {ultimos.map((l, i) => {
              const isHoje = l.data_lancamento === todayLocal();
              const showHeader = i === 0 || ultimos[i - 1].data_lancamento !== l.data_lancamento;
              return (
                <div key={l.id} className="space-y-2">
                  {showHeader && (
                    <div className="flex items-center gap-2 pt-1 px-1">
                      <span className={`text-[11px] font-bold uppercase tracking-wide ${isHoje ? "text-primary" : "text-muted-foreground"}`}>{isHoje ? "Hoje" : "Ontem"}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtDiaMes(l.data_lancamento)}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-card border gap-3 shadow-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-foreground text-sm truncate">{relName(l.viveiros) || "Viveiro"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {l.produto_nome}
                        <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                          {l.tipo === "racao" ? "🌾" : l.tipo === "probiotico" ? "🧪" : l.tipo === "medicamento" ? "💊" : l.tipo === "fertilizante" ? "🌱" : "📦"}
                        </span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-emerald-600 tabular-nums leading-tight">
                        {Number(l.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {l.unidade}
                      </p>
                      {l.custo_total != null && Number(l.custo_total) > 0 && (
                        <p className="text-sm font-bold text-foreground tabular-nums">
                          {Number(l.custo_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => setEditing(l)}
                        className="size-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary flex items-center justify-center"
                        aria-label="Editar"
                        title="Editar"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Apagar lançamento de ${l.quantidade}kg no ${relName(l.viveiros)}?`)) delMut.mutate(l.id);
                        }}
                        className="size-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                        aria-label="Apagar"
                        title="Apagar"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editing && (
        <EditLancModal
          lanc={editing}
          viveiros={viveiros}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            qc.invalidateQueries({ queryKey: ["lancamentos"] });
          }}
        />
      )}
    </div>
  );
}

function EditLancModal({
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
  const [viveiroId, setViveiroId] = useState(lanc.viveiro_id);
  const [data, setData] = useState(lanc.data_lancamento);
  const [produto, setProduto] = useState(lanc.produto_nome);
  const [quantidade, setQuantidade] = useState(String(lanc.quantidade ?? ""));
  const [editTipo, setEditTipo] = useState(lanc.tipo ?? "racao");
  const [valor, setValor] = useState(lanc.custo_total != null ? String(lanc.custo_total) : "");

  const mut = useMutation({
    mutationFn: async () => {
      const q = Number(quantidade);
      if (!produto.trim() || q <= 0) throw new Error("Preencha produto e quantidade.");
      const { error } = await supabase
        .from("lancamentos")
        .update({
          viveiro_id: viveiroId,
          data_lancamento: data,
          produto_nome: produto.trim(),
          quantidade: q,
          tipo: editTipo,
          custo_total: valor ? Number(valor.replace(",", ".")) : null,
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
          <Field label="Viveiro">
            <select
              required
              value={viveiroId}
              onChange={(e) => setViveiroId(e.target.value)}
              className="app-input"
            >
              {viveiros.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input required type="date" value={data} onChange={(e) => setData(e.target.value)} className="app-input" />
          </Field>
          <Field label="Insumo">
            <input required value={produto} onChange={(e) => setProduto(e.target.value)} className="app-input" />
          </Field>
          <Field label="Tipo">
            <select value={editTipo} onChange={(e) => setEditTipo(e.target.value)} className="app-input font-semibold">
              <option value="racao">🌾 Ração</option>
              <option value="probiotico">🧪 Probiótico</option>
              <option value="medicamento">💊 Medicamento</option>
              <option value="fertilizante">🌱 Fertilizante</option>
              <option value="outro">📦 Outro</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantidade (kg)">
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="app-input"
              />
            </Field>
            <Field label="Valor (R$)">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9.,]*"
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="app-input"
              />
            </Field>
          </div>
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

type PdfRow = {
  nome: string; ativo: boolean; dias: number | null; povoada: number | null;
  hoje: number; ontem: number; acum: number; custo: number; peso: number | null; biomassa: number; fca: number;
};

async function gerarPdfInicio(
  ultimosHoje: Lanc[],
  dados: { hoje: string; ontem: string; rows: PdfRow[] }
) {
  const [pdfModule, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const jsPDF = pdfModule.default;
  const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const dataHojeStr = new Date().toLocaleDateString("pt-BR");
  const horaStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const n = (x: number, d = 1) => x.toLocaleString("pt-BR", { maximumFractionDigits: d });
  const brl = (x: number) => `R$ ${x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rows = dados.rows;
  const tHoje = rows.reduce((s, r) => s + r.hoje, 0);
  const tOntem = rows.reduce((s, r) => s + r.ontem, 0);
  const tAcum = rows.reduce((s, r) => s + r.acum, 0);
  const tCusto = rows.reduce((s, r) => s + r.custo, 0);
  const nAtivos = rows.filter((r) => r.ativo).length;
  const diffTotal = tHoje - tOntem;
  const pctTotal = tOntem > 0 ? (diffTotal / tOntem) * 100 : 0;

  // ===== Cabeçalho =====
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, 210, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("RELATÓRIO DE RAÇÃO & ALIMENTAÇÃO", 14, 11);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Emitido em ${dataHojeStr} às ${horaStr}  ·  ${nAtivos} viveiro(s) ativo(s) de ${rows.length}`, 14, 18);

  // ===== Resumo (4 caixas) =====
  const boxes: Array<[string, string, [number, number, number]]> = [
    ["RAÇÃO HOJE", `${n(tHoje)} kg`, [16, 185, 129]],
    ["RAÇÃO ONTEM", `${n(tOntem)} kg`, [30, 41, 59]],
    ["RAÇÃO ACUMULADA", `${n(tAcum)} kg`, [37, 99, 235]],
    ["CUSTO ACUMULADO", brl(tCusto), [217, 119, 6]],
  ];
  const bw = 45, bx0 = 14, gap = 2, by = 30;
  boxes.forEach(([label, val, color], i) => {
    const x = bx0 + i * (bw + gap);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(x, by, bw, 17, 2, 2, "F");
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.text(label, x + 3, by + 6);
    doc.setFontSize(11);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(val, x + 3, by + 13);
  });

  // Linha de variação
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(diffTotal >= 0 ? 16 : 220, diffTotal >= 0 ? 160 : 38, diffTotal >= 0 ? 120 : 38);
  doc.text(`Variação hoje x ontem: ${diffTotal >= 0 ? "+" : ""}${n(diffTotal)} kg (${pctTotal >= 0 ? "+" : ""}${pctTotal.toFixed(1)}%)`, 14, 54);

  let currentY = 60;

  // ===== Tabela 1: Panorama por viveiro =====
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("PANORAMA POR VIVEIRO", 14, currentY);

  autoTable(doc, {
    startY: currentY + 2.5,
    head: [["Viveiro", "Dias", "Povoada", "Hoje", "Ontem", "Acum.", "Custo", "Peso", "FCA"]],
    body: rows.map((r) => [
      r.nome + (r.ativo ? "" : " (inativo)"),
      r.dias != null ? String(r.dias) : "—",
      r.povoada != null ? n(r.povoada, 0) : "—",
      n(r.hoje),
      n(r.ontem),
      n(r.acum),
      r.custo > 0 ? brl(r.custo) : "—",
      r.peso != null ? `${n(r.peso, 1)} g` : "—",
      r.fca > 0 ? n(r.fca, 2) : "—",
    ]),
    foot: [["TOTAL", "", "", n(tHoje), n(tOntem), n(tAcum), tCusto > 0 ? brl(tCusto) : "—", "", ""]],
    styles: { fontSize: 7.5, cellPadding: 1.6 },
    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
    footStyles: { fillColor: [226, 232, 240], textColor: [30, 41, 59], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" },
      4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
      7: { halign: "right" }, 8: { halign: "center" },
    },
    margin: { left: 14, right: 14 },
  });
  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Legenda das colunas
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(120, 130, 145);
  doc.text("Quantidades em kg. Peso = último peso médio da biometria. FCA = ração acumulada ÷ biomassa.", 14, currentY - 4);

  // ===== Tabela 2: Lançamentos dos últimos 3 dias =====
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(`LANÇAMENTOS DOS ÚLTIMOS 3 DIAS (${ultimosHoje.length})`, 14, currentY);

  if (ultimosHoje.length === 0) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text("Nenhum lançamento nos últimos 3 dias.", 14, currentY + 6);
  } else {
    const diaLabel = (d: string) => (d === dados.hoje ? "Hoje" : d === dados.ontem ? "Ontem" : "Anteontem");
    autoTable(doc, {
      startY: currentY + 2.5,
      head: [["Dia", "Data", "Viveiro", "Produto", "Tipo", "Quantidade", "Custo"]],
      body: ultimosHoje.map((l) => {
        const [y, m, d] = l.data_lancamento.split("-");
        return [
          diaLabel(l.data_lancamento),
          `${d}/${m}`,
          relName(l.viveiros) || "—",
          l.produto_nome,
          l.tipo === "racao" ? "Ração" : l.tipo === "probiotico" ? "Probiótico" : l.tipo === "medicamento" ? "Medicamento" : l.tipo === "fertilizante" ? "Fertilizante" : "Outro",
          `${Number(l.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${l.unidade ?? "kg"}`,
          l.custo_total != null && Number(l.custo_total) > 0 ? brl(Number(l.custo_total)) : "—",
        ];
      }),
      styles: { fontSize: 7.5, cellPadding: 1.6 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 5: { halign: "right" }, 6: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
  }

  // ===== Rodapé =====
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Viveiros App · ${dataHojeStr} às ${horaStr}`, 14, 289);
    doc.text(`Página ${i} de ${pageCount}`, 196, 289, { align: "right" });
  }

  // Download (funciona no iPhone: doc.save usa link de download, não popup)
  const nome = `relatorio-inicio-${dataHojeStr.replace(/\//g, "-")}.pdf`;
  doc.save(nome);
  toast.success("PDF gerado!");
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function RacaoHojeOntem() {
  const qc = useQueryClient();
  const hoje = todayLocal();
  const d1 = new Date(); d1.setDate(d1.getDate() - 1); const ontem = ymd(d1);
  const d2 = new Date(); d2.setDate(d2.getDate() - 2); const anteontem = ymd(d2);
  const [comparacaoDate, setComparacaoDate] = useState<Date>(d1);
  const comparacaoStr = ymd(comparacaoDate);
  const [calOpen, setCalOpen] = useState(false);
  const hojeDate = new Date();

  const datas = [hoje, ontem, anteontem];
  const labels = ["Hoje", "Ontem", "Anteontem"];

  const { data: linhas = [] } = useQuery({
    queryKey: ["dashboard", "racao-hoje-ontem", hoje, anteontem],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("id, viveiro_id, quantidade, data_lancamento, produto_nome, unidade, custo_total, viveiros(nome)")
        .in("data_lancamento", [hoje, ontem, anteontem]);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; viveiro_id: string; quantidade: number | null; data_lancamento: string; produto_nome: string; unidade: string; custo_total: number | null; viveiros: { nome: string } | { nome: string }[] | null }>;
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => { await supabase.from("lancamentos").delete().eq("id", id); },
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const map = new Map<string, { nome: string; d0: number; d1: number; d2: number }>();
    const totals = [0, 0, 0];
    for (const l of linhas) {
      const nome = relName(l.viveiros) || "Sem viveiro";
      const cur = map.get(l.viveiro_id) ?? { nome, d0: 0, d1: 0, d2: 0 };
      const q = Number(l.quantidade ?? 0);
      const idx = datas.indexOf(l.data_lancamento);
      if (idx >= 0) { if (idx === 0) cur.d0 += q; else if (idx === 1) cur.d1 += q; else cur.d2 += q; totals[idx] += q; }
      map.set(l.viveiro_id, cur);
    }
    return { totals, porViveiro: sortByViveiroNome(Array.from(map.values()), v => v.nome) };
  }, [linhas]);

  if (stats.totals[0] === 0 && stats.totals[1] === 0 && stats.totals[2] === 0) return null;

  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <section className="rounded-2xl border bg-card p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Scale className="size-4" /></div>
          <h2 className="text-sm font-bold text-foreground">Comparativo — Últimos 3 Dias</h2>
        </div>
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-xl border bg-background px-3 text-xs font-semibold"><CalendarIcon className="size-3.5 text-muted-foreground" />{format(comparacaoDate, "dd/MM/yyyy")}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar mode="single" selected={comparacaoDate} onSelect={(d) => { if (d) { setComparacaoDate(d); setCalOpen(false); } }} disabled={(d) => d > hojeDate} locale={ptBR} initialFocus />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {labels.map((label, i) => {
          const color = i === 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" : i === 1 ? "bg-muted/40 border" : "bg-muted/30 border";
          return (
            <div key={label} className={`rounded-xl p-2.5 ${color}`}>
              <span className="text-[10px] font-bold uppercase block">{label}</span>
              <span className="text-lg font-black tabular-nums">{fmt(stats.totals[i])} kg</span>
            </div>
          );
        })}
      </div>

      {stats.porViveiro.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Por Viveiro</p>
          {stats.porViveiro.map((v) => (
            <div key={v.nome} className="flex items-center justify-between text-xs rounded-xl bg-muted/30 p-2.5 border gap-1">
              <span className="font-semibold text-foreground truncate min-w-0 flex-1">{v.nome}</span>
              <span className="text-muted-foreground shrink-0">{fmt(v.d2)}</span>
              <ArrowRight className="size-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground shrink-0">{fmt(v.d1)}</span>
              <ArrowRight className="size-3 text-muted-foreground shrink-0" />
              <span className="font-bold text-emerald-600 shrink-0">{fmt(v.d0)}</span>
            </div>
          ))}
        </div>
      )}

      {linhas.length > 0 && (
        <div className="space-y-1 pt-1 border-t">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Últimos Lançamentos</p>
          {linhas.slice(0, 10).map((l) => (
            <div key={l.id} className="flex items-center justify-between text-xs rounded bg-muted/20 p-1.5 gap-1">
              <span className="text-muted-foreground shrink-0 w-16">{format(new Date(l.data_lancamento + "T00:00:00"), "dd/MM")}</span>
              <span className="font-medium truncate min-w-0 flex-1">{relName(l.viveiros)} · {l.produto_nome}</span>
              <span className="font-semibold shrink-0">{fmt(Number(l.quantidade ?? 0))} {l.unidade}</span>
              <Button size="icon" variant="ghost" className="size-6 shrink-0" onClick={() => { if (confirm("Apagar este lançamento?")) delMut.mutate(l.id); }} title="Apagar"><Trash2 className="size-3" /></Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type ProdutoRow = { id: string; nome: string; unidade: string; preco_unidade: number | null };

function CadastroGeral() {
  const qc = useQueryClient();
  const [novoNome, setNovoNome] = useState("");
  const [novaUnidade, setNovaUnidade] = useState("kg");
  const [novoPreco, setNovoPreco] = useState("");
  const [editRow, setEditRow] = useState<ProdutoRow | null>(null);

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["produtos", "cadastro-geral"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, unidade, preco_unidade")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ProdutoRow[];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada.");
      if (!novoNome.trim()) throw new Error("Informe o nome.");
      const preco = novoPreco ? Number(novoPreco.replace(",", ".")) : null;
      const { error } = await supabase.from("produtos").insert({
        user_id: userId,
        nome: novoNome.trim(),
        unidade: novaUnidade || "kg",
        preco_unidade: preco,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cadastrado");
      setNovoNome("");
      setNovoPreco("");
      qc.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updMut = useMutation({
    mutationFn: async (row: ProdutoRow) => {
      const { error } = await supabase
        .from("produtos")
        .update({
          nome: row.nome.trim(),
          unidade: row.unidade || "kg",
          preco_unidade: row.preco_unidade,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atualizado");
      setEditRow(null);
      qc.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-3 rounded-2xl bg-card border p-5">
      <h2 className="text-lg font-semibold">Cadastro geral</h2>
      <p className="text-xs text-muted-foreground">Produtos e valores para preenchimento automático.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addMut.mutate();
        }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2"
      >
        <input
          className="app-input col-span-2 sm:col-span-2"
          placeholder="Nome do produto"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          required
        />
        <select
          className="app-input"
          value={novaUnidade}
          onChange={(e) => setNovaUnidade(e.target.value)}
        >
          <option value="kg">kg</option>
          <option value="g">g</option>
          <option value="un">un</option>
          <option value="saco">saco</option>
          <option value="sacola">sacola</option>
          <option value="litro">litro</option>
        </select>
        <input
          className="app-input"
          placeholder="R$"
          inputMode="decimal"
          value={novoPreco}
          onChange={(e) => setNovoPreco(e.target.value.replace(/[^0-9.,]/g, ""))}
        />
        <button
          disabled={addMut.isPending}
          className="col-span-2 sm:col-span-4 h-10 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
        >
          {addMut.isPending ? "Salvando..." : "+ Cadastrar"}
        </button>
      </form>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : produtos.length === 0 ? (
        <div className="p-4 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground">
          Nenhum produto cadastrado.
        </div>
      ) : (
        <ul className="space-y-2">
          {produtos.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between p-3 rounded-xl bg-background border gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{p.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {p.preco_unidade != null
                    ? `${Number(p.preco_unidade).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} / ${p.unidade}`
                    : `— / ${p.unidade}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setEditRow(p)}
                  className="size-9 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary flex items-center justify-center"
                  aria-label="Editar"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Apagar "${p.nome}"?`)) delMut.mutate(p.id);
                  }}
                  className="size-9 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                  aria-label="Apagar"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editRow && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setEditRow(null)}
        >
          <div
            className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold">Editar produto</h3>
              <button
                onClick={() => setEditRow(null)}
                className="size-8 rounded-lg hover:bg-muted flex items-center justify-center"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updMut.mutate(editRow);
              }}
              className="p-4 space-y-3"
            >
              <Field label="Nome">
                <input
                  className="app-input"
                  value={editRow.nome}
                  onChange={(e) => setEditRow({ ...editRow, nome: e.target.value })}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Unidade">
                  <select
                    className="app-input"
                    value={editRow.unidade}
                    onChange={(e) => setEditRow({ ...editRow, unidade: e.target.value })}
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="un">un</option>
                    <option value="saco">saco</option>
                    <option value="sacola">sacola</option>
                    <option value="litro">litro</option>
                  </select>
                </Field>
                <Field label="Valor (R$)">
                  <input
                    className="app-input"
                    inputMode="decimal"
                    value={editRow.preco_unidade != null ? String(editRow.preco_unidade) : ""}
                    onChange={(e) =>
                      setEditRow({
                        ...editRow,
                        preco_unidade: e.target.value ? Number(e.target.value.replace(",", ".")) : null,
                      })
                    }
                  />
                </Field>
              </div>
              <button
                disabled={updMut.isPending}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
              >
                {updMut.isPending ? "Salvando..." : "Salvar"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}


