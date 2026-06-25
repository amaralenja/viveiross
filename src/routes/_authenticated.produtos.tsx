import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Package, Trash2, X, Pencil, Users, Boxes, ArrowDownToLine, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos & Funcionários" }] }),
  component: ProdutosPage,
});

type Produto = {
  id: string;
  nome: string;
  categoria: string;
  unidade: string;
  preco_unidade: number | null;
};

type Funcionario = {
  id: string;
  nome: string;
  salario: number;
  viveiro_id: string | null;
  ativo: boolean;
};

type ViveiroOpt = { id: string; nome: string };

type EstoqueEntrada = {
  id: string;
  produto_id: string;
  quantidade: number;
  unidade: string;
  preco_unidade: number | null;
  custo_total: number | null;
  fornecedor: string | null;
  data_entrada: string;
  observacao: string | null;
};

type ConsumoRow = { produto_id: string | null; quantidade: number };

function formatBRL(v: number | null | undefined) {
  if (v == null) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ProdutosPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"produtos" | "funcionarios" | "estoque">("produtos");
  const [openProd, setOpenProd] = useState(false);
  const [editandoProd, setEditandoProd] = useState<Produto | null>(null);
  const [openFunc, setOpenFunc] = useState(false);
  const [editandoFunc, setEditandoFunc] = useState<Funcionario | null>(null);
  const [openEntrada, setOpenEntrada] = useState(false);
  const [editandoEntrada, setEditandoEntrada] = useState<EstoqueEntrada | null>(null);

  const produtosQuery = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, categoria, unidade, preco_unidade")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });

  const funcionariosQuery = useQuery({
    queryKey: ["funcionarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("id, nome, salario, viveiro_id, ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Funcionario[];
    },
  });

  const viveirosQuery = useQuery({
    queryKey: ["viveiros", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, status")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ViveiroOpt[];
    },
  });

  const produtos = produtosQuery.data ?? [];
  const funcionarios = funcionariosQuery.data ?? [];
  const viveiros = viveirosQuery.data ?? [];

  const delProdMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produtos"] });
      toast.success("Produto removido");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const delFuncMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("funcionarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funcionarios"] });
      toast.success("Funcionário removido");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isProdTab = tab === "produtos";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Cadastros</h1>
          <p className="text-muted-foreground mt-1">
            {produtos.length} produtos · {funcionarios.length} funcionários
          </p>
        </div>
        <button
          onClick={() => (isProdTab ? setOpenProd(true) : setOpenFunc(true))}
          className="h-12 px-5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 shrink-0"
        >
          <Plus className="size-5" /> Novo
        </button>
      </div>

      <div className="flex gap-2 p-1 rounded-xl bg-muted">
        {(["produtos", "funcionarios"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 h-10 rounded-lg font-semibold text-sm transition ${
              tab === t
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "produtos" ? "Produtos" : "Funcionários"}
          </button>
        ))}
      </div>

      {isProdTab ? (
        produtos.length === 0 ? (
          <Empty
            icon={<Package className="size-12 mx-auto text-muted-foreground" />}
            titulo="Nenhum produto ainda"
            descricao="Cadastre rações e outros insumos."
            onClick={() => setOpenProd(true)}
          />
        ) : (
          <ul className="space-y-3">
            {produtos.map((p) => (
              <li
                key={p.id}
                className="p-4 rounded-2xl bg-card border flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Package className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{p.nome}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {p.categoria} · {p.unidade}
                      {p.preco_unidade != null && (
                        <>
                          {" · "}
                          <span className="text-primary font-semibold normal-case">
                            {formatBRL(Number(p.preco_unidade))}/{p.unidade}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <RowActions
                  onEdit={() => setEditandoProd(p)}
                  onDel={() => {
                    if (confirm(`Remover "${p.nome}"?`)) delProdMut.mutate(p.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )
      ) : funcionarios.length === 0 ? (
        <Empty
          icon={<Users className="size-12 mx-auto text-muted-foreground" />}
          titulo="Nenhum funcionário ainda"
          descricao="Cadastre o salário pra puxar automático no caixa."
          onClick={() => setOpenFunc(true)}
        />
      ) : (
        <ul className="space-y-3">
          {funcionarios.map((f) => {
            const viv = viveiros.find((v) => v.id === f.viveiro_id);
            return (
              <li
                key={f.id}
                className="p-4 rounded-2xl bg-card border flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Users className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{f.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="text-primary font-semibold">
                        {formatBRL(Number(f.salario))}/mês
                      </span>
                      {" · "}
                      {viv ? viv.nome : "rateado entre todos"}
                    </p>
                  </div>
                </div>
                <RowActions
                  onEdit={() => setEditandoFunc(f)}
                  onDel={() => {
                    if (confirm(`Remover "${f.nome}"?`)) delFuncMut.mutate(f.id);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      {(openProd || editandoProd) && (
        <ProdutoModal
          produto={editandoProd}
          onClose={() => {
            setOpenProd(false);
            setEditandoProd(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["produtos"] });
            qc.invalidateQueries({ queryKey: ["viveiros", "totais"] });
            setOpenProd(false);
            setEditandoProd(null);
          }}
        />
      )}

      {(openFunc || editandoFunc) && (
        <FuncionarioModal
          funcionario={editandoFunc}
          viveiros={viveiros}
          onClose={() => {
            setOpenFunc(false);
            setEditandoFunc(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["funcionarios"] });
            setOpenFunc(false);
            setEditandoFunc(null);
          }}
        />
      )}
    </div>
  );
}

function Empty({
  icon,
  titulo,
  descricao,
  onClick,
}: {
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <div className="p-10 rounded-2xl border-2 border-dashed text-center">
      {icon}
      <h3 className="mt-3 font-semibold text-lg">{titulo}</h3>
      <p className="text-muted-foreground mt-1">{descricao}</p>
      <button
        onClick={onClick}
        className="mt-4 h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2"
      >
        <Plus className="size-5" /> Cadastrar
      </button>
    </div>
  );
}

function RowActions({ onEdit, onDel }: { onEdit: () => void; onDel: () => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={onEdit}
        className="size-10 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary flex items-center justify-center"
        aria-label="Editar"
      >
        <Pencil className="size-5" />
      </button>
      <button
        onClick={onDel}
        className="size-10 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
        aria-label="Remover"
      >
        <Trash2 className="size-5" />
      </button>
    </div>
  );
}

function ProdutoModal({
  produto,
  onClose,
  onSaved,
}: {
  produto: Produto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [categoria, setCategoria] = useState(produto?.categoria ?? "racao");
  const [unidade, setUnidade] = useState(produto?.unidade ?? "kg");
  const [preco, setPreco] = useState(
    produto?.preco_unidade != null ? String(produto.preco_unidade) : "",
  );
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Sem sessão");

      const preco_unidade = preco.trim() === "" ? null : Number(preco);
      if (preco_unidade != null && (isNaN(preco_unidade) || preco_unidade < 0)) {
        throw new Error("Preço inválido");
      }

      if (produto) {
        const { error } = await supabase
          .from("produtos")
          .update({
            nome: nome.trim(),
            categoria,
            unidade: unidade.trim() || "kg",
            preco_unidade,
          })
          .eq("id", produto.id);
        if (error) throw error;
        toast.success("Produto atualizado!");
      } else {
        const { error } = await supabase.from("produtos").insert({
          user_id,
          nome: nome.trim(),
          categoria,
          unidade: unidade.trim() || "kg",
          preco_unidade,
        });
        if (error) throw error;
        toast.success("Produto criado!");
      }
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={produto ? "Editar produto" : "Novo produto"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Ração 35%"
            className="app-input"
          />
        </Field>

        <Field label="Categoria">
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="app-input"
          >
            <option value="racao">Ração</option>
            <option value="probiotico">Probiótico</option>
            <option value="medicamento">Medicamento</option>
            <option value="fertilizante">Fertilizante</option>
            <option value="servico">Serviço (eletricista, frete, etc.)</option>
            <option value="outro">Outro</option>
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Unidade">
            <input
              required
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              placeholder="kg"
              className="app-input"
            />
          </Field>
          <Field label={`Preço por ${unidade || "un"} (R$)`}>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder="0,00"
              className="app-input"
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
    </ModalShell>
  );
}

function FuncionarioModal({
  funcionario,
  viveiros,
  onClose,
  onSaved,
}: {
  funcionario: Funcionario | null;
  viveiros: ViveiroOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(funcionario?.nome ?? "");
  const [salario, setSalario] = useState(
    funcionario?.salario != null ? String(funcionario.salario) : "",
  );
  const [viveiroId, setViveiroId] = useState<string>(funcionario?.viveiro_id ?? "");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Sem sessão");

      const salarioNum = Number(salario.replace(",", "."));
      if (isNaN(salarioNum) || salarioNum < 0) throw new Error("Salário inválido");

      const payload = {
        nome: nome.trim(),
        salario: salarioNum,
        viveiro_id: viveiroId || null,
      };

      if (funcionario) {
        const { error } = await supabase
          .from("funcionarios")
          .update(payload)
          .eq("id", funcionario.id);
        if (error) throw error;
        toast.success("Funcionário atualizado!");
      } else {
        const { error } = await supabase
          .from("funcionarios")
          .insert({ ...payload, user_id });
        if (error) throw error;
        toast.success("Funcionário criado!");
      }
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell
      title={funcionario ? "Editar funcionário" : "Novo funcionário"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: João Silva"
            className="app-input"
          />
        </Field>

        <Field label="Salário mensal (R$)">
          <input
            required
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={salario}
            onChange={(e) => setSalario(e.target.value)}
            placeholder="0,00"
            className="app-input"
          />
        </Field>

        <Field label="Viveiro (opcional)">
          <select
            value={viveiroId}
            onChange={(e) => setViveiroId(e.target.value)}
            className="app-input"
          >
            <option value="">🔄 Rateado entre todos os viveiros</option>
            {viveiros.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Sem viveiro = salário dividido igual entre todos.
          </p>
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
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
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="size-9 rounded-lg hover:bg-muted flex items-center justify-center"
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1.5">{label}</span>
      {children}
    </label>
  );
}
