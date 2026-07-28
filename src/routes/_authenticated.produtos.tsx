import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Package, Trash2, X, Pencil, Users, Boxes, ArrowDownToLine, AlertTriangle, ShoppingCart, Receipt, History, FileDown } from "lucide-react";
import { todayLocal } from "@/lib/date";
import { parseProdutoEmbalagem, formatUnidadeDb, getUnidadeBase } from "@/lib/embalagem";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos & Funcionários" }] }),
  component: ProdutosPage,
  errorComponent: ({ error }) => (
    <div className="p-6 max-w-xl mx-auto text-center space-y-4 my-8 rounded-2xl border bg-card shadow-sm">
      <h2 className="text-xl font-bold text-destructive">Erro na página de Estoque / Produtos</h2>
      <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Erro ao carregar dados."}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
      >
        Recarregar Página
      </button>
    </div>
  ),
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
  data_inicio: string | null;
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
  const from = getUnidadeBase(fromUnit).toLowerCase().trim();
  const to = getUnidadeBase(toUnit).toLowerCase().trim();
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

const UNIDADES = ["kg", "g", "saco", "unidade", "pacote", "caixa", "litro", "ml", "mil", "pre_larvas"];

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
      try {
        const { data, error } = await supabase
          .from("produtos")
          .select("id, nome, categoria, unidade, preco_unidade")
          .order("nome");
        if (error) {
          console.error("Erro ao buscar produtos:", error);
          return [];
        }
        return (data ?? []) as Produto[];
      } catch {
        return [];
      }
    },
  });

  const funcionariosQuery = useQuery({
    queryKey: ["funcionarios"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("funcionarios")
          .select("id, nome, salario, viveiro_id, ativo, tipo_remuneracao, data_inicio")
          .order("nome");
        if (error) {
          console.error("Erro ao buscar funcionarios:", error);
          return [];
        }
        return (data ?? []) as unknown as Funcionario[];
      } catch {
        return [];
      }
    },
  });

  const viveirosQuery = useQuery({
    queryKey: ["viveiros", "ativos"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("viveiros")
          .select("id, nome, status")
          .eq("status", "ativo")
          .order("nome");
        if (error) {
          console.error("Erro ao buscar viveiros:", error);
          return [];
        }
        return (data ?? []) as ViveiroOpt[];
      } catch {
        return [];
      }
    },
  });

  const entradasQuery = useQuery({
    queryKey: ["estoque_entradas"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("estoque_entradas")
          .select("id, produto_id, quantidade, unidade, preco_unidade, custo_total, fornecedor, data_entrada, observacao")
          .order("data_entrada", { ascending: false });
        if (error) {
          console.error("Erro ao buscar estoque_entradas:", error);
          return [];
        }
        return (data ?? []) as EstoqueEntrada[];
      } catch {
        return [];
      }
    },
  });

  const consumoQuery = useQuery({
    queryKey: ["estoque_consumo"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("lancamentos")
          .select("id, produto_id, produto_nome, quantidade, unidade, viveiro_id, data_lancamento, tipo")
          .order("data_lancamento", { ascending: false });
        if (error) {
          console.error("Erro ao buscar estoque_consumo:", error);
          return [];
        }
        return (data ?? []) as ConsumoRow[];
      } catch {
        return [];
      }
    },
  });

  const despesasQuery = useQuery({
    queryKey: ["despesas_gerais"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("despesas_gerais")
          .select("id, viveiro_id, descricao, categoria, valor, data_despesa, rateio, observacao")
          .order("data_despesa", { ascending: false });
        if (error) {
          console.error("Erro ao buscar despesas_gerais:", error);
          return [];
        }
        return (data ?? []) as Despesa[];
      } catch {
        return [];
      }
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
    if (!e || !e.produto_id) continue;
    const prod = produtos.find((x) => x && x.id === e.produto_id);
    const qtyNorm = prod ? normalizeQuantity(Number(e.quantidade ?? 0), e.unidade, prod.unidade) : Number(e.quantidade ?? 0);
    const cur = saldoPorProduto.get(e.produto_id) ?? { entradas: 0, saidas: 0 };
    cur.entradas += Number.isNaN(qtyNorm) ? 0 : qtyNorm;
    saldoPorProduto.set(e.produto_id, cur);
  }
  for (const c of consumo) {
    if (!c) continue;
    let prod = c.produto_id ? produtos.find((p) => p && p.id === c.produto_id) : null;
    if (!prod && c.produto_nome && typeof c.produto_nome === "string") {
      const nameLower = c.produto_nome.toLowerCase().trim();
      prod = produtos.find((p) => p && p.nome && typeof p.nome === "string" && p.nome.toLowerCase().trim() === nameLower) ?? null;
    }
    if (!prod || !prod.id) continue;

    const qtyNorm = normalizeQuantity(Number(c.quantidade ?? 0), c.unidade, prod.unidade);
    const cur = saldoPorProduto.get(prod.id) ?? { entradas: 0, saidas: 0 };
    cur.saidas += Number.isNaN(qtyNorm) ? 0 : qtyNorm;
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
            {produtos.map((p) => {
              const emb = parseProdutoEmbalagem(p.unidade);
              const precoUnitBase = p.preco_unidade != null ? Number(p.preco_unidade) : null;
              const precoEmb = precoUnitBase != null && emb.temEmbalagem && emb.pesoEmbalagem ? precoUnitBase * emb.pesoEmbalagem : null;

              const getIcon = () => {
                if (!emb.temEmbalagem) return "秤";
                switch (emb.tipoEmbalagem) {
                  case "balde": return "🪣";
                  case "saco": return "🌾";
                  case "caixa": return "📦";
                  case "pacote": return "✉️";
                  case "pre_larvas": return "🦐";
                  case "frasco": return "🧪";
                  default: return "📦";
                }
              };

              return (
                <li
                  key={p.id}
                  className="p-4 rounded-2xl bg-card border flex items-center justify-between gap-3 shadow-xs hover:border-primary/30 transition"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-xl">
                      {getIcon()}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-base truncate">{p.nome}</p>
                        {emb.temEmbalagem && (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            📦 {emb.rotuloEmbalagem}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="text-muted-foreground capitalize">
                          Categoria: <strong className="text-foreground">{p.categoria}</strong>
                        </span>

                        {precoEmb != null && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-primary font-black text-sm">
                              💰 {formatBRL(precoEmb)} / {emb.tipoEmbalagem}
                            </span>
                          </>
                        )}

                        {precoUnitBase != null && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-emerald-600 font-bold">
                              ({precoUnitBase < 0.01 ? `R$ ${precoUnitBase.toFixed(4)}` : formatBRL(precoUnitBase)}/{emb.unidadeBase})
                            </span>
                          </>
                        )}

                        {emb.unidadeBase === "g" && precoUnitBase != null && (
                          <span className="text-muted-foreground text-[11px] font-semibold">
                            (R$ {(precoUnitBase * 1000).toFixed(2)}/kg)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <RowActions
                    onEdit={() => setEditandoProd(p)}
                    onDel={() => {
                      if (confirm(`Remover "${p.nome}"?`)) delProdMut.mutate(p.id);
                    }}
                  />
                </li>
              );
            })}
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
                        {viv ? viv.nome : "Geral / Distribuído"}
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

function formatDateSafe(iso?: string | null) {
  if (!iso) return "—";
  try {
    const clean = iso.split("T")[0];
    const parts = clean.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return clean;
  } catch {
    return "—";
  }
}

async function gerarPdfEstoque(
  produtos: Produto[],
  saldoPorProduto: Map<string, { entradas: number; saidas: number }>,
  movimentacoes: Array<{
    id: string;
    tipo: "entrada" | "saida";
    produtoId: string;
    produtoNome: string;
    quantidade: number;
    unidade: string;
    data: string;
    detalhe: string;
    custo?: number | null;
  }>,
  totais: { totalEstoqueGlobal: number; totalEntradasGlobal: number; totalSaidasGlobal: number }
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

  // Banner Superior / Header
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, 210, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("RELATÓRIO DE ESTOQUE & MOVIMENTAÇÕES DE PRODUTOS", 14, 12);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Emitido em ${dataHojeStr} às ${horaStr}`, 14, 18);

  // Cards de Resumo Executivo
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("RESUMO EXECUTIVO DE ESTOQUE", 14, 30);

  // Box Saldo Total
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 34, 58, 18, 2, 2, "F");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("SALDO ATUAL EM ESTOQUE", 18, 40);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(`${totais.totalEstoqueGlobal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`, 18, 47);

  // Box Entradas
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(76, 34, 58, 18, 2, 2, "F");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL ABASTECIDO (+)", 80, 40);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(16, 185, 129);
  doc.text(`+ ${totais.totalEntradasGlobal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`, 80, 47);

  // Box Consumos
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(138, 34, 58, 18, 2, 2, "F");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL CONSUMIDO (INÍCIO)", 142, 40);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(225, 29, 72);
  doc.text(`- ${totais.totalSaidasGlobal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`, 142, 47);

  let currentY = 58;

  // Tabela 1: Posição de Estoque por Produto
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("1. POSIÇÃO DE ESTOQUE POR PRODUTO", 14, currentY);

  autoTable(doc, {
    startY: currentY + 3,
    head: [["Produto", "Categoria", "Entradas", "Consumos", "Saldo Atual", "Status"]],
    body: produtos.map((p) => {
      const s = saldoPorProduto.get(p.id) ?? { entradas: 0, saidas: 0 };
      const saldo = s.entradas - s.saidas;
      const pct = s.entradas > 0 ? (saldo / s.entradas) * 100 : (saldo > 0 ? 100 : 0);
      const status = saldo <= 0 ? "Insuficiente" : pct <= 20 ? "Baixo" : "OK";

      return [
        p.nome,
        p.categoria || "Geral",
        `${s.entradas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${p.unidade}`,
        `${s.saidas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${p.unidade}`,
        `${saldo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${p.unidade}`,
        status,
      ];
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Tabela 2: Últimas Movimentações (Entradas e Baixas)
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(`2. ÚLTIMAS MOVIMENTAÇÕES DE ESTOQUE (${movimentacoes.length})`, 14, currentY);

  if (movimentacoes.length === 0) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text("Nenhuma movimentação registrada.", 14, currentY + 5);
  } else {
    autoTable(doc, {
      startY: currentY + 3,
      head: [["Data", "Tipo", "Produto", "Quantidade", "Detalhes / Origem"]],
      body: movimentacoes.slice(0, 15).map((m) => [
        formatDateSafe(m.data),
        m.tipo === "entrada" ? "ENTRADA (+)" : "BAIXA (-)",
        m.produtoNome,
        `${m.tipo === "entrada" ? "+" : "-"} ${m.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${m.unidade}`,
        m.detalhe,
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  // Footer em 1 página
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Viveiros App · Relatório de Estoque gerado em ${dataHojeStr} às ${horaStr}`, 14, 287);
    doc.text(`Página ${i} de ${pageCount}`, 196, 287, { align: "right" });
  }

  const pdfBlob = doc.output("blob") as Blob;
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, "_blank");
  toast.success("PDF do estoque gerado com sucesso!");
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

    for (const e of (entradas ?? [])) {
      if (!e) continue;
      const prod = (produtos ?? []).find((x) => x?.id === e.produto_id);
      list.push({
        id: `e-${e.id}`,
        tipo: "entrada",
        produtoId: e.produto_id ?? "",
        produtoNome: prod?.nome ?? "Produto",
        quantidade: Number(e.quantidade ?? 0),
        unidade: e.unidade ?? prod?.unidade ?? "kg",
        data: e.data_entrada ?? "",
        detalhe: e.fornecedor ? `Fornecedor: ${e.fornecedor}` : e.observacao || "Entrada de estoque / Compra",
        custo: e.custo_total != null ? Number(e.custo_total) : null,
      });
    }

    for (const c of (consumo ?? [])) {
      if (!c) continue;
      let prod = c.produto_id ? (produtos ?? []).find((p) => p?.id === c.produto_id) : null;
      if (!prod && c.produto_nome && typeof c.produto_nome === "string") {
        const nameLower = c.produto_nome.toLowerCase().trim();
        prod = (produtos ?? []).find((p) => p?.nome && p.nome.toLowerCase().trim() === nameLower) ?? null;
      }

      const viv = (viveiros ?? []).find((v) => v?.id === c.viveiro_id);

      list.push({
        id: `c-${c.id}`,
        tipo: "saida",
        produtoId: prod?.id ?? "desconhecido",
        produtoNome: prod?.nome ?? (typeof c.produto_nome === "string" ? c.produto_nome : "Lançamento"),
        quantidade: Number(c.quantidade ?? 0),
        unidade: c.unidade ?? prod?.unidade ?? "kg",
        data: c.data_lancamento ?? "",
        detalhe: viv ? `Lançado no ${viv.nome}` : "Lançamento de ração / Consumo",
      });
    }

    return list.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }, [entradas, consumo, produtos, viveiros]);

  const movimentacoesFiltradas = useMemo(() => {
    return movimentacoes.filter((m) => {
      if (filtroTimeline === "entradas" && m.tipo !== "entrada") return false;
      if (filtroTimeline === "saidas" && m.tipo !== "saida") return false;
      return true;
    });
  }, [movimentacoes, filtroTimeline]);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  async function handleExportPdf() {
    try {
      setIsGeneratingPdf(true);
      await gerarPdfEstoque(produtosOrdenados, saldoPorProduto, movimentacoes, {
        totalEstoqueGlobal,
        totalEntradasGlobal,
        totalSaidasGlobal,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Cards de Resumo Geral - redesign */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-gradient-to-br from-card to-muted/50 border p-4 shadow-xs space-y-2">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Boxes className="size-4" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Saldo em Estoque</p>
          </div>
          <p className="text-2xl font-black text-foreground tabular-nums pl-10">{formatNumber(totalEstoqueGlobal)} kg</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border border-emerald-500/20 p-4 shadow-xs space-y-2">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
              <ArrowDownToLine className="size-4" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Abastecido (+)</p>
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums pl-10">+ {formatNumber(totalEntradasGlobal)} kg</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-rose-500/5 to-rose-500/10 border border-rose-500/20 p-4 shadow-xs space-y-2">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-rose-500/15 text-rose-600 flex items-center justify-center shrink-0">
              <ArrowDownToLine className="size-4 rotate-180" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">Consumido (-)</p>
          </div>
          <p className="text-2xl font-black text-rose-700 dark:text-rose-400 tabular-nums pl-10">- {formatNumber(totalSaidasGlobal)} kg</p>
        </div>
      </div>

      {/* Barra de Ações */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-gradient-to-r from-muted/40 to-muted/20 p-3 px-4 rounded-2xl border shadow-xs">
        <div>
          <h3 className="font-bold text-sm">Movimentações de Estoque</h3>
          <p className="text-[11px] text-muted-foreground">Gerencie entradas, baixas e acompanhe o consumo por produto</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isGeneratingPdf}
            className="h-9 px-3 rounded-xl border bg-background hover:bg-muted font-bold text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 shrink-0"
            title="Gerar PDF do relatório de estoque"
          >
            <FileDown className="size-3.5 text-emerald-600" />
            {isGeneratingPdf ? "Gerando..." : "PDF"}
          </button>
          <button
            onClick={onNovaBaixa}
            className="h-9 px-3 rounded-xl border border-rose-500/40 text-rose-600 font-semibold text-xs inline-flex items-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-950 transition"
          >
            <ArrowDownToLine className="size-3.5 rotate-180" /> Baixa Manual
          </button>
          <button
            onClick={onNovaEntrada}
            className="h-9 px-3 rounded-xl bg-emerald-600 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 transition"
          >
            <ArrowDownToLine className="size-3.5" /> Nova Entrada
          </button>
        </div>
      </div>

      {/* Saldo por Produto - redesign */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">
            Saldo por Produto
          </h3>
          <span className="text-[11px] text-muted-foreground font-medium">{produtosOrdenados.length} produto(s)</span>
        </div>

        <ul className="space-y-2.5">
          {produtosOrdenados.map((p) => {
            const s = saldoPorProduto.get(p.id) ?? { entradas: 0, saidas: 0 };
            const saldo = s.entradas - s.saidas;
            const pctRestante = s.entradas > 0 ? Math.max(0, Math.min(100, Math.round((saldo / s.entradas) * 100))) : (saldo > 0 ? 100 : 0);
            const zerado = saldo <= 0;
            const baixo = !zerado && pctRestante <= 20;

            const entradasProduto = (entradas ?? []).filter((e) => e?.produto_id === p.id);
            const saidasProduto = (consumo ?? []).filter((c) => {
              if (!c) return false;
              if (c.produto_id === p.id) return true;
              if (!c.produto_id && c.produto_nome && typeof c.produto_nome === "string") {
                return c.produto_nome.toLowerCase().trim() === p.nome.toLowerCase().trim();
              }
              return false;
            });
            const aberto = expandidoId === p.id;

            const barColor = zerado ? "bg-red-500" : baixo ? "bg-amber-500" : "bg-emerald-500";
            const barShadow = zerado ? "shadow-red-500/20" : baixo ? "shadow-amber-500/20" : "shadow-emerald-500/20";

            return (
              <li key={p.id} className="rounded-2xl bg-card border shadow-xs overflow-hidden transition-shadow hover:shadow-sm">
                <div className="p-4 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => setExpandidoId(aberto ? null : p.id)}
                    className="min-w-0 flex-1 text-left space-y-1.5"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground">{p.nome}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          zerado
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : baixo
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        }`}
                      >
                        {zerado ? "Zerado" : baixo ? `Baixo ${pctRestante}%` : `OK ${pctRestante}%`}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="text-emerald-600 font-semibold">+ {formatNumber(s.entradas)} {p.unidade}</span>
                      <span className="text-muted-foreground/40">|</span>
                      <span className="text-rose-600 font-semibold">- {formatNumber(s.saidas)} {p.unidade}</span>
                    </div>

                    <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full rounded-full transition-all duration-500 shadow-sm ${barColor} ${barShadow}`}
                        style={{ width: `${Math.min(100, pctRestante)}%` }}
                      />
                    </div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandidoId(aberto ? null : p.id)}
                      className="text-right min-w-[60px]"
                    >
                      <span className={`text-lg font-black tabular-nums block ${zerado ? "text-red-600" : "text-foreground"}`}>
                        {formatNumber(saldo)}
                      </span>
                      <span className="text-[10px] text-primary font-semibold hover:underline">
                        {aberto ? "Ocultar ▲" : `Histórico ▼`}
                      </span>
                    </button>
                    <RowActions onEdit={() => onEditProduto(p)} onDel={() => onDelProduto(p)} />
                  </div>
                </div>

                {aberto && (
                  <div className="border-t bg-muted/20 p-4 space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      {/* Entradas */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="size-6 rounded-md bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                            <ArrowDownToLine className="size-3.5" />
                          </div>
                          <p className="text-xs font-bold text-emerald-600">
                            Entradas ({entradasProduto.length})
                          </p>
                        </div>
                        {entradasProduto.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground italic pl-8">Nenhuma entrada.</p>
                        ) : (
                          <ul className="space-y-1.5 pl-8">
                            {entradasProduto.map((e) => (
                              <li key={e.id} className="p-2.5 rounded-xl bg-card border flex items-center justify-between gap-2 text-xs">
                                <div className="min-w-0">
                                  <p className="font-bold text-emerald-600 truncate">
                                    + {formatNumber(e.quantidade)} {e.unidade}
                                    {e.custo_total != null && <span className="text-foreground/60 font-normal ml-1.5">({formatBRL(Number(e.custo_total))})</span>}
                                  </p>
                                  <p className="text-muted-foreground text-[10px] truncate">
                                    {formatDateSafe(e.data_entrada)}
                                    {e.fornecedor && ` · ${e.fornecedor}`}
                                  </p>
                                </div>
                                <RowActions onEdit={() => onEditEntrada(e)} onDel={() => onDelEntrada(e)} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Saídas */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="size-6 rounded-md bg-rose-500/15 text-rose-600 flex items-center justify-center shrink-0">
                            <ArrowDownToLine className="size-3.5 rotate-180" />
                          </div>
                          <p className="text-xs font-bold text-rose-600">
                            Consumos ({saidasProduto.length})
                          </p>
                        </div>
                        {saidasProduto.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground italic pl-8">Nenhum consumo.</p>
                        ) : (
                          <ul className="space-y-1.5 pl-8">
                            {saidasProduto.map((c) => {
                              const viv = (viveiros ?? []).find((v) => v?.id === c.viveiro_id);
                              return (
                                <li key={c.id} className="p-2.5 rounded-xl bg-card border flex items-center justify-between gap-2 text-xs">
                                  <div className="min-w-0">
                                    <p className="font-bold text-rose-600 truncate">
                                      - {formatNumber(c.quantidade)} {c.unidade}
                                      <span className="text-foreground/60 font-normal ml-1.5">
                                        {viv ? viv.nome : "Geral"}
                                      </span>
                                    </p>
                                    <p className="text-muted-foreground text-[10px]">
                                      {formatDateSafe(c.data_lancamento)}
                                    </p>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Timeline de Movimentações */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between gap-2 flex-wrap px-1">
          <div>
            <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <History className="size-3.5 text-primary" /> Histórico de Movimentações
            </h3>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setFiltroTimeline("todas")}
              className={`px-2.5 py-1 rounded-md transition ${filtroTimeline === "todas" ? "bg-card shadow-xs text-foreground font-bold" : "text-muted-foreground hover:text-foreground"}`}
            >
              Todas ({movimentacoes.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroTimeline("entradas")}
              className={`px-2.5 py-1 rounded-md transition ${filtroTimeline === "entradas" ? "bg-card shadow-xs text-emerald-600 font-bold" : "text-muted-foreground hover:text-foreground"}`}
            >
              + Entradas
            </button>
            <button
              type="button"
              onClick={() => setFiltroTimeline("saidas")}
              className={`px-2.5 py-1 rounded-md transition ${filtroTimeline === "saidas" ? "bg-card shadow-xs text-rose-600 font-bold" : "text-muted-foreground hover:text-foreground"}`}
            >
              - Saídas
            </button>
          </div>
        </div>

        {movimentacoesFiltradas.length === 0 ? (
          <div className="p-8 rounded-2xl border-2 border-dashed text-center space-y-1">
            <History className="size-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground font-medium">Nenhuma movimentação encontrada.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {movimentacoesFiltradas.slice(0, 50).map((m) => (
              <div key={m.id} className="p-3 rounded-xl bg-card border flex items-center justify-between gap-3 text-xs shadow-xs hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`size-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm ${
                      m.tipo === "entrada"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    }`}
                  >
                    {m.tipo === "entrada" ? "+" : "-"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground text-sm truncate">{m.produtoNome}</p>
                    <p className="text-muted-foreground text-[10px] truncate">
                      {formatDateSafe(m.data)} · {m.detalhe}
                      {m.custo != null && ` · ${formatBRL(m.custo)}`}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-black tabular-nums shrink-0 ${m.tipo === "entrada" ? "text-emerald-600" : "text-rose-600"}`}>
                  {m.tipo === "entrada" ? "+" : "-"} {formatNumber(m.quantidade)} {m.unidade}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function gerarPdfCompras(
  produtos: Produto[],
  entradas: EstoqueEntrada[],
  totais: { totalGasto: number; totalVolume: number; countCompras: number }
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

  // Banner Superior / Header
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, 210, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("RELATÓRIO EXECUTIVO DE COMPRAS & ABASTECIMENTO", 14, 12);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Emitido em ${dataHojeStr} às ${horaStr}`, 14, 18);

  // Resumo Executivo
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("RESUMO GERAL DE COMPRAS", 14, 30);

  // Box Total Gasto
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 34, 58, 18, 2, 2, "F");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("INVESTIMENTO TOTAL GASTO", 18, 40);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(16, 185, 129);
  doc.text(`R$ ${totais.totalGasto.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 18, 47);

  // Box Volume Total
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(76, 34, 58, 18, 2, 2, "F");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("VOLUME TOTAL ADQUIRIDO", 80, 40);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(`${totais.totalVolume.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`, 80, 47);

  // Box Qtd Compras
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(138, 34, 58, 18, 2, 2, "F");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("QTD DE REGISTROS DE COMPRA", 142, 40);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(`${totais.countCompras} compra(s)`, 142, 47);

  let currentY = 58;

  // Agrupamento por Produto
  const prodMap = new Map<string, { nome: string; count: number; volume: number; custo: number }>();
  for (const e of entradas) {
    const prod = produtos.find((x) => x.id === e.produto_id);
    const nome = prod?.nome ?? "Produto";
    const cur = prodMap.get(nome) ?? { nome, count: 0, volume: 0, custo: 0 };
    cur.count += 1;
    cur.volume += Number(e.quantidade ?? 0);
    cur.custo += Number(e.custo_total ?? 0);
    prodMap.set(nome, cur);
  }
  const porProduto = Array.from(prodMap.values()).sort((a, b) => b.custo - a.custo);

  // Tabela 1: Resumo Acumulado por Produto
  if (porProduto.length > 0) {
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("1. INVESTIMENTO E VOLUME POR PRODUTO", 14, currentY);

    autoTable(doc, {
      startY: currentY + 3,
      head: [["Produto", "Nº de Compras", "Volume Total", "Investimento Total (R$)"]],
      body: porProduto.map((p) => [
        p.nome,
        `${p.count}x`,
        `${p.volume.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`,
        `R$ ${p.custo.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // Tabela 2: Histórico Detalhado das Compras
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(`2. DETALHAMENTO HISTÓRICO DAS COMPRAS (${entradas.length})`, 14, currentY);

  if (entradas.length === 0) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text("Nenhuma compra registrada.", 14, currentY + 5);
  } else {
    autoTable(doc, {
      startY: currentY + 3,
      head: [["Data", "Produto", "Quantidade", "Custo Unit.", "Fornecedor / Obs", "Total (R$)"]],
      body: entradas.slice(0, 18).map((e) => {
        const prod = produtos.find((x) => x.id === e.produto_id);
        return [
          formatDateSafe(e.data_entrada),
          prod?.nome ?? "Produto",
          `${Number(e.quantidade ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${e.unidade ?? "kg"}`,
          e.preco_unidade != null ? `R$ ${Number(e.preco_unidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—",
          e.fornecedor || e.observacao || "Geral",
          e.custo_total != null ? `R$ ${Number(e.custo_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—",
        ];
      }),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  // Footer em 1 página
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Viveiros App · Relatório de Compras gerado em ${dataHojeStr} às ${horaStr}`, 14, 287);
    doc.text(`Página ${i} de ${pageCount}`, 196, 287, { align: "right" });
  }

  const pdfBlob = doc.output("blob") as Blob;
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, "_blank");
  toast.success("PDF de Compras gerado com sucesso!");
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
  const [busca, setBusca] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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

  const totalGasto = (entradas ?? []).reduce((s, e) => s + Number(e.custo_total ?? 0), 0);
  const totalVolume = (entradas ?? []).reduce((s, e) => s + Number(e.quantidade ?? 0), 0);

  const entradasFiltradas = useMemo(() => {
    return (entradas ?? []).filter((e) => {
      if (!busca.trim()) return true;
      const term = busca.toLowerCase().trim();
      const prod = produtos.find((p) => p.id === e.produto_id);
      const prodMatch = (prod?.nome || "").toLowerCase().includes(term);
      const fornMatch = (e.fornecedor || "").toLowerCase().includes(term);
      const obsMatch = (e.observacao || "").toLowerCase().includes(term);
      return prodMatch || fornMatch || obsMatch;
    });
  }, [entradas, produtos, busca]);

  async function handleExportPdf() {
    try {
      setIsGeneratingPdf(true);
      await gerarPdfCompras(produtos, entradas, {
        totalGasto,
        totalVolume,
        countCompras: entradas.length,
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Resumo Executivo / KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-card border p-4 shadow-sm space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Investimento Total Gasto</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatBRL(totalGasto)}
          </p>
        </div>
        <div className="rounded-2xl bg-card border p-4 shadow-sm space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Volume Total Comprado</p>
          <p className="text-2xl font-black text-foreground tabular-nums">
            {formatNumber(totalVolume)} kg
          </p>
        </div>
        <div className="rounded-2xl bg-card border p-4 shadow-sm space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Registros de Compras</p>
          <p className="text-2xl font-black text-foreground tabular-nums">
            {entradas.length} {entradas.length === 1 ? "compra" : "compras"}
          </p>
        </div>
      </div>

      {/* Banner de Ações Rápidas */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-muted/40 p-3 rounded-2xl border">
        <div>
          <h3 className="font-bold text-base">Histórico de Compras & Abastecimento</h3>
          <p className="text-xs text-muted-foreground">Gestão financeira de compras e insumos abastecidos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isGeneratingPdf}
            className="h-10 px-3.5 rounded-xl border bg-background hover:bg-muted font-bold text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 shrink-0"
            title="Gerar PDF do relatório de compras em 1 página"
          >
            <FileDown className="size-4 text-emerald-600" />
            {isGeneratingPdf ? "Gerando..." : "Gerar PDF"}
          </button>
          <button
            onClick={onNovaCompra}
            className="h-10 px-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs inline-flex items-center gap-1.5 shadow-sm hover:opacity-90 transition shrink-0"
          >
            <Plus className="size-4" /> Nova Compra
          </button>
        </div>
      </div>

      {/* Barra de Busca de Compras */}
      {entradas.length > 0 && (
        <div className="relative">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por produto, fornecedor ou nota…"
            className="app-input w-full pl-3 text-sm"
          />
        </div>
      )}

      {/* Lista do Histórico de Compras */}
      {entradasFiltradas.length === 0 ? (
        <div className="p-8 rounded-2xl border-2 border-dashed text-center space-y-2">
          <p className="font-semibold">Nenhuma compra encontrada</p>
          <p className="text-xs text-muted-foreground">Tente alterar o termo de busca ou faça um novo lançamento.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entradasFiltradas.map((e) => {
            const p = produtos.find((x) => x.id === e.produto_id);
            return (
              <li
                key={e.id}
                className="p-4 rounded-2xl bg-card border flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap shadow-xs hover:border-primary/40 transition"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="size-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center shrink-0 font-bold">
                    <ShoppingCart className="size-5" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-base text-foreground truncate">{p?.nome ?? "Produto"}</p>
                      {p?.categoria && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                          {p.categoria}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {formatDateSafe(e.data_entrada)}
                      {e.preco_unidade != null && ` · ${formatBRL(Number(e.preco_unidade))}/${e.unidade || "kg"}`}
                      {e.fornecedor && ` · Fornecedor: ${e.fornecedor}`}
                      {e.observacao && ` · Obs: ${e.observacao}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      + {formatNumber(Number(e.quantidade ?? 0))} {e.unidade || "kg"}
                    </p>
                    {e.custo_total != null && (
                      <p className="text-xs font-bold text-foreground tabular-nums">
                        {formatBRL(Number(e.custo_total))}
                      </p>
                    )}
                  </div>
                  <RowActions onEdit={() => onEditCompra(e)} onDel={() => onDelCompra(e)} />
                </div>
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
      
      let targetProdId = produtoId;
      if (isNovo) {
        if (!novoNome.trim()) throw new Error("Informe o nome do novo produto");
        const { data: pData, error: pErr } = await supabase
          .from("produtos")
          .insert({ user_id, nome: novoNome.trim(), categoria: "racao", unidade: "kg" })
          .select("id")
          .single();
        if (pErr) throw pErr;
        targetProdId = pData.id;
      }

      const selectedProd = produtos.find((x) => x.id === targetProdId);
      const emb = parseProdutoEmbalagem(selectedProd?.unidade);
      const qNumInput = Number(quantidade);

      let finalQtyEstoque = qNumInput;
      let finalUnidadeEstoque = getUnidadeBase(unidade || selectedProd?.unidade || "kg");

      if (emb.temEmbalagem && emb.pesoEmbalagem && (unidade.toLowerCase().includes(emb.tipoEmbalagem) || unidade === "saco" || unidade === "pacote" || unidade === "caixa")) {
        finalQtyEstoque = qNumInput * emb.pesoEmbalagem;
      }

      const payload = {
        produto_id: targetProdId,
        quantidade: finalQtyEstoque,
        unidade: finalUnidadeEstoque,
        preco_unidade: precoNum,
        custo_total: custoTotal,
        fornecedor: fornecedor.trim() || null,
        data_entrada: data,
        observacao: observacao.trim() || (emb.temEmbalagem && (unidade.toLowerCase().includes(emb.tipoEmbalagem) || unidade === "saco") ? `${qNumInput} ${emb.tipoEmbalagem}(s) de ${emb.pesoEmbalagem} ${emb.unidadeBase}` : null),
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

  const selectedProd = produtos.find((x) => x.id === produtoId);
  const selectedEmb = parseProdutoEmbalagem(selectedProd?.unidade);

  return (
    <ModalShell title={entrada ? "Editar entrada" : "Entrada de mercadoria"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Produto">
          <select
            required
            value={produtoId}
            onChange={(e) => {
              const pId = e.target.value;
              setProdutoId(pId);
              const p = produtos.find((x) => x.id === pId);
              if (p) {
                const emb = parseProdutoEmbalagem(p.unidade);
                setUnidade(emb.temEmbalagem ? emb.tipoEmbalagem : emb.unidadeBase);
                if (p.preco_unidade != null) setPreco(String(p.preco_unidade));
              }
            }}
            className="app-input"
          >
            <option value="">Selecione...</option>
            {produtos.map((p) => {
              const emb = parseProdutoEmbalagem(p.unidade);
              return (
                <option key={p.id} value={p.id}>
                  {p.nome} {emb.temEmbalagem ? `(${emb.rotuloEmbalagem})` : ""}
                </option>
              );
            })}
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
          <Field label="Quantidade Comprada">
            <input
              required
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="app-input font-bold"
            />
          </Field>
          <Field label="Unidade">
            {selectedEmb.temEmbalagem ? (
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                className="app-input font-bold text-primary"
              >
                <option value={selectedEmb.tipoEmbalagem}>{selectedEmb.tipoEmbalagem} ({selectedEmb.pesoEmbalagem} {selectedEmb.unidadeBase})</option>
                <option value={selectedEmb.unidadeBase}>{selectedEmb.unidadeBase} (unidade base)</option>
              </select>
            ) : (
              <UnidadeSelect value={unidade} onChange={setUnidade} />
            )}
          </Field>
        </div>

        {selectedEmb.temEmbalagem && (unidade.toLowerCase().includes(selectedEmb.tipoEmbalagem) || unidade === "saco") && Number(quantidade) > 0 && (
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
            💡 {quantidade} {selectedEmb.tipoEmbalagem}(s) de {selectedEmb.pesoEmbalagem} {selectedEmb.unidadeBase} = <strong className="text-foreground">{Number(quantidade) * (selectedEmb.pesoEmbalagem || 1)} {selectedEmb.unidadeBase}</strong> no estoque
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Preço por ${selectedEmb.temEmbalagem && (unidade.toLowerCase().includes(selectedEmb.tipoEmbalagem) || unidade === "saco") ? selectedEmb.unidadeBase : (unidade || "un")} (R$)`}>
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
              className="app-input bg-muted font-bold text-emerald-600"
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
  const embInfo = useMemo(() => parseProdutoEmbalagem(produto?.unidade), [produto?.unidade]);

  const [nome, setNome] = useState(produto?.nome ?? "");
  const [categoria, setCategoria] = useState(produto?.categoria ?? "racao");
  const [formatType, setFormatType] = useState<"embalagem" | "avulso">(embInfo.temEmbalagem ? "embalagem" : "embalagem");
  const [tipoEmbalagem, setTipoEmbalagem] = useState(embInfo.tipoEmbalagem || "balde");
  const [pesoEmbalagem, setPesoEmbalagem] = useState(embInfo.pesoEmbalagem != null ? String(embInfo.pesoEmbalagem) : "335");
  const [unidadeBase, setUnidadeBase] = useState(embInfo.unidadeBase || "g");

  const [precoKg, setPrecoKg] = useState(produto?.preco_unidade != null ? String(produto.preco_unidade) : "");
  const [precoEmbalagem, setPrecoEmbalagem] = useState(() => {
    if (produto?.preco_unidade != null && embInfo.pesoEmbalagem) {
      return (produto.preco_unidade * embInfo.pesoEmbalagem).toFixed(2);
    }
    return "";
  });
  const [loading, setLoading] = useState(false);

  function handlePrecoEmbalagemChange(val: string) {
    setPrecoEmbalagem(val);
    const pEmb = Number(val.replace(",", "."));
    const peso = Number(pesoEmbalagem.replace(",", "."));
    if (pEmb > 0 && peso > 0) {
      setPrecoKg((pEmb / peso).toString());
    }
  }

  function handlePrecoKgChange(val: string) {
    setPrecoKg(val);
    const pKg = Number(val.replace(",", "."));
    const peso = Number(pesoEmbalagem.replace(",", "."));
    if (pKg > 0 && peso > 0) {
      setPrecoEmbalagem((pKg * peso).toFixed(2));
    }
  }

  function handlePesoEmbalagemChange(val: string) {
    setPesoEmbalagem(val);
    const peso = Number(val.replace(",", "."));
    const pEmb = Number(precoEmbalagem.replace(",", "."));
    if (pEmb > 0 && peso > 0) {
      setPrecoKg((pEmb / peso).toString());
    } else {
      const pKg = Number(precoKg.replace(",", "."));
      if (pKg > 0 && peso > 0) {
        setPrecoEmbalagem((pKg * peso).toFixed(2));
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Sem sessão");

      const pKgNum = precoKg.trim() === "" ? null : Number(precoKg.replace(",", "."));
      if (pKgNum != null && (isNaN(pKgNum) || pKgNum < 0)) {
        throw new Error("Preço inválido");
      }

      const isEmb = formatType === "embalagem";
      const pesoNum = Number(pesoEmbalagem.replace(",", "."));
      const finalUnidade = formatUnidadeDb(
        unidadeBase.trim() || "kg",
        isEmb ? tipoEmbalagem : undefined,
        isEmb ? pesoNum : null
      );

      if (produto) {
        const { error } = await supabase
          .from("produtos")
          .update({
            nome: nome.trim(),
            categoria,
            unidade: finalUnidade,
            preco_unidade: pKgNum,
          })
          .eq("id", produto.id);
        if (error) throw error;
        toast.success("Produto atualizado!");
      } else {
        const { error } = await supabase.from("produtos").insert({
          user_id,
          nome: nome.trim(),
          categoria,
          unidade: finalUnidade,
          preco_unidade: pKgNum,
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

  const pEmbNum = Number(precoEmbalagem.replace(",", ".")) || 0;
  const pesoNum = Number(pesoEmbalagem.replace(",", ".")) || 0;
  const pKgNum = Number(precoKg.replace(",", ".")) || (pEmbNum > 0 && pesoNum > 0 ? pEmbNum / pesoNum : 0);

  return (
    <ModalShell title={produto ? "Editar Produto" : "Cadastrar Novo Produto"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        
        {/* Nome e Categoria */}
        <div className="space-y-3">
          <Field label="Nome do Produto">
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Probiótico Super, Ração 35%..."
              className="app-input text-base font-medium"
            />
          </Field>

          <Field label="Categoria">
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="app-input"
            >
              <option value="racao">🌾 Ração</option>
              <option value="probiotico">🧪 Probiótico</option>
              <option value="medicamento">💊 Medicamento / Tratamento</option>
              <option value="fertilizante">🌱 Fertilizante / Mineral</option>
              <option value="servico">🛠️ Serviço</option>
              <option value="outro">📦 Outro</option>
            </select>
          </Field>
        </div>

        {/* Formato do Produto (Botoes Didáticos Grandes) */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
            Como este produto é comprado ou cadastrado?
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormatType("embalagem")}
              className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                formatType === "embalagem"
                  ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30 shadow-sm"
                  : "border-border bg-card hover:bg-muted text-muted-foreground"
              }`}
            >
              <div className="size-11 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold text-xl shrink-0">
                📦
              </div>
              <div>
                <p className="font-bold text-sm text-foreground">Embalagem Fechada</p>
                <p className="text-[11px] leading-tight text-muted-foreground">Balde, Saco, Caixa, Pacote, Pré-Larvas...</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFormatType("avulso")}
              className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                formatType === "avulso"
                  ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30 shadow-sm"
                  : "border-border bg-card hover:bg-muted text-muted-foreground"
              }`}
            >
              <div className="size-11 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold text-xl shrink-0">
                秤
              </div>
              <div>
                <p className="font-bold text-sm text-foreground">Por Peso / Litro</p>
                <p className="text-[11px] leading-tight text-muted-foreground">Vendido direto por Kg, Grama ou Litro</p>
              </div>
            </button>
          </div>
        </div>

        {/* CASO 1: EMBALAGEM FECHADA */}
        {formatType === "embalagem" && (
          <div className="p-4 rounded-2xl border-2 border-primary/30 bg-primary/5 space-y-4">
            
            {/* Passo 1: Tipo de Embalagem */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-primary uppercase tracking-wide block">
                1️⃣ Escolha a Embalagem:
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  { id: "balde", label: "Balde", icon: "🪣" },
                  { id: "saco", label: "Saco", icon: "🌾" },
                  { id: "caixa", label: "Caixa", icon: "📦" },
                  { id: "pacote", label: "Pacote", icon: "✉️" },
                  { id: "frasco", label: "Frasco", icon: "🧪" },
                  { id: "pre_larvas", label: "Pré-Larvas", icon: "🦐" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTipoEmbalagem(item.id)}
                    className={`py-2 px-1 rounded-xl border text-center font-semibold text-xs flex flex-col items-center gap-1 transition ${
                      tipoEmbalagem === item.id
                        ? "border-primary bg-primary text-primary-foreground font-bold shadow-xs"
                        : "border-border bg-card hover:bg-muted text-foreground"
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Passo 2: Conteúdo da Embalagem */}
            <Field label={`2️⃣ Quanto vem dentro de 1 ${tipoEmbalagem.toUpperCase()}?`}>
              <div className="grid grid-cols-5 gap-2">
                <input
                  required
                  type="number"
                  min="0.001"
                  step="any"
                  inputMode="decimal"
                  value={pesoEmbalagem}
                  onChange={(e) => handlePesoEmbalagemChange(e.target.value)}
                  placeholder="Ex: 335"
                  className="app-input col-span-3 font-bold text-base border-primary/40 text-foreground"
                />
                <select
                  value={unidadeBase}
                  onChange={(e) => {
                    setUnidadeBase(e.target.value);
                    if (pEmbNum > 0 && pesoNum > 0) handlePrecoEmbalagemChange(precoEmbalagem);
                  }}
                  className="app-input col-span-2 font-bold px-2 text-xs sm:text-sm"
                >
                  <option value="g">gramas (g)</option>
                  <option value="kg">quilos (kg)</option>
                  <option value="ml">ml (mililitros)</option>
                  <option value="litro">litros (l)</option>
                  <option value="un">unidades</option>
                </select>
              </div>
            </Field>

            {/* Passo 3: Preço do Balde/Embalagem */}
            <Field label={`3️⃣ Preço total de 1 ${tipoEmbalagem.toUpperCase()} (R$)`}>
              <input
                type="text"
                inputMode="decimal"
                value={precoEmbalagem}
                onChange={(e) => handlePrecoEmbalagemChange(e.target.value)}
                placeholder="Ex: 150,00"
                className="app-input font-bold text-base text-primary border-primary/40"
              />
            </Field>

            {/* 📊 RESUMO DIDÁTICO DAS CONTAS AUTOMÁTICAS */}
            {pEmbNum > 0 && pesoNum > 0 && (
              <div className="p-3.5 rounded-xl bg-card border border-emerald-500/30 space-y-2.5 shadow-xs">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 flex items-center gap-1.5">
                  ✨ Contas Calculadas Automáticas do Produto:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/20">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Valor da Embalagem</span>
                    <span className="text-sm font-black text-primary">R$ {pEmbNum.toFixed(2)}</span>
                    <span className="text-[10px] text-muted-foreground block">por {tipoEmbalagem}</span>
                  </div>

                  <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/20">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Custo por {unidadeBase}</span>
                    <span className="text-sm font-black text-emerald-600">
                      R$ {pKgNum < 0.01 ? pKgNum.toFixed(4) : pKgNum.toFixed(2)} / {unidadeBase}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">fracionado</span>
                  </div>

                  {unidadeBase === "g" && (
                    <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/20">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">Custo por Quilo (1.000g)</span>
                      <span className="text-sm font-black text-foreground">
                        R$ {(pKgNum * 1000).toFixed(2)} / kg
                      </span>
                      <span className="text-[10px] text-muted-foreground block">proporcional</span>
                    </div>
                  )}

                  {unidadeBase === "kg" && (
                    <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/20">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">Custo por Grama (1g)</span>
                      <span className="text-sm font-black text-foreground">
                        R$ {(pKgNum / 1000).toFixed(4)} / g
                      </span>
                      <span className="text-[10px] text-muted-foreground block">fracionado</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CASO 2: VENDIDO POR QUILO / VOLUME AVULSO */}
        {formatType === "avulso" && (
          <div className="p-4 rounded-2xl border bg-muted/20 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidade Base">
                <UnidadeSelect value={unidadeBase} onChange={setUnidadeBase} />
              </Field>

              <Field label={`Preço por ${unidadeBase} (R$)`}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={precoKg}
                  onChange={(e) => setPrecoKg(e.target.value)}
                  placeholder="Ex: 5,00"
                  className="app-input font-bold"
                />
              </Field>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-base shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Salvando..." : "💾 Salvar Produto"}
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
  const [dataInicio, setDataInicio] = useState(funcionario?.data_inicio ?? "");
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
        viveiro_id: viveiroId === "__geral__" ? null : (viveiroId || null),
        data_inicio: dataInicio || null,
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

        <Field label="Data de início (opcional)">
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="app-input"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Se o funcionário já começou antes, defina a data. Usado no cálculo de dias trabalhados para diaristas.
          </p>
        </Field>

        <Field label="Alocação ao Viveiro">
          <select
            value={viveiroId}
            onChange={(e) => setViveiroId(e.target.value)}
            className="app-input"
          >
            <option value="">🔄 Distribuído entre os viveiros ativos por dias de cultivo</option>
            <option value="__geral__">🏢 Não vinculado a nenhum viveiro (Gasto geral)</option>
            {viveiros.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            {viveiroId === "__geral__"
              ? "Funcionário geral, não vinculado a nenhum viveiro específico."
              : viveiroId
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
