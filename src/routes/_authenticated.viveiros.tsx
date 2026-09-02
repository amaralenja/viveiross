import { todayLocal } from "@/lib/date";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Warehouse, Trash2, X, Utensils, ChevronRight, Pencil, CalendarDays, Share2, Ruler, History, FileDown, Printer, Lock, MessageCircle } from "lucide-react";
import { sortByViveiroNome } from "@/lib/sort";
import { quantidadeEmKg } from "@/lib/embalagem";
import { getMyAccessFn } from "@/lib/admin.functions";
import { BtnTutorial } from "@/components/BtnTutorial";

const VITAL_WPP = "https://wa.me/5588972968298?text=" + encodeURIComponent("Vital, preciso liberar mais viveiros no sistema");

export const Route = createFileRoute("/_authenticated/viveiros")({
  head: () => ({ meta: [{ title: "Viveiros" }] }),
  component: ViveirosPage,
});

type Fazenda = { id: string; nome: string; cidade: string | null };
type Viveiro = {
  id: string;
  nome: string;
  status: string;
  data_povoamento: string | null;
  data_preparacao: string | null;
  qtd_povoada: number | null;
  preco_milheiro: number | null;
  created_at?: string | null;
  fornecedor: string | null;
  biomassa_manual: number | null;
  fazendas: { nome: string } | { nome: string }[] | null;
};

function relName(rel: { nome: string } | { nome: string }[] | null | undefined): string {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.nome ?? "";
  return rel.nome ?? "";
}

function ViveirosPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [racaoViveiro, setRacaoViveiro] = useState<Viveiro | null>(null);
  const [historicoViveiro, setHistoricoViveiro] = useState<Viveiro | null>(null);
  const [editarViveiro, setEditarViveiro] = useState<Viveiro | null>(null);
  const [editarBiomassa, setEditarBiomassa] = useState<Viveiro | null>(null);
  const [biometriaViveiro, setBiometriaViveiro] = useState<Viveiro | null>(null);
  const [histBiometriaViveiro, setHistBiometriaViveiro] = useState<Viveiro | null>(null);

  const { data: fazendas = [] } = useQuery({
    queryKey: ["fazendas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fazendas")
        .select("id, nome, cidade")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Fazenda[];
    },
  });

  const { data: viveiros = [], isLoading } = useQuery({
    queryKey: ["viveiros"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, status, data_povoamento, data_preparacao, qtd_povoada, preco_milheiro, created_at, fornecedor, biomassa_manual, fazendas(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return sortByViveiroNome((data ?? []) as Viveiro[], (v) => v.nome);
    },
  });

  const getMyAccess = useServerFn(getMyAccessFn);
  const { data: acesso } = useQuery({ queryKey: ["my-access"], queryFn: () => getMyAccess(), staleTime: 60_000 });
  const viveiroLimit = acesso?.is_admin ? null : (acesso?.viveiro_limit ?? null);
  const bloqueados = useMemo(() => {
    const set = new Set<string>();
    if (viveiroLimit == null) return set;
    const ativos = viveiros
      .filter((v) => v.status === "ativo")
      .slice()
      .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
    ativos.slice(viveiroLimit).forEach((v) => set.add(v.id));
    return set;
  }, [viveiros, viveiroLimit]);

  const { data: totaisPorViveiro = { racao: {}, custo: {} } } = useQuery({
    queryKey: ["viveiros", "totais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("viveiro_id, quantidade, unidade, custo_total, preco_unidade, data_lancamento, produtos(preco_unidade, unidade)")
        .eq("tipo", "racao");
      if (error) throw error;
      const racao: Record<string, number> = {};
      const custo: Record<string, number> = {};
      for (const l of (data ?? []) as Array<{
        viveiro_id: string;
        quantidade: number | null;
        unidade: string | null;
        custo_total: number | null;
        preco_unidade: number | null;
        data_lancamento: string | null;
        produtos: { preco_unidade: number | null; unidade: string | null } | { preco_unidade: number | null; unidade: string | null }[] | null;
      }>) {
        const qtd = Number(l.quantidade ?? 0);
        const prod = Array.isArray(l.produtos) ? l.produtos[0] : l.produtos;
        const qtdKg = quantidadeEmKg(l.unidade, qtd, prod?.unidade) ?? qtd;
        racao[l.viveiro_id] = (racao[l.viveiro_id] ?? 0) + qtdKg;
        let valor: number | null = null;
        if (l.custo_total != null) {
          valor = Number(l.custo_total);
        } else if (prod?.preco_unidade != null) {
          // sem custo_total: estima com preço/kg do produto × quantidade em kg
          valor = Number(prod.preco_unidade) * qtdKg;
        } else if (l.preco_unidade != null) {
          valor = Number(l.preco_unidade) * qtd;
        }
        if (valor != null) {
          custo[l.viveiro_id] = (custo[l.viveiro_id] ?? 0) + valor;
        }
      }
      return { racao, custo };
    },
  });

  const racaoPorViveiro = totaisPorViveiro.racao ?? {};
  const custoPorViveiro = totaisPorViveiro.custo ?? {};

  const { data: receitasPorViveiro = {} } = useQuery({
    queryKey: ["viveiros", "receitas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("caixa_lancamentos")
        .select("viveiro_id, valor")
        .eq("tipo", "receita");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ viveiro_id: string | null; valor: number }>) {
        if (r.viveiro_id) map[r.viveiro_id] = (map[r.viveiro_id] ?? 0) + Number(r.valor ?? 0);
      }
      return map;
    },
  });
  const { data: despescasPorViveiro = {} } = useQuery({
    queryKey: ["viveiros", "despescas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("despescas")
        .select("viveiro_id, quantidade_kg");
      if (error) throw error;
      const map: Record<string, { kg: number; count: number }> = {};
      for (const d of (data ?? []) as Array<{ viveiro_id: string; quantidade_kg: number }>) {
        const cur = map[d.viveiro_id] ?? { kg: 0, count: 0 };
        cur.kg += Number(d.quantidade_kg ?? 0);
        cur.count += 1;
        map[d.viveiro_id] = cur;
      }
      return map;
    },
  });

  type BioItem = {
    id: string;
    viveiro_id: string;
    data_biometria: string;
    peso_medio_g: number;
    crescimento_semanal_g: number | null;
    sobrevivencia_percent: number | null;
  };
  const { data: biometriasPorViveiro = {} } = useQuery({
    queryKey: ["viveiros", "biometrias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("biometrias")
        .select("id, viveiro_id, data_biometria, peso_medio_g, crescimento_semanal_g, sobrevivencia_percent")
        .order("data_biometria", { ascending: false });
      if (error) throw error;
      const map: Record<string, BioItem[]> = {};
      for (const b of (data ?? []) as BioItem[]) {
        if (!map[b.viveiro_id]) map[b.viveiro_id] = [];
        if (map[b.viveiro_id].length < 3) map[b.viveiro_id].push(b);
      }
      return map;
    },
  });


  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("viveiros").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["viveiros"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Viveiro removido");
    },
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("viveiros").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["viveiros"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(v.status === "ativo" ? "Viveiro ativado" : "Viveiro desativado");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function metricasViveiro(v: Viveiro): LinhaPdfViveiro {
    const ultima = (biometriasPorViveiro[v.id] ?? [])[0];
    const desp = despescasPorViveiro[v.id];
    const despescadoKg = desp?.kg ?? 0;
    const racaoKg = racaoPorViveiro[v.id] ?? 0;
    const custo = custoPorViveiro[v.id] ?? 0;
    const receita = receitasPorViveiro[v.id] ?? 0;
    const sobrev = ultima?.sobrevivencia_percent != null ? Number(ultima.sobrevivencia_percent) / 100 : 1;
    const vivos = Number(v.qtd_povoada ?? 0) * sobrev;
    const biomassa = v.biomassa_manual != null ? Number(v.biomassa_manual) : (Number(ultima?.peso_medio_g ?? 0) * vivos) / 1000 + despescadoKg;
    const fca = racaoKg > 0 && biomassa > 0 ? racaoKg / biomassa : 0;
    return {
      nome: v.nome,
      fase: v.data_povoamento ? "Cultivo" : v.data_preparacao ? "Preparação" : v.status === "ativo" ? "Ativo" : "Inativo",
      fazenda: relName(v.fazendas) || "—",
      fornecedor: v.fornecedor ?? "—",
      dataPrep: v.data_preparacao,
      dataPov: v.data_povoamento,
      dias: v.data_povoamento ? diasDeCultivo(v.data_povoamento) : null,
      povoada: v.qtd_povoada != null ? Number(v.qtd_povoada) : null,
      biomassa,
      racao: racaoKg,
      custo,
      receita,
      despescado: despescadoKg,
      fca,
      ultimoPeso: ultima?.peso_medio_g != null ? Number(ultima.peso_medio_g) : null,
    };
  }

  const [pdfBusy, setPdfBusy] = useState(false);
  async function handleGerarPdf(alvo: Viveiro | Viveiro[], print: boolean) {
    try {
      setPdfBusy(true);
      const lista = Array.isArray(alvo) ? alvo : [alvo];
      const single = !Array.isArray(alvo);
      const linhas = lista.map(metricasViveiro);
      let biometrias: BioPdf[] = [];
      if (single) {
        const { data } = await supabase
          .from("biometrias")
          .select("data_biometria, peso_medio_g, amostras, crescimento_semanal_g")
          .eq("viveiro_id", lista[0].id)
          .order("data_biometria", { ascending: false });
        biometrias = (data ?? []) as BioPdf[];
      }
      await buildViveirosPdf(linhas, { print, single, biometrias, titulo: single ? lista[0].nome : null });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Viveiros</h1>
          <p className="text-muted-foreground mt-1">{viveiros.length} cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          <BtnTutorial videoId="EIvub9T9ED4" label="Viveiros" />
          {viveiros.length > 0 && (
            <div className="flex items-center rounded-xl border overflow-hidden shrink-0">
              <button
                onClick={() => handleGerarPdf(viveiros, false)}
                disabled={pdfBusy}
                title="Gerar PDF de todos os viveiros"
                className="h-12 px-3 sm:px-4 font-semibold text-sm flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
              >
                <FileDown className="size-4" /> <span className="hidden sm:inline">PDF</span>
              </button>
              <button
                onClick={() => handleGerarPdf(viveiros, true)}
                disabled={pdfBusy}
                title="Imprimir todos os viveiros"
                className="h-12 px-3 border-l hover:bg-muted disabled:opacity-50 flex items-center justify-center"
              >
                <Printer className="size-4" />
              </button>
            </div>
          )}
          <button
            onClick={() => setOpen(true)}
            className="h-12 px-5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 shrink-0"
          >
            <Plus className="size-5" /> Novo
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : viveiros.length === 0 ? (
        <EmptyState onAdd={() => setOpen(true)} />
      ) : (
        <ul className="space-y-3">
          {viveiros.map((v) => {
            if (bloqueados.has(v.id)) {
              return (
                <li key={v.id} className="p-4 sm:p-5 rounded-2xl border-2 border-dashed border-amber-500/40 bg-amber-500/5">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0"><Lock className="size-6" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-lg truncate">{v.nome}</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mt-0.5">Viveiro desativado pela sua quantidade de viveiros liberados. Entre em contato com o Vital.</p>
                    </div>
                  </div>
                  <a href={VITAL_WPP} target="_blank" rel="noopener noreferrer"
                    className="mt-3 w-full h-11 rounded-xl bg-green-600 text-white font-semibold flex items-center justify-center gap-2 hover:bg-green-700">
                    <MessageCircle className="size-4" /> Falar com o Vital
                  </a>
                </li>
              );
            }
            const ativo = v.status === "ativo";
            const emCultivo = !!v.data_povoamento;
            const emPreparacao = !emCultivo && !!v.data_preparacao;
            const faseLabel = emCultivo ? "Em cultivo" : emPreparacao ? "Em preparação" : ativo ? "Ativo" : "Inativo";
            const faseClass = emCultivo ? "bg-primary/10 text-primary" : emPreparacao ? "bg-amber-500/15 text-amber-600" : ativo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";
            return (
            <li key={v.id} className="p-4 sm:p-5 rounded-2xl bg-card border">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${ativo ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Warehouse className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-lg truncate">{v.nome}</p>
                      <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${faseClass}`}>
                        {faseLabel}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {relName(v.fazendas) || "Sem fazenda"}
                    </p>
                    {emPreparacao && (
                      <p className="text-xs text-amber-600 truncate mt-0.5">
                        Preparado desde {formatDateBR(v.data_preparacao!)}
                      </p>
                    )}
                    {v.fornecedor && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        Laboratório: <span className="font-medium text-foreground">{v.fornecedor}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const acao = ativo ? "desativar" : "ativar";
                      if (confirm(`Tem certeza que deseja ${acao} o "${v.nome}"?`)) {
                        statusMut.mutate({ id: v.id, status: ativo ? "inativo" : "ativo" });
                      }
                    }}
                    role="switch"
                    aria-checked={ativo}
                    title={ativo ? "Ativo — tocar para desativar" : "Inativo — tocar para ativar"}
                    className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${ativo ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${ativo ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remover "${v.nome}"?`)) delMut.mutate(v.id);
                    }}
                    className="size-9 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center shrink-0"
                    aria-label="Remover viveiro"
                  >
                    <Trash2 className="size-5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setHistoricoViveiro(v)}
                  className="text-left relative group"
                  title="Ver dias de lançamento"
                >
                  {(() => {
                    const base = v.data_povoamento ?? null;
                    const semPovoamento = !v.data_povoamento;
                    return (
                      <InfoBlock
                        label="Dias de cultivo"
                        value={base ? `${diasDeCultivo(base)}` : "—"}
                        hint={
                          base
                            ? formatDateBR(v.data_povoamento!)
                            : emPreparacao
                              ? "Em preparação"
                              : "Registre o povoamento"
                        }
                        highlight={!semPovoamento}
                      />
                    );
                  })()}
                  <span className="absolute bottom-1.5 right-1.5 size-7 rounded-md bg-background/80 border flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-background">
                    <ChevronRight className="size-3.5" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditarViveiro(v)}
                  className="text-left relative"
                  title="Editar viveiro"
                >
                  <InfoBlock
                    label="Povoamento"
                    value={v.qtd_povoada ? v.qtd_povoada.toLocaleString("pt-BR") : "—"}
                    hint={v.fornecedor ? v.fornecedor : "pós-larvas"}
                  />
                  <span className="absolute bottom-1.5 right-1.5 size-7 rounded-md bg-background/80 border flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-background">
                    <Pencil className="size-3.5" />
                  </span>
                </button>
                <InfoBlock
                  label="Ração total"
                  value={`${(racaoPorViveiro[v.id] ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`}
                  hint="kg"
                />
                <InfoBlock
                  label="Gasto ração"
                  value={(custoPorViveiro[v.id] ?? 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  highlight
                />
              </div>
              {!v.data_povoamento && (
                <div className="mt-3 p-3 rounded-xl border-2 border-amber-500/40 bg-amber-500/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-amber-600 text-base shrink-0">⚠️</span>
                      <div>
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                          Viveiro não povoado
                        </p>
                        <p className="text-[10px] text-amber-600/80">
                          Registre o povoamento para começar a contar os dias de cultivo
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditarViveiro(v); }}
                      className="h-8 px-3 rounded-lg bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 shrink-0 transition"
                    >
                      Povoar
                    </button>
                  </div>
                </div>
              )}
              {v.data_povoamento && (
                <div className="mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15">
                  <div className="flex items-center gap-2 min-w-0">
                    <CalendarDays className="size-4 text-primary shrink-0" />
                    <p className="text-[11px] text-muted-foreground truncate">
                      Povoado em <span className="font-bold text-foreground">{formatDateBR(v.data_povoamento)}</span> · <span className="font-bold text-primary">{diasDeCultivo(v.data_povoamento)} dias</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditarViveiro(v); }}
                    className="h-7 px-2.5 rounded-lg border border-primary/30 text-[11px] font-bold text-primary hover:bg-primary/10 shrink-0"
                  >
                    Corrigir data
                  </button>
                </div>
              )}
              {(() => {
                const ultima = (biometriasPorViveiro[v.id] ?? [])[0];
                const desp = despescasPorViveiro[v.id];
                const despescadoKg = desp?.kg ?? 0;
                const racaoKg = racaoPorViveiro[v.id] ?? 0;
                const fmt = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

                if (!ultima && !desp && racaoKg <= 0) return null;

                const sobrev = ultima?.sobrevivencia_percent != null ? Number(ultima.sobrevivencia_percent) / 100 : 1;
                const vivos = Number(v.qtd_povoada ?? 0) * sobrev;
                const biomassaCalc = ((Number(ultima?.peso_medio_g ?? 0) * vivos) / 1000) + despescadoKg;
                const biomassaKg = v.biomassa_manual != null ? Number(v.biomassa_manual) : biomassaCalc;
                const fca = racaoKg > 0 && biomassaKg > 0 ? racaoKg / biomassaKg : 0;
                const mostraFca = racaoKg > 0 || !!ultima || v.biomassa_manual != null;

                return (
                  <div className="mt-3 p-3 rounded-xl border bg-gradient-to-br from-primary/10 to-primary/5 space-y-2">
                    {mostraFca && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">FCA — Conversão Alimentar</p>
                          {ultima && <span className="text-[10px] text-muted-foreground">{formatDateBR(ultima.data_biometria)}</span>}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setEditarBiomassa(v); }} className="rounded-lg bg-background/60 p-2 text-left hover:bg-background/90 transition">
                            <div className="flex items-center justify-between">
                              <p className="text-[9px] uppercase text-muted-foreground">Biomassa</p>
                              <Pencil className="size-3 text-primary" />
                            </div>
                            <p className="text-sm font-bold">{biomassaKg > 0 ? `${fmt(biomassaKg, 1)} kg` : "—"}</p>
                            {v.biomassa_manual != null ? <p className="text-[9px] text-primary">editado</p> : (biomassaKg <= 0 ? <p className="text-[9px] text-primary">toque p/ ajustar</p> : null)}
                          </button>
                          <div className="rounded-lg bg-background/60 p-2"><p className="text-[9px] uppercase text-muted-foreground">Ração total</p><p className="text-sm font-bold">{fmt(racaoKg, 1)} kg</p></div>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setEditarBiomassa(v); }} className="rounded-lg bg-primary/15 p-2 text-left hover:bg-primary/25 transition">
                            <div className="flex items-center justify-between">
                              <p className="text-[9px] uppercase text-muted-foreground">FCA</p>
                              <Pencil className="size-3 text-primary" />
                            </div>
                            <p className="text-sm font-bold text-primary">{fca > 0 ? fmt(fca) : "—"}</p>
                          </button>
                        </div>
                        {biomassaKg <= 0 && <p className="text-[10px] text-muted-foreground mt-1">Toque na Biomassa ou no FCA pra ajustar — o cálculo é automático.</p>}
                        {despescadoKg > 0 && <p className="text-[10px] text-muted-foreground mt-1">Já despescado: {fmt(despescadoKg, 1)} kg</p>}
                      </div>
                    )}
                    {despescadoKg > 0 && !mostraFca && <p className="text-[10px] text-muted-foreground">📦 Despescado: {fmt(despescadoKg, 1)} kg</p>}
                  </div>
                );
              })()}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setBiometriaViveiro(v)} className="h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90">
                  <Ruler className="size-4" /> Fazer biometria
                </button>
                <button type="button" onClick={() => setHistBiometriaViveiro(v)} className="h-10 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-muted">
                  <History className="size-4" /> Ver histórico
                </button>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <span className="text-[11px] text-muted-foreground mr-auto">Relatório deste viveiro:</span>
                <button type="button" onClick={() => handleGerarPdf(v, false)} disabled={pdfBusy} className="h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 hover:bg-muted disabled:opacity-50">
                  <FileDown className="size-3.5" /> PDF
                </button>
                <button type="button" onClick={() => handleGerarPdf(v, true)} disabled={pdfBusy} title="Imprimir este viveiro" className="size-9 rounded-lg border flex items-center justify-center hover:bg-muted disabled:opacity-50">
                  <Printer className="size-4" />
                </button>
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {editarBiomassa && (
        <BiomassaEditModal viveiro={editarBiomassa} racaoKg={racaoPorViveiro[editarBiomassa.id] ?? 0} onClose={() => setEditarBiomassa(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["viveiros"] }); setEditarBiomassa(null); }} />
      )}

      {biometriaViveiro && (
        <BiometriaModal viveiro={biometriaViveiro} onClose={() => setBiometriaViveiro(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["viveiros"] }); setBiometriaViveiro(null); }} />
      )}

      {histBiometriaViveiro && (
        <BiometriaHistoricoModal viveiro={histBiometriaViveiro} onClose={() => setHistBiometriaViveiro(null)}
          onNova={() => { const v = histBiometriaViveiro; setHistBiometriaViveiro(null); setBiometriaViveiro(v); }} />
      )}

      {open && (
        <NovoViveiroModal
          fazendas={fazendas}
          onClose={() => setOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["viveiros"] });
            qc.invalidateQueries({ queryKey: ["fazendas"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            setOpen(false);
          }}
        />
      )}

      {racaoViveiro && (
        <LancarRacaoModal
          viveiro={racaoViveiro}
          onClose={() => setRacaoViveiro(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["lancamentos"] });
            qc.invalidateQueries({ queryKey: ["viveiros", "totais"] });
            qc.invalidateQueries({ queryKey: ["viveiros", "lancamentos-recentes"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            setRacaoViveiro(null);
          }}
        />
      )}

      {historicoViveiro && (
        <HistoricoModal
          viveiro={historicoViveiro}
          baseDate={historicoViveiro.data_povoamento ?? null}
          onClose={() => setHistoricoViveiro(null)}
        />
      )}

      {editarViveiro && (
        <EditarViveiroModal
          viveiro={editarViveiro}
          onClose={() => setEditarViveiro(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["viveiros"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            setEditarViveiro(null);
          }}
        />
      )}
    </div>
  );
}

