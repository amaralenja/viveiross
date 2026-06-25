import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Package, Trash2, X, Pencil, Users, Boxes, ArrowDownToLine, AlertTriangle, ShoppingCart, Receipt } from "lucide-react";
import { todayLocal } from "@/lib/date";

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

function formatBRL(v: number | null | undefined) {
  if (v == null) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ProdutosPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"produtos" | "funcionarios" | "estoque" | "compras" | "despesas">("produtos");
  const [openProd, setOpenProd] = useState(false);
  const [editandoProd, setEditandoProd] = useState<Produto | null>(null);
  const [openFunc, setOpenFunc] = useState(false);
  const [editandoFunc, setEditandoFunc] = useState<Funcionario | null>(null);
  const [openEntrada, setOpenEntrada] = useState(false);
  const [editandoEntrada, setEditandoEntrada] = useState<EstoqueEntrada | null>(null);
  const [openDesp, setOpenDesp] = useState(false);
  const [editandoDesp, setEditandoDesp] = useState<Despesa | null>(null);

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

  const entradasQuery = useQuery({
    queryKey: ["estoque_entradas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estoque_entradas")
        .select("id, produto_id, quantidade, unidade, preco_unidade, custo_total, fornecedor, data_entrada, observacao")
        .order("data_entrada", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EstoqueEntrada[];
    },
  });

  const consumoQuery = useQuery({
    queryKey: ["estoque_consumo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("produto_id, quantidade")
        .eq("tipo", "racao")
        .not("produto_id", "is", null);
      if (error) throw error;
      return (data ?? []) as ConsumoRow[];
    },
  });

  const despesasQuery = useQuery({
    queryKey: ["despesas_gerais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despesas_gerais")
        .select("id, viveiro_id, descricao, categoria, valor, data_despesa, rateio, observacao")
        .order("data_despesa", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Despesa[];
    },
  });

  const produtos = produtosQuery.data ?? [];
  const funcionarios = funcionariosQuery.data ?? [];
  const viveiros = viveirosQuery.data ?? [];
  const entradas = entradasQuery.data ?? [];
  const consumo = consumoQuery.data ?? [];
  const despesas = despesasQuery.data ?? [];

  const saldoPorProduto = new Map<string, { entradas: number; saidas: number }>();
  for (const e of entradas) {
    const cur = saldoPorProduto.get(e.produto_id) ?? { entradas: 0, saidas: 0 };
    cur.entradas += Number(e.quantidade ?? 0);
    saldoPorProduto.set(e.produto_id, cur);
  }
  for (const c of consumo) {
    if (!c.produto_id) continue;
    const cur = saldoPorProduto.get(c.produto_id) ?? { entradas: 0, saidas: 0 };
    cur.saidas += Number(c.quantidade ?? 0);
    saldoPorProduto.set(c.produto_id, cur);
  }

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

  const delEntradaMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("estoque_entradas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
      toast.success("Entrada removida");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const delDespMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("despesas_gerais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["despesas_gerais"] });
      toast.success("Despesa removida");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openNovo() {
    if (tab === "produtos") setOpenProd(true);
    else if (tab === "funcionarios") setOpenFunc(true);
    else if (tab === "despesas") setOpenDesp(true);
    else setOpenEntrada(true); // estoque ou compras
  }


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
          onClick={openNovo}
          className="h-12 px-5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 shrink-0"
        >
          <Plus className="size-5" />
          {tab === "estoque" || tab === "compras" ? (tab === "compras" ? "Compra" : "Entrada") : "Novo"}
        </button>
      </div>

      <div className="flex gap-2 p-1 rounded-xl bg-muted overflow-x-auto">
        {(["produtos", "funcionarios", "estoque", "compras"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 min-w-[88px] h-10 rounded-lg font-semibold text-sm transition ${
              tab === t
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "produtos" ? "Produtos" : t === "funcionarios" ? "Funcionários" : t === "estoque" ? "Estoque" : "Compras"}
          </button>
        ))}
      </div>

      {tab === "produtos" ? (
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
      ) : tab === "funcionarios" ? (
        funcionarios.length === 0 ? (
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
        )
      ) : tab === "estoque" ? (
        <EstoqueView
          produtos={produtos}
          entradas={entradas}
          saldoPorProduto={saldoPorProduto}
          onNovaEntrada={() => setOpenEntrada(true)}
          onEditEntrada={(e) => setEditandoEntrada(e)}
          onDelEntrada={(e) => {
            if (confirm(`Remover entrada de ${formatNumber(e.quantidade)} ${e.unidade}?`))
              delEntradaMut.mutate(e.id);
          }}
        />
      ) : (
        <ComprasView
          produtos={produtos}
          entradas={entradas}
          onNovaCompra={() => setOpenEntrada(true)}
          onEditCompra={(e) => setEditandoEntrada(e)}
          onDelCompra={(e) => {
            if (confirm(`Remover compra de ${formatNumber(e.quantidade)} ${e.unidade}?`))
              delEntradaMut.mutate(e.id);
          }}
        />
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

      {(openEntrada || editandoEntrada) && (
        <EntradaEstoqueModal
          entrada={editandoEntrada}
          produtos={produtos}
          onClose={() => {
            setOpenEntrada(false);
            setEditandoEntrada(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["estoque_entradas"] });
            setOpenEntrada(false);
            setEditandoEntrada(null);
          }}
        />
      )}
    </div>
  );
}

function formatNumber(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function EstoqueView({
  produtos,
  entradas,
  saldoPorProduto,
  onNovaEntrada,
  onEditEntrada,
  onDelEntrada,
}: {
  produtos: Produto[];
  entradas: EstoqueEntrada[];
  saldoPorProduto: Map<string, { entradas: number; saidas: number }>;
  onNovaEntrada: () => void;
  onEditEntrada: (e: EstoqueEntrada) => void;
  onDelEntrada: (e: EstoqueEntrada) => void;
}) {
  if (produtos.length === 0) {
    return (
      <Empty
        icon={<Boxes className="size-12 mx-auto text-muted-foreground" />}
        titulo="Cadastre produtos antes"
        descricao="Você precisa ter produtos cadastrados pra controlar o estoque."
        onClick={onNovaEntrada}
      />
    );
  }

  const produtosOrdenados = [...produtos].sort((a, b) => a.nome.localeCompare(b.nome));
  const totalEstoque = produtosOrdenados.reduce((sum, p) => {
    const s = saldoPorProduto.get(p.id);
    return sum + Math.max(0, (s?.entradas ?? 0) - (s?.saidas ?? 0));
  }, 0);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo total</p>
          <p className="text-2xl font-bold">{formatNumber(totalEstoque)} kg</p>
        </div>
        <button
          onClick={onNovaEntrada}
          className="h-11 px-4 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2"
        >
          <ArrowDownToLine className="size-4" /> Entrada
        </button>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
          Saldo por produto
        </h3>
        <ul className="space-y-2">
          {produtosOrdenados.map((p) => {
            const s = saldoPorProduto.get(p.id) ?? { entradas: 0, saidas: 0 };
            const saldo = s.entradas - s.saidas;
            const baixo = saldo <= 0;
            return (
              <li
                key={p.id}
                className="p-3 rounded-xl bg-card border flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Entradas {formatNumber(s.entradas)} · Saídas {formatNumber(s.saidas)} {p.unidade}
                  </p>
                </div>
                <div
                  className={`text-right shrink-0 ${baixo ? "text-destructive" : "text-foreground"}`}
                >
                  <p className="text-lg font-bold flex items-center gap-1 justify-end">
                    {baixo && <AlertTriangle className="size-4" />}
                    {formatNumber(saldo)} {p.unidade}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
          Últimas entradas
        </h3>
        {entradas.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
            Nenhuma entrada registrada.
          </p>
        ) : (
          <ul className="space-y-2">
            {entradas.slice(0, 20).map((e) => {
              const p = produtos.find((x) => x.id === e.produto_id);
              return (
                <li
                  key={e.id}
                  className="p-3 rounded-xl bg-card border flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{p?.nome ?? "Produto"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(`${e.data_entrada}T00:00:00`).toLocaleDateString("pt-BR")}
                      {" · "}
                      {formatNumber(e.quantidade)} {e.unidade}
                      {e.custo_total != null && ` · ${formatBRL(Number(e.custo_total))}`}
                      {e.fornecedor && ` · ${e.fornecedor}`}
                    </p>
                  </div>
                  <RowActions onEdit={() => onEditEntrada(e)} onDel={() => onDelEntrada(e)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ComprasView({
  produtos,
  entradas,
  onNovaCompra,
  onEditCompra,
  onDelCompra,
}: {
  produtos: Produto[];
  entradas: EstoqueEntrada[];
  onNovaCompra: () => void;
  onEditCompra: (e: EstoqueEntrada) => void;
  onDelCompra: (e: EstoqueEntrada) => void;
}) {
  if (produtos.length === 0) {
    return (
      <Empty
        icon={<ShoppingCart className="size-12 mx-auto text-muted-foreground" />}
        titulo="Cadastre produtos antes"
        descricao="Você precisa ter produtos cadastrados pra lançar compras."
        onClick={onNovaCompra}
      />
    );
  }

  const totalGasto = entradas.reduce((s, e) => s + Number(e.custo_total ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total gasto</p>
          <p className="text-2xl font-bold truncate">
            {formatBRL(totalGasto) ?? "R$ 0,00"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {entradas.length} {entradas.length === 1 ? "compra" : "compras"} · vai pro estoque
          </p>
        </div>
        <button
          onClick={onNovaCompra}
          className="h-11 px-4 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2 shrink-0"
        >
          <Plus className="size-4" /> Compra
        </button>
      </div>

      {entradas.length === 0 ? (
        <Empty
          icon={<ShoppingCart className="size-12 mx-auto text-muted-foreground" />}
          titulo="Nenhuma compra ainda"
          descricao="Lance a nota e o estoque atualiza sozinho."
          onClick={onNovaCompra}
        />
      ) : (
        <ul className="space-y-2">
          {entradas.map((e) => {
            const p = produtos.find((x) => x.id === e.produto_id);
            return (
              <li
                key={e.id}
                className="p-4 rounded-2xl bg-card border flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <ShoppingCart className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{p?.nome ?? "Produto"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(`${e.data_entrada}T00:00:00`).toLocaleDateString("pt-BR")}
                      {" · "}
                      {formatNumber(e.quantidade)} {e.unidade}
                      {e.preco_unidade != null && ` · ${formatBRL(Number(e.preco_unidade))}/${e.unidade}`}
                    </p>
                    {(e.custo_total != null || e.fornecedor) && (
                      <p className="text-xs mt-0.5">
                        {e.custo_total != null && (
                          <span className="text-primary font-semibold">
                            {formatBRL(Number(e.custo_total))}
                          </span>
                        )}
                        {e.fornecedor && (
                          <span className="text-muted-foreground">
                            {e.custo_total != null ? " · " : ""}
                            {e.fornecedor}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <RowActions onEdit={() => onEditCompra(e)} onDel={() => onDelCompra(e)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EntradaEstoqueModal({
  entrada,
  produtos,
  onClose,
  onSaved,
}: {
  entrada: EstoqueEntrada | null;
  produtos: Produto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [produtoId, setProdutoId] = useState(entrada?.produto_id ?? produtos[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState(
    entrada?.quantidade != null ? String(entrada.quantidade) : "",
  );
  const produtoSel = produtos.find((p) => p.id === produtoId);
  const [unidade, setUnidade] = useState(entrada?.unidade ?? produtoSel?.unidade ?? "kg");
  const [preco, setPreco] = useState(
    entrada?.preco_unidade != null
      ? String(entrada.preco_unidade)
      : produtoSel?.preco_unidade != null
        ? String(produtoSel.preco_unidade)
        : "",
  );
  const [fornecedor, setFornecedor] = useState(entrada?.fornecedor ?? "");
  const [data, setData] = useState(entrada?.data_entrada ?? new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState(entrada?.observacao ?? "");
  const [loading, setLoading] = useState(false);

  const qtdNum = Number(String(quantidade).replace(",", ".")) || 0;
  const precoNum = preco.trim() === "" ? null : Number(String(preco).replace(",", "."));
  const custoTotal = precoNum != null && qtdNum > 0 ? precoNum * qtdNum : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Sem sessão");
      if (!produtoId) throw new Error("Selecione um produto");
      if (!(qtdNum > 0)) throw new Error("Quantidade inválida");

      const payload = {
        produto_id: produtoId,
        quantidade: qtdNum,
        unidade: unidade.trim() || "kg",
        preco_unidade: precoNum,
        custo_total: custoTotal,
        fornecedor: fornecedor.trim() || null,
        data_entrada: data,
        observacao: observacao.trim() || null,
      };

      if (entrada) {
        const { error } = await supabase
          .from("estoque_entradas")
          .update(payload)
          .eq("id", entrada.id);
        if (error) throw error;
        toast.success("Entrada atualizada!");
      } else {
        const { error } = await supabase
          .from("estoque_entradas")
          .insert({ ...payload, user_id });
        if (error) throw error;
        toast.success("Entrada registrada!");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={entrada ? "Editar entrada" : "Entrada de mercadoria"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Produto">
          <select
            required
            value={produtoId}
            onChange={(e) => {
              setProdutoId(e.target.value);
              const p = produtos.find((x) => x.id === e.target.value);
              if (p) {
                setUnidade(p.unidade);
                if (p.preco_unidade != null && !preco) setPreco(String(p.preco_unidade));
              }
            }}
            className="app-input"
          >
            <option value="">Selecione...</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade">
            <input
              required
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="app-input"
            />
          </Field>
          <Field label="Unidade">
            <input
              required
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              className="app-input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Preço/${unidade || "un"} (R$)`}>
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
          <Field label="Custo total (R$)">
            <input
              readOnly
              value={custoTotal != null ? formatBRL(custoTotal) ?? "" : ""}
              placeholder="auto"
              className="app-input bg-muted"
            />
          </Field>
        </div>

        <Field label="Fornecedor (opcional)">
          <input
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            placeholder="Ex: Nutricamp"
            className="app-input"
          />
        </Field>

        <Field label="Data">
          <input
            type="date"
            required
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="app-input"
          />
        </Field>

        <Field label="Observação (opcional)">
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            className="app-input min-h-[60px]"
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
    </ModalShell>
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
