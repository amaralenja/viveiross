import { todayLocal } from "@/lib/date";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Warehouse, Trash2, X, Utensils, Power } from "lucide-react";

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
  const [editandoData, setEditandoData] = useState<string | null>(null);
  const [novaData, setNovaData] = useState("");

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
        .select("id, nome, status, data_povoamento, qtd_povoada, fazendas(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Viveiro[];
    },
  });

  const { data: racaoPorViveiro = {} } = useQuery({
    queryKey: ["viveiros", "racao-total"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("viveiro_id, quantidade")
        .eq("tipo", "racao");
      if (error) throw error;
      const acc: Record<string, number> = {};
      for (const l of data ?? []) {
        acc[l.viveiro_id] = (acc[l.viveiro_id] ?? 0) + Number(l.quantidade ?? 0);
      }
      return acc;
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

  const dataMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: string | null }) => {
      const { error } = await supabase
        .from("viveiros")
        .update({ data_povoamento: data })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["viveiros"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setEditandoData(null);
      toast.success("Data atualizada");
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
              <div className="mt-3 grid grid-cols-3 gap-2">
                {editandoData === v.id ? (
                  <div className="col-span-3 p-3 rounded-xl border bg-primary/5 space-y-2">
                    <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
                      Data de povoamento
                    </p>
                    <input
                      type="date"
                      value={novaData}
                      onChange={(e) => setNovaData(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg border bg-background text-base"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => dataMut.mutate({ id: v.id, data: novaData || null })}
                        disabled={dataMut.isPending}
                        className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50"
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditandoData(null)}
                        className="flex-1 h-10 rounded-lg bg-muted font-semibold"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setNovaData(v.data_povoamento ?? todayLocal());
                        setEditandoData(v.id);
                      }}
                      className="text-left"
                      title="Clique pra editar a data de povoamento"
                    >
                      <InfoBlock
                        label="Dias de cultivo"
                        value={v.data_povoamento ? `${diasDeCultivo(v.data_povoamento)}` : "—"}
                        hint={v.data_povoamento ? formatDateBR(v.data_povoamento) : "Toque pra definir"}
                        highlight
                      />
                    </button>
                    <InfoBlock
                      label="Povoamento"
                      value={v.qtd_povoada ? v.qtd_povoada.toLocaleString("pt-BR") : "—"}
                      hint="pós-larvas"
                    />
                    <InfoBlock
                      label="Ração total"
                      value={`${(racaoPorViveiro[v.id] ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`}
                      hint="kg"
                    />
                  </>
                )}
              </div>
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
            qc.invalidateQueries({ queryKey: ["viveiros", "racao-total"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            setRacaoViveiro(null);
          }}
        />
      )}
    </div>
  );
}

function diasDeCultivo(data: string) {
  const [y, m, d] = data.split("-").map(Number);
  const inicio = new Date(y, (m ?? 1) - 1, d ?? 1);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((hoje.getTime() - inicio.getTime()) / 86400000));
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
      className={`p-3 rounded-xl border ${
        highlight ? "bg-primary/10 border-primary/20" : "bg-muted/40"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-bold leading-tight ${highlight ? "text-primary" : "text-foreground"}`}>
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
  const [observacao, setObservacao] = useState("");
  const [novoProdutoNome, setNovoProdutoNome] = useState("");
  const [novoProdutoUnidade, setNovoProdutoUnidade] = useState("kg");
  const [criandoProduto, setCriandoProduto] = useState(false);

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos", "racao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, categoria, unidade")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; categoria: string; unidade: string }[];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Sessão expirada.");
      if (!quantidade || Number(quantidade) <= 0) throw new Error("Informe a quantidade.");

      let produto: { id: string; nome: string; categoria: string; unidade: string } | undefined;

      if (criandoProduto) {
        if (!novoProdutoNome.trim()) throw new Error("Informe o nome do produto.");
        const { data: novo, error: pErr } = await supabase
          .from("produtos")
          .insert({
            user_id,
            nome: novoProdutoNome.trim(),
            categoria: "Ração",
            unidade: novoProdutoUnidade.trim() || "kg",
          })
          .select()
          .single();
        if (pErr) throw pErr;
        produto = novo;
        qc.invalidateQueries({ queryKey: ["produtos"] });
      } else {
        if (!produtoId) throw new Error("Escolha um produto.");
        produto = produtos.find((p) => p.id === produtoId);
        if (!produto) throw new Error("Produto inválido.");
      }

      const { error } = await supabase.from("lancamentos").insert({
        user_id,
        viveiro_id: viveiro.id,
        produto_id: produto.id,
        tipo: "racao",
        produto_nome: produto.nome,
        quantidade: Number(quantidade),
        unidade: produto.unidade,
        data_lancamento: dataLancamento,
        observacao: observacao.trim() || null,
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
            <Field label="Unidade">
              <input
                required
                value={novoProdutoUnidade}
                onChange={(e) => setNovoProdutoUnidade(e.target.value)}
                placeholder="kg"
                className="input"
              />
            </Field>
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

        <Field label="Observação">
          <input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Opcional"
            className="input"
          />
        </Field>

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