function diasDeCultivo(data: string) {
  const [y, m, d] = data.split("-").map(Number);
  const inicio = new Date(y, (m ?? 1) - 1, d ?? 1);
  inicio.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diff = Math.floor((hoje.getTime() - inicio.getTime()) / 86400000);
  // Dia do povoamento = dia 1 (DOC convention)
  return Math.max(1, diff + 1);
}

function formatDateBR(data: string) {
  const [y, m, d] = data.split("-");
  return `${d}/${m}/${y}`;
}

type LinhaPdfViveiro = {
  nome: string; fase: string; fazenda: string; fornecedor: string;
  dataPrep: string | null; dataPov: string | null; dias: number | null; povoada: number | null;
  biomassa: number; racao: number; custo: number; receita: number; despescado: number; fca: number; ultimoPeso: number | null;
};
type BioPdf = { data_biometria: string; peso_medio_g: number; amostras: number | null; crescimento_semanal_g: number | null };

async function buildViveirosPdf(
  linhas: LinhaPdfViveiro[],
  opts: { print: boolean; single: boolean; biometrias: BioPdf[]; titulo: string | null },
) {
  const [pdfModule, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const jsPDF = pdfModule.default;
  const autoTable = (autoTableModule as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const dataStr = new Date().toLocaleDateString("pt-BR");
  const horaStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const n = (x: number, d = 1) => x.toLocaleString("pt-BR", { maximumFractionDigits: d });
  const brl = (x: number) => `R$ ${x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fdate = (s: string | null) => (s ? formatDateBR(s) : "—");

  // Cabeçalho
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, 210, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(opts.single ? `VIVEIRO · ${opts.titulo ?? ""}` : "RELATÓRIO DE VIVEIROS", 14, 11);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Emitido em ${dataStr} às ${horaStr}${opts.single ? "" : `  ·  ${linhas.length} viveiro(s)`}`, 14, 18);

  if (opts.single) {
    const v = linhas[0];
    let y = 32;
    const info: Array<[string, string]> = [
      ["Fazenda", v.fazenda], ["Laboratório", v.fornecedor], ["Fase", v.fase],
      ["Preparação", fdate(v.dataPrep)], ["Povoamento", fdate(v.dataPov)],
      ["Dias de cultivo", v.dias != null ? String(v.dias) : "—"],
      ["Pós-larvas povoadas", v.povoada != null ? n(v.povoada, 0) : "—"],
    ];
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("DADOS DO VIVEIRO", 14, y); y += 4;
    autoTable(doc, {
      startY: y,
      body: info,
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, textColor: [100, 116, 139] } },
      theme: "plain",
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("MÉTRICAS", 14, y); y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Biomassa", "Ração total", "Custo ração", "Receita", "Despescado", "FCA"]],
      body: [[`${n(v.biomassa, 1)} kg`, `${n(v.racao, 1)} kg`, v.custo > 0 ? brl(v.custo) : "—", v.receita > 0 ? brl(v.receita) : "—", `${n(v.despescado, 1)} kg`, v.fca > 0 ? n(v.fca, 2) : "—"]],
      styles: { fontSize: 8.5, cellPadding: 2, halign: "center" },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text(`BIOMETRIAS (${opts.biometrias.length})`, 14, y); y += 4;
    if (opts.biometrias.length === 0) {
      doc.setFontSize(8.5); doc.setFont("helvetica", "italic"); doc.setTextColor(100, 116, 139);
      doc.text("Nenhuma biometria registrada.", 14, y + 4);
    } else {
      autoTable(doc, {
        startY: y,
        head: [["Data", "Peso médio (g)", "Crescimento (g/sem)", "Camarões"]],
        body: opts.biometrias.map((b) => [
          formatDateBR(b.data_biometria),
          n(Number(b.peso_medio_g), 2),
          b.crescimento_semanal_g != null ? `+${n(Number(b.crescimento_semanal_g), 2)}` : "—",
          b.amostras != null ? String(b.amostras) : "—",
        ]),
        styles: { fontSize: 8.5, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
        margin: { left: 14, right: 14 },
      });
    }
  } else {
    const tBio = linhas.reduce((s, r) => s + r.biomassa, 0);
    const tRac = linhas.reduce((s, r) => s + r.racao, 0);
    autoTable(doc, {
      startY: 30,
      head: [["Viveiro", "Fase", "Dias", "Povoada", "Biomassa", "Ração", "FCA", "Peso"]],
      body: linhas.map((r) => [
        r.nome, r.fase,
        r.dias != null ? String(r.dias) : "—",
        r.povoada != null ? n(r.povoada, 0) : "—",
        `${n(r.biomassa, 1)} kg`,
        `${n(r.racao, 1)} kg`,
        r.fca > 0 ? n(r.fca, 2) : "—",
        r.ultimoPeso != null ? `${n(r.ultimoPeso, 1)} g` : "—",
      ]),
      foot: [["TOTAL", "", "", "", `${n(tBio, 1)} kg`, `${n(tRac, 1)} kg`, "", ""]],
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      footStyles: { fillColor: [226, 232, 240], textColor: [30, 41, 59], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "center" }, 7: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    const fy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
    doc.setFontSize(6.5); doc.setFont("helvetica", "italic"); doc.setTextColor(120, 130, 145);
    doc.text("Biomassa e ração em kg. Peso = último peso médio da biometria. FCA = ração ÷ biomassa.", 14, fy);
  }

  // Rodapé
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
    doc.text(`Viveiros App · ${dataStr} às ${horaStr}`, 14, 289);
    doc.text(`Página ${i} de ${pageCount}`, 196, 289, { align: "right" });
  }

  if (opts.print) {
    (doc as unknown as { autoPrint: () => void }).autoPrint();
    const url = doc.output("bloburl");
    window.open(url as unknown as string, "_blank");
  } else {
    const nome = opts.single ? `viveiro-${(opts.titulo ?? "").replace(/\s+/g, "-")}.pdf` : `viveiros-${dataStr.replace(/\//g, "-")}.pdf`;
    doc.save(nome);
  }
}

function InfoBlock({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-xl border min-w-0 overflow-hidden ${
        highlight ? "bg-primary/10 border-primary/20" : "bg-muted/40"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground truncate">{label}</p>
      <p
        className={`mt-0.5 font-bold leading-tight break-words text-base sm:text-xl ${highlight ? "text-primary" : "text-foreground"}`}
        style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="p-10 rounded-2xl border-2 border-dashed text-center">
      <Warehouse className="size-12 mx-auto text-muted-foreground" />
      <h3 className="mt-3 font-semibold text-lg">Nenhum viveiro ainda</h3>
      <p className="text-muted-foreground mt-1">Cadastre seu primeiro viveiro pra começar.</p>
      <button
        onClick={onAdd}
        className="mt-4 h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2"
      >
        <Plus className="size-5" /> Cadastrar
      </button>
    </div>
  );
}

function LancarRacaoModal({
  viveiro,
  onClose,
  onSaved,
}: {
  viveiro: Viveiro;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [dataLancamento, setDataLancamento] = useState(todayLocal());
  const [vezes, setVezes] = useState<number | null>(null);
  const [novoProdutoNome, setNovoProdutoNome] = useState("");
  const [novoProdutoUnidade, setNovoProdutoUnidade] = useState("kg");
  const [novoProdutoPreco, setNovoProdutoPreco] = useState("");
  const [criandoProduto, setCriandoProduto] = useState(false);
  const [tipoLancamento, setTipoLancamento] = useState("racao");

  type ProdRacao = {
    id: string;
    nome: string;
    categoria: string;
    unidade: string;
    preco_unidade: number | null;
  };

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos", "racao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, categoria, unidade, preco_unidade")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ProdRacao[];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Sessão expirada.");
      if (!quantidade || Number(quantidade) <= 0) throw new Error("Informe a quantidade.");

      let produto: ProdRacao | undefined;

      if (criandoProduto) {
        if (!novoProdutoNome.trim()) throw new Error("Informe o nome do produto.");
        const precoNovo =
          novoProdutoPreco.trim() === "" ? null : Number(novoProdutoPreco);
        if (precoNovo != null && (isNaN(precoNovo) || precoNovo < 0)) {
          throw new Error("Preço inválido.");
        }
        const { data: novo, error: pErr } = await supabase
          .from("produtos")
          .insert({
            user_id,
            nome: novoProdutoNome.trim(),
            categoria: "racao",
            unidade: novoProdutoUnidade.trim() || "kg",
            preco_unidade: precoNovo,
          })
          .select("id, nome, categoria, unidade, preco_unidade")
          .single();
        if (pErr) throw pErr;
        produto = novo as ProdRacao;
        qc.invalidateQueries({ queryKey: ["produtos"] });
      } else {
        if (!produtoId) throw new Error("Escolha um produto.");
        produto = produtos.find((p) => p.id === produtoId);
        if (!produto) throw new Error("Produto inválido.");
      }

      const preco_unidade = produto.preco_unidade != null ? Number(produto.preco_unidade) : null;
      const custo_total = preco_unidade != null ? preco_unidade * Number(quantidade) : null;

      const { error } = await supabase.from("lancamentos").insert({
        user_id,
        viveiro_id: viveiro.id,
        produto_id: produto.id,
        tipo: tipoLancamento,
        produto_nome: produto.nome,
        quantidade: Number(quantidade),
        unidade: produto.unidade,
        data_lancamento: dataLancamento,
        vezes: vezes,
        observacao: vezes ? `${vezes}x` : null,
        preco_unidade,
        custo_total,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ração lançada!");
      qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <ModalShell title={`Lançar ração · ${viveiro.nome}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        className="space-y-4"
      >
        {!criandoProduto ? (
          <Field label="Produto">
            <div className="flex gap-2">
              <select
                required
                value={produtoId}
                onChange={(e) => {
                  setProdutoId(e.target.value);
                  const p = produtos.find((x) => x.id === e.target.value);
                  if (p?.categoria) setTipoLancamento(p.categoria);
                }}
                className="input flex-1"
              >
                <option value="">{produtos.length ? "Escolha" : "Nenhum produto"}</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.unidade})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCriandoProduto(true)}
                className="h-12 px-3 rounded-xl bg-primary/10 text-primary font-semibold"
              >
                + Novo
              </button>
            </div>
          </Field>
        ) : (
          <div className="space-y-3 p-3 rounded-xl bg-muted/40 border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Novo produto</span>
              <button
                type="button"
                onClick={() => setCriandoProduto(false)}
                className="text-xs text-muted-foreground"
              >
                Cancelar
              </button>
            </div>
            <Field label="Nome">
              <input
                required
                value={novoProdutoNome}
                onChange={(e) => setNovoProdutoNome(e.target.value)}
                placeholder="Ex: Ração 35%"
                className="input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidade">
                <input
                  required
                  value={novoProdutoUnidade}
                  onChange={(e) => setNovoProdutoUnidade(e.target.value)}
                  placeholder="kg"
                  className="input"
                />
              </Field>
              <Field label={`Preço/${novoProdutoUnidade || "un"} (R$)`}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={novoProdutoPreco}
                  onChange={(e) => setNovoProdutoPreco(e.target.value)}
                  placeholder="0,00"
                  className="input"
                />
              </Field>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-semibold">Tipo do Insumo</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {([
              { value: "racao", label: "Ração", icon: "🌾" },
              { value: "probiotico", label: "Probiótico", icon: "🧪" },
              { value: "medicamento", label: "Medicamento", icon: "💊" },
              { value: "fertilizante", label: "Fertilizante", icon: "🌱" },
              { value: "outro", label: "Outro", icon: "📦" },
            ] as const).map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTipoLancamento(item.value)}
                className={`py-2 px-1.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-0.5 transition active:scale-95 ${
                  tipoLancamento === item.value
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card hover:bg-muted text-muted-foreground"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade">
            <input
              required
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="0"
              className="input"
            />
          </Field>
          <Field label="Data">
            <input
              required
              type="date"
              value={dataLancamento}
              onChange={(e) => setDataLancamento(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <Field label="Trato (opcional)">
          <div className="flex gap-2">
            {[1, 2, 3].map((n) => {
              const ativo = vezes === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setVezes(ativo ? null : n)}
                  className={`flex-1 h-12 rounded-xl font-semibold border ${
                    ativo
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {n}x
                </button>
              );
            })}
          </div>
          {vezes && Number(quantidade) > 0 ? (
            <p className="text-sm font-semibold text-primary mt-2">
              {(Number(quantidade) / vezes).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
              por trato ({vezes}x)
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Quantas vezes alimentou nesse dia
            </p>
          )}
        </Field>

        {(() => {
          const prodSel = criandoProduto
            ? null
            : produtos.find((p) => p.id === produtoId);
          const precoSel = criandoProduto
            ? novoProdutoPreco.trim() === ""
              ? null
              : Number(novoProdutoPreco)
            : prodSel?.preco_unidade != null
            ? Number(prodSel.preco_unidade)
            : null;
          const qtd = Number(quantidade);
          if (precoSel != null && !isNaN(precoSel) && qtd > 0) {
            const total = precoSel * qtd;
            return (
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                <p className="text-xs text-muted-foreground">Custo deste lançamento</p>
                <p className="text-xl font-bold text-primary">
                  {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {qtd} × {precoSel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              </div>
  );
}

function RelatorioViveiroModal({ viveiro, racaoKg, custoRacao, receitas, despesca, onClose }: {
  viveiro: Viveiro; racaoKg: number; custoRacao: number; receitas: number;
  despesca?: { kg: number; count: number }; onClose: () => void;
}) {
  const fmt = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const baseDate = viveiro.data_povoamento ?? null;
  const dias = baseDate ? diasDeCultivo(baseDate) : 0;
  const despescadoKg = despesca?.kg ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div><h2 className="font-bold text-xl">{viveiro.nome}</h2><p className="text-xs text-muted-foreground">{dias > 0 ? `${dias}d cultivo` : "Sem povoamento"}</p></div>
          <button onClick={onClose} className="size-10 rounded-lg hover:bg-muted flex items-center justify-center"><X className="size-5" /></button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20"><span className="text-[10px] uppercase text-emerald-600 block">Receitas</span><span className="text-base font-bold text-emerald-600">{brl(receitas)}</span></div>
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20"><span className="text-[10px] uppercase text-rose-600 block">Custo Ração</span><span className="text-base font-bold text-rose-600">{brl(custoRacao)}</span></div>
            <div className="p-2.5 rounded-xl bg-muted/40 border"><span className="text-[10px] uppercase text-muted-foreground block">Lucro</span><span className={`text-base font-bold ${receitas - custoRacao >= 0 ? "text-emerald-600" : "text-destructive"}`}>{brl(receitas - custoRacao)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-muted/20"><span className="text-muted-foreground">Ração</span><span className="float-right font-bold">{fmt(racaoKg,1)}kg</span></div>
            <div className="p-2 rounded bg-muted/20"><span className="text-muted-foreground">Povoados</span><span className="float-right font-bold">{Number(viveiro.qtd_povoada ?? 0).toLocaleString("pt-BR")}</span></div>
            <div className="p-2 rounded bg-muted/20"><span className="text-muted-foreground">Fornecedor</span><span className="float-right font-bold">{viveiro.fornecedor || "—"}</span></div>
            <div className="p-2 rounded bg-muted/20"><span className="text-muted-foreground">Dias cultivo</span><span className="float-right font-bold">{dias}</span></div>
            {despescadoKg > 0 && <div className="p-2 rounded bg-muted/20 col-span-2"><span className="text-muted-foreground">Despescado</span><span className="float-right font-bold">{fmt(despescadoKg,1)}kg</span></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
          return null;
        })()}

        <button
          type="submit"
          disabled={mut.isPending}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
        >
          {mut.isPending ? "Salvando..." : "Lançar ração"}
        </button>
      </form>
      <ModalStyle />
    </ModalShell>
  );
}

function NovoViveiroModal({
  fazendas,
  onClose,
  onSaved,
}: {
  fazendas: Fazenda[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [fazendaId, setFazendaId] = useState(fazendas[0]?.id ?? "");
  const [novaFazenda, setNovaFazenda] = useState("");
  const [novaCidade, setNovaCidade] = useState("");
  const [dataPovoamento, setDataPovoamento] = useState("");
  const [qtdPovoada, setQtdPovoada] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [loading, setLoading] = useState(false);
  const criandoFazenda = fazendas.length === 0 || fazendaId === "__new";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Sem sessão");

      let usarFazendaId = fazendaId;
      if (criandoFazenda) {
        const { data, error } = await supabase
          .from("fazendas")
          .insert({ nome: novaFazenda, cidade: novaCidade || null, user_id })
          .select()
          .single();
        if (error) throw error;
        usarFazendaId = data.id;
      }

      const { error } = await supabase.from("viveiros").insert({
        user_id,
        fazenda_id: usarFazendaId,
        nome,
        data_povoamento: dataPovoamento || null,
        qtd_povoada: qtdPovoada ? Number(qtdPovoada) : null,
        fornecedor: fornecedor.trim() || null,
      });
      if (error) throw error;
      toast.success("Viveiro criado!");
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="Novo viveiro" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome do viveiro">
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Viveiro 1"
            className="input"
          />
        </Field>

        <Field label="Fazenda">
          {fazendas.length > 0 && (
            <select
              value={fazendaId}
              onChange={(e) => setFazendaId(e.target.value)}
              className="input"
            >
              {fazendas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
              <option value="__new">+ Nova fazenda</option>
            </select>
          )}
          {criandoFazenda && (
            <div className="space-y-2 mt-2">
              <input
                required
                value={novaFazenda}
                onChange={(e) => setNovaFazenda(e.target.value)}
                placeholder="Nome da fazenda"
                className="input"
              />
              <input
                value={novaCidade}
                onChange={(e) => setNovaCidade(e.target.value)}
                placeholder="Cidade (opcional)"
                className="input"
              />
            </div>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Povoamento">
            <input
              type="date"
              value={dataPovoamento}
              onChange={(e) => setDataPovoamento(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Quantidade">
            <input
              type="number"
              inputMode="numeric"
              value={qtdPovoada}
              onChange={(e) => setQtdPovoada(e.target.value)}
              placeholder="0"
              className="input"
            />
          </Field>
        </div>

        <Field label="Laboratório / Fornecedor">
          <input
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            placeholder="Ex: Aquatec"
            className="input"
          />
        </Field>


        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>
      </form>
      <ModalStyle />
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold truncate pr-2">{title}</h2>
          <button
            onClick={onClose}
            className="size-9 rounded-lg hover:bg-muted flex items-center justify-center shrink-0"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalStyle() {
  return (
    <style>{`.input { width:100%; height:48px; padding: 0 16px; border-radius: 12px; border:1px solid var(--color-border); background: var(--color-background); font-size:16px; outline:none; }
    .input:focus { box-shadow: 0 0 0 2px var(--color-ring); }`}</style>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function EditarViveiroModal({
  viveiro,
  onClose,
  onSaved,
}: {
  viveiro: Viveiro;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dataPovoamento, setDataPovoamento] = useState(viveiro.data_povoamento ?? "");
  const [dataPreparacao, setDataPreparacao] = useState(viveiro.data_preparacao ?? "");
  const [qtdPovoada, setQtdPovoada] = useState(
    viveiro.qtd_povoada != null ? String(viveiro.qtd_povoada) : "",
  );
  const [precoMilheiro, setPrecoMilheiro] = useState(
    viveiro.preco_milheiro != null ? String(viveiro.preco_milheiro) : "",
  );
  const [fornecedor, setFornecedor] = useState(viveiro.fornecedor ?? "");
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const qtdNum = Number(qtdPovoada.replace(",", ".")) || 0;
  const precoNum = Number(precoMilheiro.replace(",", ".")) || 0;
  const custoLarvas = qtdNum > 0 && precoNum > 0 ? qtdNum * precoNum : 0;
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const qtd = qtdPovoada.trim() === "" ? null : Number(qtdPovoada);
      if (qtd != null && (isNaN(qtd) || qtd < 0)) throw new Error("Quantidade inválida.");
      // Ao povoar (colocar as pós-larvas), o viveiro é ativado automaticamente
      const novoStatus = dataPovoamento ? "ativo" : viveiro.status;
      const preco = precoMilheiro.trim() === "" ? null : Number(precoMilheiro.replace(",", "."));
      if (preco != null && (isNaN(preco) || preco < 0)) throw new Error("Preço por milheiro inválido.");
      const { error } = await supabase
        .from("viveiros")
        .update({
          data_povoamento: dataPovoamento || null,
          data_preparacao: dataPreparacao || null,
          qtd_povoada: qtd,
          preco_milheiro: preco,
          fornecedor: fornecedor.trim() || null,
          status: novoStatus,
        })
        .eq("id", viveiro.id);
      if (error) throw error;

      // Lançar automático (ou atualizar) a despesa das pós-larvas no caixa deste viveiro
      let lancouCaixa = false;
      const custo = qtd != null && preco != null && qtd > 0 && preco > 0 ? qtd * preco : 0;
      if (custo > 0 && dataPovoamento) {
        const { data: u } = await supabase.auth.getUser();
        const userId = u.user?.id;
        if (userId) {
          const desc = `Povoamento: ${qtd} milheiros × ${brl(preco)}/milheiro${fornecedor.trim() ? ` — ${fornecedor.trim()}` : ""}`;
          const { data: existentes } = await supabase
            .from("caixa_lancamentos")
            .select("id")
            .eq("viveiro_id", viveiro.id)
            .eq("categoria", "povoamento")
            .limit(1);
          if (existentes && existentes.length > 0) {
            await supabase.from("caixa_lancamentos").update({
              descricao: desc, valor: custo, data_lancamento: dataPovoamento, tipo: "despesa",
            }).eq("id", existentes[0].id);
          } else {
            await supabase.from("caixa_lancamentos").insert({
              user_id: userId, viveiro_id: viveiro.id, data_lancamento: dataPovoamento,
              descricao: desc, categoria: "povoamento", valor: custo, tipo: "despesa",
            });
          }
          lancouCaixa = true;
          qc.invalidateQueries({ queryKey: ["caixa"] });
        }
      }

      toast.success(lancouCaixa
        ? `Povoamento salvo · ${brl(custo)} lançado no caixa do viveiro`
        : (dataPovoamento && viveiro.status !== "ativo" ? "Viveiro povoado e ativado!" : "Viveiro atualizado!"));
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={`Preparação e povoamento · ${viveiro.nome}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-2xl border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">🧹</div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">Data de preparação</p>
              <p className="text-[11px] text-muted-foreground">Quando o viveiro começou a ser preparado (antes de colocar as pós-larvas). Opcional.</p>
            </div>
          </div>
          <input
            type="date"
            value={dataPreparacao}
            onChange={(e) => setDataPreparacao(e.target.value)}
            className="input w-full"
          />
        </div>
        <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0"><CalendarDays className="size-5" /></div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">Data de povoamento (colocação das pós-larvas)</p>
              <p className="text-[11px] text-muted-foreground">Ao definir, o viveiro é <span className="font-semibold text-primary">ativado</span> e começa a contar os dias de cultivo.</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={dataPovoamento}
              onChange={(e) => setDataPovoamento(e.target.value)}
              className="input flex-1"
            />
            {dataPovoamento && (
              <button
                type="button"
                onClick={() => setDataPovoamento("")}
                className="h-11 px-3 rounded-xl border border-destructive/40 text-destructive text-xs font-bold hover:bg-destructive/10 shrink-0"
              >
                Zerar
              </button>
            )}
          </div>
          {dataPovoamento ? (
            <div className="rounded-xl bg-card border p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Dias de cultivo</p>
                <p className="text-3xl font-black text-primary tabular-nums leading-none">{diasDeCultivo(dataPovoamento)}</p>
              </div>
              <p className="text-[11px] text-emerald-600 font-semibold text-right shrink-0 leading-tight">✓ contando<br />desde {formatDateBR(dataPovoamento)}</p>
            </div>
          ) : (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400 font-medium leading-snug">
              ⏸️ Ainda não povoado — os dias de cultivo ficam <span className="font-bold">zerados</span> até você definir a data acima.
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Colocou a data errada sem querer? Toque em <span className="font-semibold">Zerar</span> e salve — os dias voltam pra zero.
          </p>
        </div>
        <Field label="Quantidade de pós-larvas (em milheiros)">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={qtdPovoada}
            onChange={(e) => setQtdPovoada(e.target.value)}
            placeholder="Ex: 400 (= 400 mil)"
            className="input"
          />
        </Field>
        <div className="rounded-2xl border-2 border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">🦐</div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">Preço por milheiro (R$)</p>
              <p className="text-[11px] text-muted-foreground">Ao preencher, o custo das pós-larvas é <span className="font-semibold text-emerald-600">lançado automático no Caixa</span> deste viveiro. Deixe em branco pra não lançar.</p>
            </div>
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={precoMilheiro}
            onChange={(e) => setPrecoMilheiro(e.target.value.replace(/[^0-9.,]/g, ""))}
            placeholder="Ex: 14,00"
            className="input"
          />
          {custoLarvas > 0 && (
            <div className="rounded-xl bg-card border p-3 text-sm">
              <span className="text-muted-foreground">{qtdNum.toLocaleString("pt-BR")} milheiros × {brl(precoNum)} = </span>
              <span className="font-black text-emerald-600 text-base">{brl(custoLarvas)}</span>
              {!dataPovoamento && <p className="text-[11px] text-amber-600 font-medium mt-1">⚠️ Defina a data de povoamento acima pra lançar no caixa.</p>}
            </div>
          )}
        </div>
        <Field label="Laboratório / Fornecedor">
          <input
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            placeholder="Ex: Aquatec"
            className="input"
          />
        </Field>
        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>
      </form>
      <ModalStyle />
    </ModalShell>
  );
}

function HistoricoModal({
  viveiro,
  baseDate,
  onClose,
}: {
  viveiro: Viveiro;
  baseDate: string | null;
  onClose: () => void;
}) {
  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ["lancamentos", "viveiro", viveiro.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("id, data_lancamento, produto_nome, quantidade, unidade, tipo, custo_total")
        .eq("viveiro_id", viveiro.id)
        .order("data_lancamento", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalDias = baseDate ? diasDeCultivo(baseDate) : 0;

  type Lanc = (typeof lancamentos)[number];
  const porData = new Map<string, Lanc[]>();
  for (const l of lancamentos) {
    if (!l.data_lancamento) continue;
    const arr = porData.get(l.data_lancamento) ?? [];
    arr.push(l);
    porData.set(l.data_lancamento, arr);
  }
  const datas = Array.from(porData.keys()).sort((a, b) => (a < b ? 1 : -1));

  function racaoKgDoDia(date: string): number {
    return (porData.get(date) ?? [])
      .filter((i) => i.tipo === "racao")
      .reduce((s, i) => s + Number(i.quantidade ?? 0), 0);
  }
  function custoDia(date: string): number {
    return (porData.get(date) ?? []).reduce((s, i) => s + Number(i.custo_total ?? 0), 0);
  }
  const hojeStr = todayLocal();
  const ontemDate = new Date();
  ontemDate.setDate(ontemDate.getDate() - 1);
  const ontemStr = `${ontemDate.getFullYear()}-${String(ontemDate.getMonth() + 1).padStart(2, "0")}-${String(ontemDate.getDate()).padStart(2, "0")}`;
  const kgHoje = racaoKgDoDia(hojeStr);
  const kgOntem = racaoKgDoDia(ontemStr);
  const diffKg = kgHoje - kgOntem;
  const diffPct = kgOntem > 0 ? (diffKg / kgOntem) * 100 : null;
  const fmtKg = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  function buildShareText(): string {
    const linhas: string[] = [];
    linhas.push(`*${viveiro.nome}* — Lançamentos de ração`);
    if (baseDate) linhas.push(`DOC atual: ${totalDias} dias (desde ${formatDateBR(baseDate)})`);
    linhas.push("");
    for (const d of datas) {
      const itens = porData.get(d)!;
      const totalKg = racaoKgDoDia(d);
      const totalCusto = custoDia(d);
      const doc = baseDate ? ` (DOC ${diasDeCultivo(d)})` : "";
      linhas.push(`📅 *${formatDateBR(d)}*${doc}`);
      for (const i of itens) {
        linhas.push(`  • ${i.produto_nome}: ${fmtKg(Number(i.quantidade ?? 0))} ${i.unidade}`);
      }
      if (totalKg > 0) linhas.push(`  → Ração: ${fmtKg(totalKg)} kg`);
      if (totalCusto > 0) linhas.push(`  → Custo: ${totalCusto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
      linhas.push("");
    }
    return linhas.join("\n").trim();
  }

  async function handleShare() {
    const text = buildShareText();
    if (!text || datas.length === 0) {
      toast.error("Sem lançamentos para compartilhar");
      return;
    }
    const title = `Lançamentos - ${viveiro.nome}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ title, text });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <ModalStyle />
      <div className="bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-lg truncate">{viveiro.nome}</h2>
            <p className="text-xs text-muted-foreground">
              {totalDias > 0 ? `${totalDias} dias de cultivo` : "Sem cultivo iniciado"}
              {baseDate && ` · desde ${formatDateBR(baseDate)}`}
            </p>
          </div>
          <button
            onClick={handleShare}
            disabled={isLoading || datas.length === 0}
            className="size-10 rounded-lg hover:bg-muted flex items-center justify-center disabled:opacity-40"
            title="Compartilhar lançamentos"
          >
            <Share2 className="size-5" />
          </button>
          <button onClick={onClose} className="size-10 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-3">
          {!isLoading && (kgHoje > 0 || kgOntem > 0) && (
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 to-primary/5 p-4">
              <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
                Ração — hoje x ontem
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-background/60 p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Hoje</p>
                  <p className="text-lg font-bold text-primary">{fmtKg(kgHoje)} kg</p>
                </div>
                <div className="rounded-xl bg-background/60 p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Ontem</p>
                  <p className="text-lg font-bold">{fmtKg(kgOntem)} kg</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Diferença</span>
                <span
                  className={`font-bold ${
                    diffKg > 0 ? "text-emerald-600" : diffKg < 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {diffKg > 0 ? "+" : ""}
                  {fmtKg(diffKg)} kg
                  {diffPct !== null && (
                    <> ({diffKg > 0 ? "+" : ""}{diffPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</>
                  )}
                </span>
              </div>
            </div>
          )}

          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : datas.length === 0 ? (
            <div className="text-center py-10">
              <CalendarDays className="size-12 mx-auto text-muted-foreground" />
              <p className="mt-3 font-semibold">Nenhum lançamento ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Lançamentos de ração deste viveiro.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
                {datas.length} {datas.length === 1 ? "dia com registro" : "dias com registros"} · {lancamentos.length} itens
              </p>

              <ul className="space-y-2">
                {datas.map((d) => {
                  const itens = porData.get(d)!;
                  const totalKg = racaoKgDoDia(d);
                  const totalCusto = custoDia(d);
                  const diaCultivo = baseDate ? diasDeCultivo(d) : null;
                  return (
                    <li key={d} className="p-3 rounded-xl border bg-muted/30">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{formatDateBR(d)}</p>
                          {diaCultivo !== null && (
                            <p className="text-[11px] text-muted-foreground">DOC {diaCultivo}</p>
                          )}
                        </div>
                        <div className="text-right">
                          {totalKg > 0 && (
                            <p className="text-sm font-bold text-primary">
                              {totalKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                            </p>
                          )}
                          {totalCusto > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              {totalCusto.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {itens.map((i) => (
                          <li key={i.id} className="text-xs text-muted-foreground flex justify-between gap-2">
                            <span className="truncate">{i.produto_nome}</span>
                            <span className="shrink-0">
                              {Number(i.quantidade ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {i.unidade}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BiomassaEditModal({ viveiro, racaoKg, onClose, onSaved }: { viveiro: Viveiro; racaoKg: number; onClose: () => void; onSaved: () => void }) {
  const [valor, setValor] = useState(viveiro.biomassa_manual != null ? String(viveiro.biomassa_manual) : "");
  const [fcaInput, setFcaInput] = useState("");
  const [loading, setLoading] = useState(false);
  const fmt = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

  const biomassaNum = valor.trim() === "" ? null : Number(valor.replace(",", "."));
  const fcaCalc = biomassaNum && biomassaNum > 0 && racaoKg > 0 ? racaoKg / biomassaNum : null;

  // Editar Biomassa -> recalcula o FCA
  function onBiomassa(s: string) {
    setValor(s.replace(/[^0-9.,]/g, ""));
    setFcaInput("");
  }
  // Editar FCA -> recalcula a biomassa (biomassa = ração / FCA)
  function onFca(s: string) {
    const clean = s.replace(/[^0-9.,]/g, "");
    setFcaInput(clean);
    const f = Number(clean.replace(",", "."));
    if (racaoKg > 0 && f > 0 && !isNaN(f)) setValor(String(Math.round((racaoKg / f) * 100) / 100));
    else if (clean === "") setValor("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    try {
      const v = valor.trim() === "" ? null : Number(valor.replace(",", "."));
      if (v != null && (isNaN(v) || v < 0)) throw new Error("Valor inválido");
      await supabase.from("viveiros").update({ biomassa_manual: v }).eq("id", viveiro.id);
      toast.success("Atualizado!"); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); }
    finally { setLoading(false); }
  }
  return (
    <ModalShell title={`FCA / Biomassa · ${viveiro.nome}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-muted/40 border p-3 text-xs text-muted-foreground">
          Ração total lançada: <span className="font-bold text-foreground">{fmt(racaoKg, 1)} kg</span><br />
          Edite a <span className="font-semibold">Biomassa</span> ou o <span className="font-semibold">FCA</span> — o outro é calculado sozinho (FCA = ração ÷ biomassa). Deixe vazio pra voltar ao automático.
        </div>
        <Field label="Biomassa (kg)"><input type="text" inputMode="decimal" value={valor} onChange={e => onBiomassa(e.target.value)} placeholder="Automático" className="input" autoFocus /></Field>
        <Field label="FCA"><input type="text" inputMode="decimal" value={fcaInput} onChange={e => onFca(e.target.value)} placeholder={fcaCalc != null ? fmt(fcaCalc) : "—"} className="input" /></Field>
        {fcaCalc != null && <p className="text-[11px] text-primary font-medium">FCA atual: {fmt(fcaCalc)} · Biomassa {fmt(biomassaNum ?? 0, 1)} kg</p>}
        <button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold">{loading ? "Salvando..." : "Salvar"}</button>
      </form>
      <ModalStyle />
    </ModalShell>
  );
}

function BiometriaModal({ viveiro, onClose, onSaved }: { viveiro: Viveiro; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const [data, setData] = useState(todayLocal());
  const [pesoTotal, setPesoTotal] = useState("");
  const [qtd, setQtd] = useState("");
  const [cresc, setCresc] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: anteriores = [] } = useQuery({
    queryKey: ["biometrias", "viveiro", viveiro.id],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("biometrias")
        .select("id, data_biometria, peso_medio_g, amostras, crescimento_semanal_g")
        .eq("viveiro_id", viveiro.id)
        .order("data_biometria", { ascending: false });
      if (error) throw error;
      return (rows ?? []) as { id: string; data_biometria: string; peso_medio_g: number; amostras: number | null; crescimento_semanal_g: number | null }[];
    },
  });

  const pt = Number(pesoTotal.replace(",", "."));
  const nq = Number(qtd.replace(",", "."));
  const pesoMedio = pt > 0 && nq > 0 ? pt / nq : 0;
  const ultima = anteriores.find((b) => b.data_biometria < data);
  const crescAuto = (() => {
    if (!ultima || pesoMedio <= 0) return null;
    const dias = Math.max(1, Math.round((new Date(`${data}T00:00:00`).getTime() - new Date(`${ultima.data_biometria}T00:00:00`).getTime()) / 86400000));
    return ((pesoMedio - Number(ultima.peso_medio_g)) / dias) * 7;
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (pesoMedio <= 0) throw new Error("Informe o peso total e a quantidade de camarões.");
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      const crescimento = cresc.trim() !== "" ? Number(cresc.replace(",", ".")) : (crescAuto != null ? Math.round(crescAuto * 100) / 100 : null);
      const { error } = await supabase.from("biometrias").insert({
        user_id: uid,
        viveiro_id: viveiro.id,
        data_biometria: data,
        peso_medio_g: Math.round(pesoMedio * 100) / 100,
        amostras: Math.round(nq),
        crescimento_semanal_g: crescimento,
      });
      if (error) throw error;
      toast.success("Biometria salva!");
      qc.invalidateQueries({ queryKey: ["viveiros"] });
      qc.invalidateQueries({ queryKey: ["biometrias"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={`Nova biometria · ${viveiro.nome}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Data da biometria">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Peso total da amostra (g)">
            <input type="text" inputMode="decimal" value={pesoTotal} onChange={(e) => setPesoTotal(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="Ex: 250" className="input" autoFocus />
          </Field>
          <Field label="Qtd de camarões">
            <input type="text" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Ex: 30" className="input" />
          </Field>
        </div>
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Peso médio</span>
          <span className="text-xl font-black text-primary tabular-nums">{pesoMedio > 0 ? `${pesoMedio.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} g` : "—"}</span>
        </div>
        <Field label="Crescimento semanal (g/sem) — opcional">
          <input type="text" inputMode="decimal" value={cresc} onChange={(e) => setCresc(e.target.value.replace(/[^0-9.,-]/g, ""))} placeholder={crescAuto != null ? `Automático: ${crescAuto.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}` : "Automático"} className="input" />
        </Field>
        <button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50">{loading ? "Salvando..." : "Salvar biometria"}</button>
      </form>
      <ModalStyle />
    </ModalShell>
  );
}

function BiometriaHistoricoModal({ viveiro, onClose, onNova }: { viveiro: Viveiro; onClose: () => void; onNova: () => void }) {
  const qc = useQueryClient();
  const { data: bios = [], isLoading } = useQuery({
    queryKey: ["biometrias", "viveiro", viveiro.id],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("biometrias")
        .select("id, data_biometria, peso_medio_g, amostras, crescimento_semanal_g")
        .eq("viveiro_id", viveiro.id)
        .order("data_biometria", { ascending: false });
      if (error) throw error;
      return (rows ?? []) as { id: string; data_biometria: string; peso_medio_g: number; amostras: number | null; crescimento_semanal_g: number | null }[];
    },
  });
  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("biometrias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Biometria removida");
      qc.invalidateQueries({ queryKey: ["biometrias"] });
      qc.invalidateQueries({ queryKey: ["viveiros"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalShell title={`Histórico de biometrias · ${viveiro.nome}`} onClose={onClose}>
      <div className="space-y-3">
        <button type="button" onClick={onNova} className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90"><Plus className="size-4" /> Nova biometria</button>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : bios.length === 0 ? (
          <div className="p-6 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground">Nenhuma biometria ainda. Toque em "Nova biometria".</div>
        ) : (
          <ul className="space-y-2">
            {bios.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-card border">
                <div className="min-w-0">
                  <p className="text-sm font-semibold flex items-center gap-1.5"><CalendarDays className="size-3.5 text-muted-foreground" />{formatDateBR(b.data_biometria)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {b.crescimento_semanal_g != null ? `+${Number(b.crescimento_semanal_g).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} g/sem` : "—"}
                    {b.amostras ? ` · ${b.amostras} camarões` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-lg font-black text-primary tabular-nums">{Number(b.peso_medio_g).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} g</span>
                  <button type="button" onClick={() => { if (confirm("Apagar esta biometria?")) delMut.mutate(b.id); }} className="size-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"><Trash2 className="size-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ModalStyle />
    </ModalShell>
  );
}
