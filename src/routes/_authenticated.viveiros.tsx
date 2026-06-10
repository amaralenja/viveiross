import { todayLocal } from "@/lib/date";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Warehouse, Trash2, X, Utensils, Power, ChevronRight, Pencil, CalendarDays } from "lucide-react";

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
  qtd_povoada: number | null;
  fornecedor: string | null;
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
        .select("id, nome, status, data_povoamento, qtd_povoada, fornecedor, fazendas(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Viveiro[];
    },
  });

  const { data: totaisPorViveiro = { racao: {}, custo: {}, primeiraData: {} } } = useQuery({
    queryKey: ["viveiros", "totais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("viveiro_id, quantidade, custo_total, preco_unidade, produto_id, data_lancamento, produtos(preco_unidade)")
        .eq("tipo", "racao");
      if (error) throw error;
      const racao: Record<string, number> = {};
      const custo: Record<string, number> = {};
      const primeiraData: Record<string, string> = {};
      for (const l of (data ?? []) as Array<{
        viveiro_id: string;
        quantidade: number | null;
        custo_total: number | null;
        preco_unidade: number | null;
        data_lancamento: string | null;
        produtos: { preco_unidade: number | null } | { preco_unidade: number | null }[] | null;
      }>) {
        const qtd = Number(l.quantidade ?? 0);
        racao[l.viveiro_id] = (racao[l.viveiro_id] ?? 0) + qtd;
        let valor: number | null = null;
        if (l.custo_total != null) {
          valor = Number(l.custo_total);
        } else {
          const prod = Array.isArray(l.produtos) ? l.produtos[0] : l.produtos;
          const preco = l.preco_unidade ?? prod?.preco_unidade ?? null;
          if (preco != null) valor = Number(preco) * qtd;
        }
        if (valor != null) {
          custo[l.viveiro_id] = (custo[l.viveiro_id] ?? 0) + valor;
        }
        if (l.data_lancamento) {
          const atual = primeiraData[l.viveiro_id];
          if (!atual || l.data_lancamento < atual) {
            primeiraData[l.viveiro_id] = l.data_lancamento;
          }
        }
      }
      return { racao, custo, primeiraData };
    },
  });
  const racaoPorViveiro = totaisPorViveiro.racao ?? {};
  const custoPorViveiro = totaisPorViveiro.custo ?? {};
  const primeiraDataPorViveiro = totaisPorViveiro.primeiraData ?? {};

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

  type LancItem = {
    id: string;
    viveiro_id: string;
    data_lancamento: string;
    quantidade: number | null;
    tipo: string | null;
    produtos: { nome: string } | { nome: string }[] | null;
  };
  const { data: lancamentosPorViveiro = {} } = useQuery({
    queryKey: ["viveiros", "lancamentos-recentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("id, viveiro_id, data_lancamento, quantidade, tipo, produtos(nome)")
        .order("data_lancamento", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, LancItem[]> = {};
      for (const l of (data ?? []) as LancItem[]) {
        if (!map[l.viveiro_id]) map[l.viveiro_id] = [];
        if (map[l.viveiro_id].length < 3) map[l.viveiro_id].push(l);
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


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Viveiros</h1>
          <p className="text-muted-foreground mt-1">{viveiros.length} cadastrados</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="h-12 px-5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 shrink-0"
        >
          <Plus className="size-5" /> Novo
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : viveiros.length === 0 ? (
        <EmptyState onAdd={() => setOpen(true)} />
      ) : (
        <ul className="space-y-3">
          {viveiros.map((v) => {
            const ativo = v.status === "ativo";
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
                      <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${ativo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {ativo ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {relName(v.fazendas) || "Sem fazenda"}
                    </p>
                    {v.fornecedor && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        Laboratório: <span className="font-medium text-foreground">{v.fornecedor}</span>
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Remover "${v.nome}"?`)) delMut.mutate(v.id);
                  }}
                  className="size-10 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center shrink-0"
                  aria-label="Remover viveiro"
                >
                  <Trash2 className="size-5" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setHistoricoViveiro(v)}
                  className="text-left relative group"
                  title="Ver dias de lançamento"
                >
                  {(() => {
                    const base = v.data_povoamento ?? primeiraDataPorViveiro[v.id] ?? null;
                    return (
                      <InfoBlock
                        label="Dias de cultivo"
                        value={base ? `${diasDeCultivo(base)}` : "—"}
                        hint={
                          v.data_povoamento
                            ? formatDateBR(v.data_povoamento)
                            : base
                            ? `desde ${formatDateBR(base)}`
                            : "Toque pra definir"
                        }
                        highlight
                      />
                    );
                  })()}
                  <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/15 px-1.5 py-0.5 rounded-md">
                    Ver <ChevronRight className="size-3" />
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
                  label="Gasto total"
                  value={(custoPorViveiro[v.id] ?? 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  hint="ração"
                  highlight
                />
              </div>
              {(() => {
                const bios = biometriasPorViveiro[v.id] ?? [];
                if (bios.length === 0) return null;
                return (
                  <div className="mt-3 p-3 rounded-xl border bg-muted/30">
                    <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground mb-2">
                      Últimas biometrias
                    </p>
                    <ul className="space-y-1.5">
                      {bios.map((b) => (
                        <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                            <CalendarDays className="size-3.5" />
                            {formatDateBR(b.data_biometria)}
                          </span>
                          <span className="font-semibold text-foreground">
                            {Number(b.peso_medio_g).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} g
                          </span>
                          {b.crescimento_semanal_g != null && (
                            <span className="text-xs text-primary font-medium">
                              +{Number(b.crescimento_semanal_g).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} g/sem
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              {(() => {
                const lancs = lancamentosPorViveiro[v.id] ?? [];
                if (lancs.length === 0) return null;
                return (
                  <div className="mt-3 p-3 rounded-xl border bg-muted/30">
                    <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground mb-2">
                      Últimos lançamentos
                    </p>
                    <ul className="space-y-1.5">
                      {lancs.map((l) => {
                        const prod = Array.isArray(l.produtos) ? l.produtos[0] : l.produtos;
                        return (
                          <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                              <CalendarDays className="size-3.5" />
                              {formatDateBR(l.data_lancamento)}
                            </span>
                            <span className="font-medium text-foreground truncate flex-1 text-right">
                              {prod?.nome ?? l.tipo ?? "—"}
                            </span>
                            <span className="text-xs font-semibold text-primary shrink-0">
                              {Number(l.quantidade ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRacaoViveiro(v)}
                  disabled={!ativo}
                  className="h-11 rounded-xl bg-primary/10 text-primary font-semibold flex items-center justify-center gap-2 hover:bg-primary/15 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Utensils className="size-5" /> Lançar ração
                </button>
                <button
                  onClick={() => statusMut.mutate({ id: v.id, status: ativo ? "inativo" : "ativo" })}
                  className={`h-11 rounded-xl font-semibold flex items-center justify-center gap-2 ${ativo ? "bg-muted text-foreground hover:bg-muted/70" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                >
                  <Power className="size-5" /> {ativo ? "Desativar" : "Ativar"}
                </button>
              </div>
            </li>
            );
          })}
        </ul>
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
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            setRacaoViveiro(null);
          }}
        />
      )}

      {historicoViveiro && (
        <HistoricoModal
          viveiro={historicoViveiro}
          baseDate={
            historicoViveiro.data_povoamento ??
            primeiraDataPorViveiro[historicoViveiro.id] ??
            null
          }
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
        tipo: "racao",
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
                onChange={(e) => setProdutoId(e.target.value)}
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade">
            <input
              required
              type="number"
              min="0.001"
              step="0.001"
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
  const [qtdPovoada, setQtdPovoada] = useState(
    viveiro.qtd_povoada != null ? String(viveiro.qtd_povoada) : "",
  );
  const [fornecedor, setFornecedor] = useState(viveiro.fornecedor ?? "");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const qtd = qtdPovoada.trim() === "" ? null : Number(qtdPovoada);
      if (qtd != null && (isNaN(qtd) || qtd < 0)) throw new Error("Quantidade inválida.");
      const { error } = await supabase
        .from("viveiros")
        .update({
          data_povoamento: dataPovoamento || null,
          qtd_povoada: qtd,
          fornecedor: fornecedor.trim() || null,
        })
        .eq("id", viveiro.id);
      if (error) throw error;
      toast.success("Viveiro atualizado!");
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={`Editar · ${viveiro.nome}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Data de povoamento">
          <input
            type="date"
            value={dataPovoamento}
            onChange={(e) => setDataPovoamento(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Quantidade de pós-larvas">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={qtdPovoada}
            onChange={(e) => setQtdPovoada(e.target.value)}
            placeholder="0"
            className="input"
          />
        </Field>
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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <ModalStyle />
      <div className="bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="min-w-0">
            <h2 className="font-bold text-lg truncate">{viveiro.nome}</h2>
            <p className="text-xs text-muted-foreground">
              {totalDias > 0 ? `${totalDias} dias de cultivo` : "Sem cultivo iniciado"}
              {baseDate && ` · desde ${formatDateBR(baseDate)}`}
            </p>
          </div>
          <button onClick={onClose} className="size-10 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : datas.length === 0 ? (
            <div className="text-center py-10">
              <CalendarDays className="size-12 mx-auto text-muted-foreground" />
              <p className="mt-3 font-semibold">Nenhum lançamento ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Os dias com lançamento vão aparecer aqui.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
                {datas.length} {datas.length === 1 ? "dia com lançamento" : "dias com lançamento"}
              </p>
              <ul className="space-y-2">
                {datas.map((d) => {
                  const itens = porData.get(d)!;
                  const totalKg = itens
                    .filter((i) => i.tipo === "racao")
                    .reduce((s, i) => s + Number(i.quantidade ?? 0), 0);
                  const totalCusto = itens.reduce(
                    (s, i) => s + Number(i.custo_total ?? 0),
                    0,
                  );
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
                              {Number(i.quantidade ?? 0).toLocaleString("pt-BR", {
                                maximumFractionDigits: 2,
                              })}{" "}
                              {i.unidade}
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
