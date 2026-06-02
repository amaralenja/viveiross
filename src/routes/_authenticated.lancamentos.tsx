import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { ClipboardList, Plus, Trash2, Utensils, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function normalizeTipo(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim() || "outro";
}

type FazendaOption = { id: string; nome: string };
type ViveiroOption = {
  id: string;
  nome: string;
  fazendas: { nome: string } | { nome: string }[] | null;
};
type ProdutoOption = { id: string; nome: string; categoria: string; unidade: string };
type LancamentoRow = {
  id: string;
  data_lancamento: string;
  produto_nome: string;
  quantidade: number;
  tipo: string;
  unidade: string;
  viveiros: { nome: string } | { nome: string }[] | null;
};

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({ meta: [{ title: "Lançamentos" }] }),
  component: LancamentosPage,
});

const CATEGORIAS = [
  { value: "racao", label: "Ração" },
  { value: "probiotico", label: "Probiótico" },
  { value: "medicamento", label: "Medicamento" },
  { value: "fertilizante", label: "Fertilizante" },
  { value: "outro", label: "Outro" },
] as const;

function relName(rel: { nome: string } | { nome: string }[] | null | undefined): string {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.nome ?? "";
  return rel.nome ?? "";
}

function LancamentosPage() {
  const qc = useQueryClient();
  const [viveiroId, setViveiroId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [dataLancamento, setDataLancamento] = useState(new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState("");

  const [openViveiro, setOpenViveiro] = useState(false);
  const [openProduto, setOpenProduto] = useState(false);

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, status, fazendas(nome)")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ViveiroOption[];
    },
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as ProdutoOption[];
    },
  });

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ["lancamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("id, data_lancamento, produto_nome, quantidade, tipo, unidade, viveiros(nome)")
        .order("data_lancamento", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as LancamentoRow[];
    },
  });

  const totalHoje = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return lancamentos
      .filter((l) => l.data_lancamento === hoje && l.tipo === "racao")
      .reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
  }, [lancamentos]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada. Entre novamente.");
      if (!viveiroId) throw new Error("Escolha um viveiro.");
      if (!produtoId) throw new Error("Escolha um produto.");
      const produto = produtos.find((p) => p.id === produtoId);
      if (!produto) throw new Error("Produto inválido.");

      const { error } = await supabase.from("lancamentos").insert({
        user_id: userId,
        viveiro_id: viveiroId,
        produto_id: produto.id,
        tipo: normalizeTipo(produto.categoria),
        produto_nome: produto.nome,
        quantidade: Number(quantidade),
        unidade: produto.unidade,
        data_lancamento: dataLancamento,
        observacao: observacao.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento salvo");
      setQuantidade("");
      setObservacao("");
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Lançar agora</h1>
        <p className="text-muted-foreground mt-1">Ração, probiótico e manejo diário</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="p-5 rounded-2xl bg-primary text-primary-foreground sm:col-span-2">
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Utensils className="size-4" /> Ração lançada hoje
          </div>
          <p className="mt-2 text-4xl font-bold">{formatNumber(totalHoje)} kg</p>
        </div>
        <div className="p-5 rounded-2xl bg-card border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardList className="size-4" /> Últimos lançamentos
          </div>
          <p className="mt-2 text-4xl font-bold">{lancamentos.length}</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="space-y-4 rounded-2xl bg-card border p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Viveiro"
            action={
              <button
                type="button"
                onClick={() => setOpenViveiro(true)}
                className="text-xs font-semibold text-primary inline-flex items-center gap-1"
              >
                <Plus className="size-3" /> Novo
              </button>
            }
          >
            <select
              required
              value={viveiroId}
              onChange={(e) => setViveiroId(e.target.value)}
              className="app-input"
            >
              <option value="">{viveiros.length ? "Escolha" : "Nenhum viveiro ainda"}</option>
              {viveiros.map((v) => {
                const fazenda = relName(v.fazendas);
                return (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                    {fazenda ? ` · ${fazenda}` : ""}
                  </option>
                );
              })}
            </select>
          </Field>

          <Field
            label="Produto"
            action={
              <button
                type="button"
                onClick={() => setOpenProduto(true)}
                className="text-xs font-semibold text-primary inline-flex items-center gap-1"
              >
                <Plus className="size-3" /> Novo
              </button>
            }
          >
            <select
              required
              value={produtoId}
              onChange={(e) => setProdutoId(e.target.value)}
              className="app-input"
            >
              <option value="">{produtos.length ? "Escolha" : "Nenhum produto ainda"}</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({p.unidade})
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Quantidade">
            <input
              required
              min="0.001"
              step="0.001"
              type="number"
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="app-input"
              placeholder="0"
            />
          </Field>
          <Field label="Data">
            <input
              required
              type="date"
              value={dataLancamento}
              onChange={(e) => setDataLancamento(e.target.value)}
              className="app-input"
            />
          </Field>
          <Field label="Observação">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="app-input"
              placeholder="Opcional"
            />
          </Field>
        </div>

        <button
          disabled={saveMut.isPending}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
        >
          {saveMut.isPending ? "Salvando..." : "Salvar lançamento"}
        </button>
      </form>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Histórico</h2>
        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : lancamentos.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
            Nenhum lançamento ainda.
          </p>
        ) : (
          <ul className="space-y-3">
            {lancamentos.map((l) => (
              <li
                key={l.id}
                className="rounded-2xl bg-card border p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    {l.produto_nome} · {formatNumber(l.quantidade)} {l.unidade}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {formatDate(l.data_lancamento)} · {relName(l.viveiros) || "Viveiro"}
                  </p>
                </div>
                <button
                  onClick={() => delMut.mutate(l.id)}
                  className="size-10 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center shrink-0"
                  aria-label="Remover lançamento"
                >
                  <Trash2 className="size-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {openViveiro && (
        <NovoViveiroModal
          onClose={() => setOpenViveiro(false)}
          onCreated={(id) => {
            setViveiroId(id);
            qc.invalidateQueries({ queryKey: ["viveiros"] });
          }}
        />
      )}
      {openProduto && (
        <NovoProdutoModal
          onClose={() => setOpenProduto(false)}
          onCreated={(id) => {
            setProdutoId(id);
            qc.invalidateQueries({ queryKey: ["produtos"] });
          }}
        />
      )}
    </div>
  );
}

function NovoViveiroModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [fazendaId, setFazendaId] = useState("");
  const [novaFazenda, setNovaFazenda] = useState("");
  const [qtdPovoada, setQtdPovoada] = useState("");
  const [dataPovoamento, setDataPovoamento] = useState(new Date().toISOString().slice(0, 10));

  const { data: fazendas = [] } = useQuery({
    queryKey: ["fazendas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fazendas").select("id, nome").order("nome");
      if (error) throw error;
      return (data ?? []) as FazendaOption[];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada.");
      if (!nome.trim()) throw new Error("Informe o nome do viveiro.");

      let finalFazendaId = fazendaId;
      if (fazendaId === "__new") {
        if (!novaFazenda.trim()) throw new Error("Informe o nome da fazenda.");
        const { data: f, error: fErr } = await supabase
          .from("fazendas")
          .insert({ user_id: userId, nome: novaFazenda.trim() })
          .select()
          .single();
        if (fErr) throw fErr;
        finalFazendaId = f.id;
        qc.invalidateQueries({ queryKey: ["fazendas"] });
      }
      if (!finalFazendaId) throw new Error("Escolha uma fazenda.");

      const { data: v, error } = await supabase
        .from("viveiros")
        .insert({
          user_id: userId,
          nome: nome.trim(),
          fazenda_id: finalFazendaId,
          qtd_povoada: qtdPovoada ? Number(qtdPovoada) : null,
          data_povoamento: qtdPovoada ? dataPovoamento : null,
          status: "ativo",
        })
        .select()
        .single();
      if (error) throw error;
      return v.id as string;
    },
    onSuccess: (id) => {
      toast.success("Viveiro criado");
      onCreated(id);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Modal title="Novo viveiro" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Nome do viveiro">
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="app-input"
            placeholder="Ex: Viveiro 1"
          />
        </Field>
        <Field label="Fazenda">
          <select
            required
            value={fazendaId}
            onChange={(e) => setFazendaId(e.target.value)}
            className="app-input"
          >
            <option value="">Escolha</option>
            {fazendas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
            <option value="__new">+ Nova fazenda</option>
          </select>
        </Field>
        {fazendaId === "__new" && (
          <Field label="Nome da nova fazenda">
            <input
              required
              value={novaFazenda}
              onChange={(e) => setNovaFazenda(e.target.value)}
              className="app-input"
              placeholder="Ex: Fazenda Boa Vista"
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Qtd. povoada">
            <input
              type="number"
              min="0"
              value={qtdPovoada}
              onChange={(e) => setQtdPovoada(e.target.value)}
              className="app-input"
              placeholder="Opcional"
            />
          </Field>
          <Field label="Data do povoamento">
            <input
              type="date"
              value={dataPovoamento}
              onChange={(e) => setDataPovoamento(e.target.value)}
              className="app-input"
            />
          </Field>
        </div>
        <button
          disabled={mut.isPending}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
        >
          {mut.isPending ? "Salvando..." : "Criar viveiro"}
        </button>
      </form>
    </Modal>
  );
}

function NovoProdutoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [unidade, setUnidade] = useState("kg");

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorias")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada.");
      if (!nome.trim()) throw new Error("Informe o nome do produto.");

      let finalCategoria = categoria;
      if (categoria === "__new") {
        const nomeCat = novaCategoria.trim();
        if (!nomeCat) throw new Error("Informe o nome da categoria.");
        const { error: catErr } = await supabase
          .from("categorias")
          .insert({ user_id: userId, nome: nomeCat });
        if (catErr && !String(catErr.message).includes("duplicate")) throw catErr;
        finalCategoria = nomeCat;
        qc.invalidateQueries({ queryKey: ["categorias"] });
      }
      if (!finalCategoria) throw new Error("Escolha uma categoria.");

      const { data, error } = await supabase
        .from("produtos")
        .insert({
          user_id: userId,
          nome: nome.trim(),
          categoria: finalCategoria,
          unidade: unidade.trim() || "kg",
        })
        .select()
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Produto criado");
      onCreated(id);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Modal title="Novo produto" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Nome do produto">
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="app-input"
            placeholder="Ex: Ração 35%"
          />
        </Field>
        <Field label="Categoria">
          <select
            required
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="app-input"
          >
            <option value="">Escolha</option>
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.label}>
                {c.label}
              </option>
            ))}
            {categorias.map((c) => (
              <option key={c.id} value={c.nome}>
                {c.nome}
              </option>
            ))}
            <option value="__new">+ Nova categoria</option>
          </select>
        </Field>
        {categoria === "__new" && (
          <Field label="Nome da nova categoria">
            <input
              required
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
              className="app-input"
              placeholder="Ex: Suplemento, Cal..."
            />
          </Field>
        )}
        <Field label="Unidade">
          <input
            required
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            className="app-input"
            placeholder="kg, L, un..."
          />
        </Field>
        <button
          disabled={mut.isPending}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
        >
          {mut.isPending ? "Salvando..." : "Criar produto"}
        </button>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="size-9 rounded-lg hover:bg-muted flex items-center justify-center"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        {action}
      </span>
      {children}
    </label>
  );
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}
