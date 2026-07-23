import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Package, Trash2, X, Pencil, Users, Boxes, ArrowDownToLine, AlertTriangle, ShoppingCart, Receipt, History } from "lucide-react";
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
  tipo_remuneracao?: "mensal" | "diaria" | null;
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

type ConsumoRow = {
  id: string;
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  unidade: string;
  viveiro_id: string;
  data_lancamento: string;
  tipo: string;
};

function normalizeQuantity(qty: number, fromUnit: string | null, toUnit: string | null): number {
  if (!qty || !fromUnit || !toUnit) return qty;
  const from = fromUnit.toLowerCase().trim();
  const to = toUnit.toLowerCase().trim();
  if (from === to) return qty;

  if ((from === "g" || from === "grama" || from === "gramas") && (to === "kg" || to === "kilo" || to === "quilo")) {
    return qty / 1000;
  }
  if ((from === "kg" || from === "kilo" || from === "quilo") && (to === "g" || to === "grama" || to === "gramas")) {
    return qty * 1000;
  }
  if ((from === "ml" || from === "mililitro") && (to === "l" || to === "litro" || to === "litros")) {
    return qty / 1000;
  }
  if ((from === "l" || from === "litro" || from === "litros") && (to === "ml" || to === "mililitro")) {
    return qty * 1000;
  }

  return qty;
}

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

const UNIDADES = ["kg", "g", "saco", "unidade", "pacote", "caixa", "litro", "ml"];

function UnidadeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isOutro = value !== "" && !UNIDADES.includes(value);
  const [outro, setOutro] = useState(isOutro);
  return (
    <div className="flex gap-2">
      <select
        required
        value={outro ? "__outro__" : value}
        onChange={(e) => {
          if (e.target.value === "__outro__") {
            setOutro(true);
            onChange("");
          } else {
            setOutro(false);
            onChange(e.target.value);
          }
        }}
        className="app-input flex-1"
      >
        <option value="" disabled>Selecione…</option>
        {UNIDADES.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
        <option value="__outro__">Outro…</option>
      </select>
      {outro && (
        <input
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ex: fardo"
          className="app-input flex-1"
        />
      )}
    </div>
  );
}


function ProdutosPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"produtos" | "funcionarios" | "estoque" | "compras">("produtos");
  const [openProd, setOpenProd] = useState(false);
  const [editandoProd, setEditandoProd] = useState<Produto | null>(null);
  const [openFunc, setOpenFunc] = useState(false);
  const [editandoFunc, setEditandoFunc] = useState<Funcionario | null>(null);
  const [openEntrada, setOpenEntrada] = useState(false);
  const [editandoEntrada, setEditandoEntrada] = useState<EstoqueEntrada | null>(null);
  const [openBaixa, setOpenBaixa] = useState(false);
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
        .select("id, nome, salario, viveiro_id, ativo, tipo_remuneracao")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Funcionario[];
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
        .select("id, produto_id, produto_nome, quantidade, unidade, viveiro_id, data_lancamento, tipo")
        .order("data_lancamento", { ascending: false });
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
    const prod = produtos.find((x) => x.id === e.produto_id);
    const qtyNorm = prod ? normalizeQuantity(Number(e.quantidade ?? 0), e.unidade, prod.unidade) : Number(e.quantidade ?? 0);
    const cur = saldoPorProduto.get(e.produto_id) ?? { entradas: 0, saidas: 0 };
    cur.entradas += qtyNorm;
    saldoPorProduto.set(e.produto_id, cur);
  }
  for (const c of consumo) {
    let prod = c.produto_id ? produtos.find((p) => p.id === c.produto_id) : null;
    if (!prod && c.produto_nome) {
      prod = produtos.find((p) => p.nome.toLowerCase().trim() === c.produto_nome.toLowerCase().trim()) ?? null;
    }
    if (!prod) continue;

    const qtyNorm = normalizeQuantity(Number(c.quantidade ?? 0), c.unidade, prod.unidade);
    const cur = saldoPorProduto.get(prod.id) ?? { entradas: 0, saidas: 0 };
    cur.saidas += qtyNorm;
    saldoPorProduto.set(prod.id, cur);
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
    else if (tab === "compras") setOpenEntrada(true);
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
          {tab === "estoque" ? "Entrada" : tab === "compras" ? "Compra" : "Novo"}
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
                          {formatBRL(Number(f.salario))}
                          {f.tipo_remuneracao === "diaria" ? "/dia de cultivo" : "/mês"}
                        </span>
                        {" · "}
                        {viv ? viv.nome : "distribuído por dias de cultivo"}
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
          consumo={consumo}
          viveiros={viveiros}
          saldoPorProduto={saldoPorProduto}
          onNovaEntrada={() => setOpenEntrada(true)}
          onNovaBaixa={() => setOpenBaixa(true)}
          onCadastrarProduto={() => setOpenProd(true)}
          onEditEntrada={(e) => setEditandoEntrada(e)}
          onDelEntrada={(e) => {
            if (confirm(`Remover entrada de ${formatNumber(e.quantidade)} ${e.unidade}?`))
              delEntradaMut.mutate(e.id);
          }}
          onEditProduto={(p) => setEditandoProd(p)}
          onDelProduto={(p) => {
            if (confirm(`Remover "${p.nome}"?`)) delProdMut.mutate(p.id);
          }}
        />


      ) : tab === "compras" ? (
        <ComprasView
          produtos={produtos}
          entradas={entradas}
          onNovaCompra={() => setOpenEntrada(true)}
          onCadastrarProduto={() => setOpenProd(true)}
          onEditCompra={(e) => setEditandoEntrada(e)}
          onDelCompra={(e) => {
            if (confirm(`Remover compra de ${formatNumber(e.quantidade)} ${e.unidade}?`))
              delEntradaMut.mutate(e.id);
          }}
        />

      ) : (
        <DespesasView
          despesas={despesas}
          viveiros={viveiros}
          onNova={() => setOpenDesp(true)}
          onEdit={(d: Despesa) => setEditandoDesp(d)}
          onDel={(d: Despesa) => {
            if (confirm(`Remover "${d.descricao}"?`)) delDespMut.mutate(d.id);
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
            qc.invalidateQueries({ queryKey: ["produtos"] });
            setOpenEntrada(false);
            setEditandoEntrada(null);
          }}

        />
      )}

      {(openDesp || editandoDesp) && (
        <DespesaModal
          despesa={editandoDesp}
          viveiros={viveiros}
          onClose={() => {
            setOpenDesp(false);
            setEditandoDesp(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["despesas_gerais"] });
            setOpenDesp(false);
            setEditandoDesp(null);
          }}
        />
      )}

      {openBaixa && (
        <BaixaEstoqueModal
          produtos={produtos}
          viveiros={viveiros}
          onClose={() => setOpenBaixa(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["estoque_consumo"] });
            setOpenBaixa(false);
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
  consumo,
  viveiros,
  saldoPorProduto,
  onNovaEntrada,
  onNovaBaixa,
  onCadastrarProduto,
  onEditEntrada,
  onDelEntrada,
  onEditProduto,
  onDelProduto,
}: {
  produtos: Produto[];
  entradas: EstoqueEntrada[];
  consumo: ConsumoRow[];
  viveiros: ViveiroOpt[];
  saldoPorProduto: Map<string, { entradas: number; saidas: number }>;
  onNovaEntrada: () => void;
  onNovaBaixa: () => void;
  onCadastrarProduto: () => void;
  onEditEntrada: (e: EstoqueEntrada) => void;
  onDelEntrada: (e: EstoqueEntrada) => void;
  onEditProduto: (p: Produto) => void;
  onDelProduto: (p: Produto) => void;
}) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [filtroTimeline, setFiltroTimeline] = useState<"todas" | "entradas" | "saidas">("todas");
  const [buscaEstoque, setBuscaEstoque] = useState("");

  if (produtos.length === 0) {
    return (
      <Empty
        icon={<Boxes className="size-12 mx-auto text-muted-foreground" />}
        titulo="Cadastre um produto primeiro"
        descricao="Você precisa ter pelo menos um produto cadastrado pra controlar o estoque."
        onClick={onCadastrarProduto}
      />
    );
  }

  const produtosOrdenados = [...produtos].sort((a, b) => a.nome.localeCompare(b.nome));

  const totalEntradasGlobal = Array.from(saldoPorProduto.values()).reduce((sum, s) => sum + s.entradas, 0);
  const totalSaidasGlobal = Array.from(saldoPorProduto.values()).reduce((sum, s) => sum + s.saidas, 0);
  const totalEstoqueGlobal = Math.max(0, totalEntradasGlobal - totalSaidasGlobal);

  // Unificação de todas as movimentações de estoque (entradas + lançamentos do início/saídas)
  const movimentacoes = useMemo(() => {
    const list: Array<{
      id: string;
      tipo: "entrada" | "saida";
      produtoId: string;
      produtoNome: string;
      quantidade: number;
      unidade: string;
      data: string;
      detalhe: string;
      custo?: number | null;
    }> = [];

    for (const e of entradas) {
      const prod = produtos.find((x) => x.id === e.produto_id);
      list.push({
        id: `e-${e.id}`,
        tipo: "entrada",
        produtoId: e.produto_id,
        produtoNome: prod?.nome ?? "Produto",
        quantidade: Number(e.quantidade ?? 0),
        unidade: e.unidade ?? prod?.unidade ?? "kg",
        data: e.data_entrada,
        detalhe: e.fornecedor ? `Fornecedor: ${e.fornecedor}` : e.observacao || "Entrada de estoque / Compra",
        custo: e.custo_total != null ? Number(e.custo_total) : null,
      });
    }

    for (const c of consumo) {
      let prod = c.produto_id ? produtos.find((p) => p.id === c.produto_id) : null;
      if (!prod && c.produto_nome) {
        prod = produtos.find((p) => p.nome.toLowerCase().trim() === c.produto_nome.toLowerCase().trim()) ?? null;
      }

      const viv = viveiros.find((v) => v.id === c.viveiro_id);

      list.push({
        id: `c-${c.id}`,
        tipo: "saida",
        produtoId: prod?.id ?? "desconhecido",
        produtoNome: prod?.nome ?? c.produto_nome ?? "Lançamento",
        quantidade: Number(c.quantidade ?? 0),
        unidade: c.unidade ?? prod?.unidade ?? "kg",
        data: c.data_lancamento,
        detalhe: viv ? `Lançado no ${viv.nome}` : "Lançamento de ração / Consumo",
      });
    }

    return list.sort((a, b) => b.data.localeCompare(a.data));
  }, [entradas, consumo, produtos, viveiros]);

  const movimentacoesFiltradas = useMemo(() => {
    return movimentacoes.filter((m) => {
      if (filtroTimeline === "entradas" && m.tipo !== "entrada") return false;
      if (filtroTimeline === "saidas" && m.tipo !== "saida") return false;
      if (buscaEstoque.trim()) {
        const term = buscaEstoque.toLowerCase().trim();
        const prodMatch = m.produtoNome.toLowerCase().includes(term);
        const detMatch = m.detalhe.toLowerCase().includes(term);
        if (!prodMatch && !detMatch) return false;
      }
      return true;
    });
  }, [movimentacoes, filtroTimeline, buscaEstoque]);

  return (
    <div className="space-y-6">
      {/* Cards de Resumo Geral */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-card border p-4 shadow-sm space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Saldo Total em Estoque</p>
          <p className="text-2xl font-black text-foreground tabular-nums">{formatNumber(totalEstoqueGlobal)} kg</p>
        </div>
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 shadow-sm space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Total Adicionado (Entradas)</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">+ {formatNumber(totalEntradasGlobal)} kg</p>
        </div>
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 shadow-sm space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Total Consumido (Saídas/Início)</p>
          <p className="text-2xl font-black text-amber-700 dark:text-amber-400 tabular-nums">- {formatNumber(totalSaidasGlobal)} kg</p>
        </div>
      </div>

      {/* Botões de Ação Rápida */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-muted/40 p-3 rounded-2xl border">
        <div>
          <h3 className="font-bold text-base">Controle de Estoque & Lançamentos</h3>
          <p className="text-xs text-muted-foreground">Registros automáticos de baixas do Início e compras efetuadas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onNovaBaixa}
            className="h-10 px-3.5 rounded-xl border border-destructive/40 text-destructive font-semibold text-xs inline-flex items-center gap-1.5 hover:bg-destructive/10 transition"
          >
            <ArrowDownToLine className="size-4 rotate-180" /> Baixa Manual
          </button>
          <button
            onClick={onNovaEntrada}
            className="h-10 px-3.5 rounded-xl bg-emerald-600 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm hover:bg-emerald-700 transition"
          >
            <ArrowDownToLine className="size-4" /> Nova Entrada / Compra
          </button>
        </div>
      </div>

      {/* Saldo por Produto */}
      <div className="space-y-3">
        <h3 className="font-bold text-sm uppercase tracking-wide text-muted-foreground flex items-center justify-between">
          <span>Estoque Atual por Produto</span>
          <span className="text-xs font-normal text-muted-foreground">{produtosOrdenados.length} produto(s)</span>
        </h3>

        <ul className="space-y-3">
          {produtosOrdenados.map((p) => {
            const s = saldoPorProduto.get(p.id) ?? { entradas: 0, saidas: 0 };
            const saldo = s.entradas - s.saidas;
            const pctRestante = s.entradas > 0 ? Math.max(0, Math.min(100, Math.round((saldo / s.entradas) * 100))) : (saldo > 0 ? 100 : 0);
            const zerado = saldo <= 0;
            const baixo = !zerado && pctRestante <= 20;

            const entradasProduto = entradas.filter((e) => e.produto_id === p.id);
            const saidasProduto = consumo.filter((c) =>
              c.produto_id === p.id || (!c.produto_id && c.produto_nome && c.produto_nome.toLowerCase().trim() === p.nome.toLowerCase().trim())
            );
            const aberto = expandidoId === p.id;

            return (
              <li key={p.id} className="rounded-2xl bg-card border shadow-xs overflow-hidden">
                <div className="p-4 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => setExpandidoId(aberto ? null : p.id)}
                    className="min-w-0 flex-1 text-left space-y-1.5"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base text-foreground">{p.nome}</span>
                      {zerado ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                          Estoque Insuficiente
                        </span>
                      ) : baixo ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Estoque Baixo ({pctRestante}%)
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Estoque Ok ({pctRestante}%)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="text-emerald-600 font-semibold">+ {formatNumber(s.entradas)} {p.unidade} (Entradas)</span>
                      <span>·</span>
                      <span className="text-amber-600 font-semibold">- {formatNumber(s.saidas)} {p.unidade} (Consumos)</span>
                    </div>

                    {/* Barra Visual de Nível de Estoque */}
                    <div className="w-full bg-secondary h-2 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full transition-all duration-300 ${zerado ? "bg-red-500" : baixo ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${pctRestante}%` }}
                      />
                    </div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandidoId(aberto ? null : p.id)}
                      className="text-right"
                    >
                      <span className={`text-xl font-black tabular-nums block ${zerado ? "text-red-600" : "text-foreground"}`}>
                        {formatNumber(saldo)} {p.unidade}
                      </span>
                      <span className="text-[11px] text-primary font-semibold hover:underline">
                        {aberto ? "Ocultar histórico ▲" : `Ver histórico (${entradasProduto.length + saidasProduto.length}) ▼`}
                      </span>
                    </button>
                    <RowActions onEdit={() => onEditProduto(p)} onDel={() => onDelProduto(p)} />
                  </div>
                </div>

                {aberto && (
                  <div className="border-t bg-muted/30 p-4 space-y-4">
                    {/* Abastecimentos (+) */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1">
                        <span>🟢 Entradas & Compras Abastecidas ({entradasProduto.length})</span>
                      </p>
                      {entradasProduto.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">Nenhuma entrada cadastrada para este produto.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {entradasProduto.map((e) => (
                            <li key={e.id} className="p-2.5 rounded-xl bg-card border flex items-center justify-between gap-3 text-xs">
                              <div>
                                <p className="font-bold text-emerald-600">
                                  + {formatNumber(e.quantidade)} {e.unidade}
                                  {e.custo_total != null && <span className="text-foreground font-normal ml-2">({formatBRL(Number(e.custo_total))})</span>}
                                </p>
                                <p className="text-muted-foreground text-[11px]">
                                  Data: {new Date(`${e.data_entrada}T00:00:00`).toLocaleDateString("pt-BR")}
                                  {e.fornecedor && ` · Fornecedor: ${e.fornecedor}`}
                                  {e.observacao && ` · ${e.observacao}`}
                                </p>
                              </div>
                              <RowActions onEdit={() => onEditEntrada(e)} onDel={() => onDelEntrada(e)} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Saídas / Consumos (-) */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1">
                        <span>🔴 Consumos & Lançamentos de Ração do Início ({saidasProduto.length})</span>
                      </p>
                      {saidasProduto.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">Nenhum consumo ou baixa efetuada ainda.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {saidasProduto.map((c) => {
                            const viv = viveiros.find((v) => v.id === c.viveiro_id);
                            return (
                              <li key={c.id} className="p-2.5 rounded-xl bg-card border flex items-center justify-between gap-3 text-xs">
                                <div>
                                  <p className="font-bold text-red-600">
                                    - {formatNumber(c.quantidade)} {c.unidade}
                                    <span className="text-foreground font-normal ml-2">
                                      ({viv ? `Viveiro: ${viv.nome}` : "Consumo / Baixa Geral"})
                                    </span>
                                  </p>
                                  <p className="text-muted-foreground text-[11px]">
                                    Data: {new Date(`${c.data_lancamento}T00:00:00`).toLocaleDateString("pt-BR")}
                                    {" · Origem: Lançamento de Ração (Início)"}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Timeline Geral de Movimentações */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <History className="size-5 text-primary" /> Histórico Unificado de Movimentação do Estoque
            </h3>
            <p className="text-xs text-muted-foreground">Linha do tempo de todas as entradas e baixas do sistema</p>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-muted p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFiltroTimeline("todas")}
              className={`px-3 py-1.5 rounded-lg transition ${filtroTimeline === "todas" ? "bg-card shadow-xs text-foreground font-bold" : "text-muted-foreground hover:text-foreground"}`}
            >
              Todas ({movimentacoes.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroTimeline("entradas")}
              className={`px-3 py-1.5 rounded-lg transition ${filtroTimeline === "entradas" ? "bg-card shadow-xs text-emerald-600 font-bold" : "text-muted-foreground hover:text-foreground"}`}
            >
              Entradas (+{entradas.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroTimeline("saidas")}
              className={`px-3 py-1.5 rounded-lg transition ${filtroTimeline === "saidas" ? "bg-card shadow-xs text-red-600 font-bold" : "text-muted-foreground hover:text-foreground"}`}
            >
              Baixas (-{consumo.length})
            </button>
          </div>
        </div>

        {movimentacoesFiltradas.length === 0 ? (
          <div className="p-6 rounded-2xl border-2 border-dashed text-center text-sm text-muted-foreground">
            Nenhuma movimentação encontrada.
          </div>
        ) : (
          <div className="space-y-2">
            {movimentacoesFiltradas.slice(0, 50).map((m) => (
              <div key={m.id} className="p-3 rounded-xl bg-card border flex items-center justify-between gap-3 text-xs shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`size-9 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                      m.tipo === "entrada" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                    }`}
                  >
                    {m.tipo === "entrada" ? "+" : "-"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground text-sm truncate">{m.produtoNome}</p>
                    <p className="text-muted-foreground text-[11px] truncate">
                      {new Date(`${m.data}T00:00:00`).toLocaleDateString("pt-BR")} · {m.detalhe}
                      {m.custo != null && ` · ${formatBRL(m.custo)}`}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className={`text-base font-black tabular-nums ${m.tipo === "entrada" ? "text-emerald-600" : "text-red-600"}`}>
                    {m.tipo === "entrada" ? "+" : "-"} {formatNumber(m.quantidade)} {m.unidade}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ComprasView({
  produtos,
  entradas,
  onNovaCompra,
  onCadastrarProduto,
  onEditCompra,
  onDelCompra,
}: {
  produtos: Produto[];
  entradas: EstoqueEntrada[];
  onNovaCompra: () => void;
  onCadastrarProduto: () => void;
  onEditCompra: (e: EstoqueEntrada) => void;
  onDelCompra: (e: EstoqueEntrada) => void;
}) {
  if (produtos.length === 0) {
    return (
      <Empty
        icon={<ShoppingCart className="size-12 mx-auto text-muted-foreground" />}
        titulo="Nenhuma compra ainda"
        descricao="Clique em Compra pra lançar. Você pode cadastrar o produto na hora."
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
  const [novoNome, setNovoNome] = useState("");
  const isNovo = produtoId === "__novo__";
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

      let finalProdutoId = produtoId;
      if (isNovo) {
        const nome = novoNome.trim();
        if (!nome) throw new Error("Digite o nome do novo produto");
        const { data: novoProd, error: novoErr } = await supabase
          .from("produtos")
          .insert({
            user_id,
            nome,
            categoria: "outro",
            unidade: unidade.trim() || "kg",
            preco_unidade: precoNum,
          })
          .select("id")
          .single();
        if (novoErr) throw novoErr;
        finalProdutoId = novoProd.id;
      }

      const payload = {
        produto_id: finalProdutoId,
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
            <option value="__novo__">+ Cadastrar novo produto…</option>
          </select>
          {isNovo && (
            <input
              required
              autoFocus
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Nome do novo produto (ex: Ração 40%)"
              className="app-input mt-2"
            />
          )}
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
            <UnidadeSelect value={unidade} onChange={setUnidade} />
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
            <UnidadeSelect value={unidade} onChange={setUnidade} />
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
  const [tipoRemuneracao, setTipoRemuneracao] = useState<"mensal" | "diaria">(
    funcionario?.tipo_remuneracao === "diaria" ? "diaria" : "mensal"
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
      if (isNaN(salarioNum) || salarioNum < 0) throw new Error("Valor inválido");

      const payload = {
        nome: nome.trim(),
        salario: salarioNum,
        tipo_remuneracao: tipoRemuneracao,
        viveiro_id: viveiroId || null,
      };

      if (funcionario) {
        const { error } = await supabase
          .from("funcionarios")
          .update(payload as never)
          .eq("id", funcionario.id);
        if (error) throw error;
        toast.success("Funcionário atualizado!");
      } else {
        const { error } = await supabase
          .from("funcionarios")
          .insert({ ...payload, user_id } as never);
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

        <Field label="Tipo de Remuneração">
          <select
            value={tipoRemuneracao}
            onChange={(e) => setTipoRemuneracao(e.target.value as "mensal" | "diaria")}
            className="app-input"
          >
            <option value="mensal">📅 Salário Mensal (R$/mês)</option>
            <option value="diaria">☀️ Diária por Dia de Cultivo (R$/dia)</option>
          </select>
        </Field>

        <Field label={tipoRemuneracao === "diaria" ? "Valor da diária por dia de cultivo (R$)" : "Salário mensal (R$)"}>
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

        <Field label="Alocação ao Viveiro">
          <select
            value={viveiroId}
            onChange={(e) => setViveiroId(e.target.value)}
            className="app-input"
          >
            <option value="">🔄 Distribuído entre os viveiros ativos por dias de cultivo</option>
            {viveiros.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            {viveiroId
              ? "Trabalha exclusivamente neste viveiro."
              : "Calculado e distribuído de acordo com os dias de cultivo de cada viveiro ativo."}
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

function DespesasView({
  despesas,
  viveiros,
  onNova,
  onEdit,
  onDel,
}: {
  despesas: Despesa[];
  viveiros: ViveiroOpt[];
  onNova: () => void;
  onEdit: (d: Despesa) => void;
  onDel: (d: Despesa) => void;
}) {
  const total = despesas.reduce((s, d) => s + Number(d.valor ?? 0), 0);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total registrado</p>
          <p className="text-2xl font-bold">{formatBRL(total)}</p>
        </div>
        <button
          onClick={onNova}
          className="h-11 px-4 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2"
        >
          <Receipt className="size-4" /> Nova despesa
        </button>
      </div>

      {despesas.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
          Nenhuma despesa registrada. As despesas entram nos relatórios dos viveiros (rateadas ou individuais).
        </p>
      ) : (
        <ul className="space-y-2">
          {despesas.map((d) => {
            const viv = viveiros.find((v) => v.id === d.viveiro_id);
            const rateioLabel = d.rateio === "todos" || !d.viveiro_id
              ? `Rateado entre todos`
              : `Só ${viv?.nome ?? "viveiro"}`;
            return (
              <li
                key={d.id}
                className="p-3 rounded-xl bg-card border flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">{d.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(`${d.data_despesa}T00:00:00`).toLocaleDateString("pt-BR")}
                    {" · "}
                    {rateioLabel}
                    {d.categoria && ` · ${d.categoria}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-primary">{formatBRL(Number(d.valor ?? 0))}</span>
                  <RowActions onEdit={() => onEdit(d)} onDel={() => onDel(d)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DespesaModal({
  despesa,
  viveiros,
  onClose,
  onSaved,
}: {
  despesa: Despesa | null;
  viveiros: ViveiroOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [descricao, setDescricao] = useState(despesa?.descricao ?? "");
  const [categoria, setCategoria] = useState(despesa?.categoria ?? "");
  const [valor, setValor] = useState(despesa?.valor != null ? String(despesa.valor) : "");
  const [data, setData] = useState(despesa?.data_despesa ?? todayLocal());
  const [rateio, setRateio] = useState<"todos" | "individual">(
    despesa?.rateio === "individual" ? "individual" : "todos",
  );
  const [viveiroIds, setViveiroIds] = useState<string[]>(
    despesa?.viveiro_id ? [despesa.viveiro_id] : [],
  );
  const [observacao, setObservacao] = useState(despesa?.observacao ?? "");
  const [saving, setSaving] = useState(false);

  function toggleViveiro(id: string) {
    setViveiroIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!descricao.trim() || !valor) {
      toast.error("Preencha descrição e valor.");
      return;
    }
    if (rateio === "individual" && viveiroIds.length === 0) {
      toast.error("Selecione pelo menos um viveiro.");
      return;
    }
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const userId = user.user?.id;
    if (!userId) {
      toast.error("Sessão expirada.");
      setSaving(false);
      return;
    }
    const base = {
      user_id: userId,
      descricao: descricao.trim(),
      categoria: categoria.trim() || null,
      valor: Number(valor),
      data_despesa: data,
      observacao: observacao.trim() || null,
    };

    let error: { message: string } | null = null;
    if (despesa) {
      const payload = {
        ...base,
        rateio,
        viveiro_id: rateio === "individual" ? (viveiroIds[0] ?? null) : null,
      };
      const res = await supabase.from("despesas_gerais").update(payload).eq("id", despesa.id);
      error = res.error;
    } else if (rateio === "todos") {
      const res = await supabase
        .from("despesas_gerais")
        .insert({ ...base, rateio: "todos", viveiro_id: null });
      error = res.error;
    } else {
      const rows = viveiroIds.map((vid) => ({
        ...base,
        rateio: "individual",
        viveiro_id: vid,
      }));
      const res = await supabase.from("despesas_gerais").insert(rows);
      error = res.error;
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(despesa ? "Despesa atualizada" : "Despesa criada");
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{despesa ? "Editar despesa" : "Nova despesa"}</h2>
          <button onClick={onClose} className="size-9 rounded-lg hover:bg-muted inline-flex items-center justify-center">
            <X className="size-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Descrição">
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border bg-background"
              placeholder="Ex: Energia, manutenção..."
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <input
                type="number"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border bg-background"
              />
            </Field>
            <Field label="Data">
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border bg-background"
              />
            </Field>
          </div>
          <Field label="Categoria (opcional)">
            <input
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border bg-background"
              placeholder="Ex: energia, manutenção, combustível..."
            />
          </Field>
          <Field label="Rateio">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRateio("todos")}
                className={`h-11 rounded-lg border font-semibold ${rateio === "todos" ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
              >
                Todos os viveiros
              </button>
              <button
                type="button"
                onClick={() => setRateio("individual")}
                className={`h-11 rounded-lg border font-semibold ${rateio === "individual" ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
              >
                Um viveiro
              </button>
            </div>
          </Field>
          {rateio === "individual" && (
            <Field label={`Viveiros (${viveiroIds.length} selecionado${viveiroIds.length === 1 ? "" : "s"})`}>
              <div className="border rounded-lg bg-background max-h-48 overflow-y-auto divide-y">
                {viveiros.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Nenhum viveiro cadastrado.</div>
                ) : (
                  viveiros.map((v) => {
                    const checked = viveiroIds.includes(v.id);
                    return (
                      <label
                        key={v.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleViveiro(v.id)}
                          className="size-4"
                        />
                        <span className="font-medium">{v.nome}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {!despesa && viveiroIds.length > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Será criada uma despesa para cada viveiro selecionado.
                </p>
              )}
            </Field>
          )}
          <Field label="Observação (opcional)">
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background min-h-[60px]"
            />
          </Field>
          <button
            type="submit"
            disabled={saving}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function BaixaEstoqueModal({
  produtos,
  viveiros,
  onClose,
  onSaved,
}: {
  produtos: Produto[];
  viveiros: ViveiroOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [produtoId, setProdutoId] = useState(produtos[0]?.id ?? "");
  const produtoSel = produtos.find((p) => p.id === produtoId);
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState(produtoSel?.unidade ?? "kg");
  const [viveiroId, setViveiroId] = useState<string>(viveiros[0]?.id ?? "");
  const [data, setData] = useState(todayLocal());
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const user_id = u.user?.id;
      if (!user_id) throw new Error("Sem sessão");
      if (!produtoSel) throw new Error("Selecione um produto");
      if (!viveiroId) throw new Error("Selecione um viveiro");
      const q = Number(String(quantidade).replace(",", "."));
      if (!(q > 0)) throw new Error("Quantidade inválida");

      const preco = produtoSel.preco_unidade != null ? Number(produtoSel.preco_unidade) : null;
      const custo = preco != null ? preco * q : null;

      const { error } = await supabase.from("lancamentos").insert({
        user_id,
        viveiro_id: viveiroId,
        produto_id: produtoSel.id,
        produto_nome: produtoSel.nome,
        quantidade: q,
        unidade: unidade.trim() || produtoSel.unidade || "kg",
        tipo: "racao",
        preco_unidade: preco,
        custo_total: custo,
        data_lancamento: data,
      });
      if (error) throw error;
      toast.success("Baixa registrada!");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="Baixa de estoque (consumo)" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Produto">
          <select
            required
            value={produtoId}
            onChange={(e) => {
              setProdutoId(e.target.value);
              const p = produtos.find((x) => x.id === e.target.value);
              if (p) setUnidade(p.unidade);
            }}
            className="app-input"
          >
            <option value="">Selecione...</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
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
            <UnidadeSelect value={unidade} onChange={setUnidade} />
          </Field>
        </div>

        <Field label="Viveiro">
          <select
            required
            value={viveiroId}
            onChange={(e) => setViveiroId(e.target.value)}
            className="app-input"
          >
            <option value="">Selecione...</option>
            {viveiros.map((v) => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </select>
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

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Registrar baixa"}
        </button>
      </form>
    </ModalShell>
  );
}
