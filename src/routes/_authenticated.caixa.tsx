import { todayLocal } from "@/lib/date";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Pencil, X, Wallet, Users, TrendingUp, TrendingDown } from "lucide-react";
import { sortByViveiroNome } from "@/lib/sort";

export const Route = createFileRoute("/_authenticated/caixa")({
  head: () => ({ meta: [{ title: "Caixa" }] }),
  component: CaixaPage,
});

type ViveiroOpt = { id: string; nome: string };
type Lanc = {
  id: string;
  viveiro_id: string | null;
  data_lancamento: string;
  descricao: string;
  categoria: string;
  valor: number;
  observacao: string | null;
  tipo: "despesa" | "receita";
};

const TODOS = "__todos__";

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function CaixaPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Lanc | null>(null);

  const [tipo, setTipo] = useState<"despesa" | "receita">("despesa");
  const [viveiroId, setViveiroId] = useState<string>(TODOS);
  const [data, setData] = useState(todayLocal());
  const [produtoId, setProdutoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precoKg, setPrecoKg] = useState("");
  const [qtd, setQtd] = useState("");
  const [unidade, setUnidade] = useState<"kg" | "g">("kg");
  const [valorManual, setValorManual] = useState("");

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

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos", "caixa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, categoria, unidade, preco_unidade")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        nome: string;
        categoria: string;
        unidade: string;
        preco_unidade: number | null;
      }>;
    },
  });

  const { data: funcionarios = [] } = useQuery({
    queryKey: ["funcionarios", "caixa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("id, nome, salario, viveiro_id")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        nome: string;
        salario: number;
        viveiro_id: string | null;
      }>;
    },
  });

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ["caixa", "lancamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixa_lancamentos")
        .select("id, viveiro_id, data_lancamento, descricao, categoria, valor, observacao, tipo")
        .order("data_lancamento", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lanc[];
    },
  });

  // valor calculado a partir de preço/kg e quantidade
  const valorAuto = useMemo(() => {
    const p = Number(precoKg.replace(",", ".")) || 0;
    const q = Number(qtd.replace(",", ".")) || 0;
    if (!p || !q) return 0;
    const qKg = unidade === "g" ? q / 1000 : q;
    return p * qKg;
  }, [precoKg, qtd, unidade]);

  const valorFinal = valorAuto > 0 ? valorAuto : Number(valorManual.replace(",", ".")) || 0;

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error("Sessão expirada.");
      if (!descricao.trim()) throw new Error("Informe a descrição.");
      if (!valorFinal || valorFinal <= 0) throw new Error("Informe o valor.");
      const { error } = await supabase.from("caixa_lancamentos").insert({
        user_id: userId,
        viveiro_id: viveiroId === TODOS ? null : viveiroId,
        data_lancamento: data,
        descricao: descricao.trim(),
        categoria: categoria.trim() || (tipo === "receita" ? "venda" : "geral"),
        valor: valorFinal,
        tipo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tipo === "receita" ? "Receita registrada" : "Despesa registrada");
      setProdutoId("");
      setDescricao("");
      setCategoria("");
      setPrecoKg("");
      setQtd("");
      setValorManual("");
      qc.invalidateQueries({ queryKey: ["caixa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("caixa_lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["caixa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Relatório: total por viveiro com rateio dos gerais (despesas E receitas)
  const relatorio = useMemo(() => {
    const sign = (l: Lanc) => (l.tipo === "receita" ? 1 : -1);
    const val = (l: Lanc) => Number(l.valor ?? 0);

    const totalDespesas = lancamentos.filter((l) => l.tipo !== "receita").reduce((s, l) => s + val(l), 0);
    const totalReceitas = lancamentos.filter((l) => l.tipo === "receita").reduce((s, l) => s + val(l), 0);
    const saldoGeral = totalReceitas - totalDespesas;

    const rateados = lancamentos.filter((l) => !l.viveiro_id);
    const despesasGerais = rateados.filter((l) => l.tipo !== "receita").reduce((s, l) => s + val(l), 0);
    const receitasGerais = rateados.filter((l) => l.tipo === "receita").reduce((s, l) => s + val(l), 0);
    const nAtivos = viveiros.length || 1;
    const rateioDesp = despesasGerais / nAtivos;
    const rateioRec = receitasGerais / nAtivos;

    const porViveiro = viveiros.map((v) => {
      const diretos = lancamentos.filter((l) => l.viveiro_id === v.id);
      const despDireto = diretos.filter((l) => l.tipo !== "receita").reduce((s, l) => s + val(l), 0);
      const recDireto = diretos.filter((l) => l.tipo === "receita").reduce((s, l) => s + val(l), 0);
      const historico = [
        ...diretos.map((l) => ({ l, rateado: false, valorMostrado: val(l) * sign(l) })),
        ...rateados.map((l) => ({
          l,
          rateado: true,
          valorMostrado: (val(l) / nAtivos) * sign(l),
        })),
      ].sort((a, b) => (a.l.data_lancamento < b.l.data_lancamento ? 1 : -1));
      const despesaTotal = despDireto + rateioDesp;
      const receitaTotal = recDireto + rateioRec;
      return {
        id: v.id,
        nome: v.nome,
        despesaTotal,
        receitaTotal,
        saldo: receitaTotal - despesaTotal,
        historico,
      };
    });

    return { totalDespesas, totalReceitas, saldoGeral, despesasGerais, receitasGerais, porViveiro, nAtivos };
  }, [lancamentos, viveiros]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Wallet className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Caixa</h1>
          <p className="text-sm text-muted-foreground">Despesas e receitas por viveiro</p>
        </div>
      </div>

      {/* Resumo geral */}
      <section className="rounded-2xl border bg-gradient-to-br from-primary/10 to-primary/5 p-4 space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Saldo geral
          </p>
          <p
            className={`text-2xl sm:text-3xl font-black tabular-nums break-words ${relatorio.saldoGeral >= 0 ? "text-emerald-600" : "text-destructive"}`}
          >
            {fmtBRL(relatorio.saldoGeral)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] uppercase font-bold opacity-80">
              <TrendingUp className="size-3" /> Receitas
            </p>
            <p className="font-bold tabular-nums">{fmtBRL(relatorio.totalReceitas)}</p>
          </div>
          <div className="rounded-lg bg-destructive/10 text-destructive px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] uppercase font-bold opacity-80">
              <TrendingDown className="size-3" /> Despesas
            </p>
            <p className="font-bold tabular-nums">{fmtBRL(relatorio.totalDespesas)}</p>
          </div>
        </div>
        {(relatorio.despesasGerais > 0 || relatorio.receitasGerais > 0) && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Users className="size-3" /> Rateado entre {relatorio.nAtivos} viveiro(s)
          </p>
        )}
      </section>

      {/* Carrossel de caixas por viveiro */}
      {relatorio.porViveiro.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Caixa por viveiro
            </h2>
            <span className="text-[10px] text-muted-foreground">deslize →</span>
          </div>
          <div className="-mx-4 px-4 overflow-x-auto snap-x snap-mandatory scrollbar-none">
            <ul className="flex gap-3 pb-2">
              {relatorio.porViveiro.map((v) => (
                <li
                  key={v.id}
                  className="snap-start shrink-0 w-[78%] sm:w-[300px] rounded-2xl border bg-card p-4 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Viveiro
                      </p>
                      <p className="font-bold text-base truncate">{v.nome || "—"}</p>
                    </div>
                    <span className="shrink-0 size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Wallet className="size-4" />
                    </span>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Saldo
                    </p>
                    <p
                      className={`text-2xl font-black tabular-nums ${v.saldo >= 0 ? "text-emerald-600" : "text-destructive"}`}
                    >
                      {fmtBRL(v.saldo)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground tabular-nums">
                      <span className="text-emerald-600">+ {fmtBRL(v.receitaTotal)}</span>
                      <span className="text-destructive">− {fmtBRL(v.despesaTotal)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      Histórico
                    </p>
                    {v.historico.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        Nada lançado pra esse viveiro ainda.
                      </p>
                    ) : (
                      <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
                        {v.historico.map((h) => (
                          <li
                            key={`${v.id}-${h.l.id}`}
                            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-xs py-1 border-b border-border/40 last:border-0"
                          >
                            <span className="truncate">
                              <span className="text-muted-foreground">
                                {fmtDate(h.l.data_lancamento)}
                              </span>{" "}
                              <span className="font-medium">{h.l.descricao}</span>
                              {h.rateado && (
                                <span className="ml-1 text-[9px] uppercase tracking-wide text-primary/80">
                                  · rateado
                                </span>
                              )}
                            </span>
                            <span
                              className={`font-semibold tabular-nums shrink-0 ${h.l.tipo === "receita" ? "text-emerald-600" : "text-destructive"}`}
                            >
                              {h.l.tipo === "receita" ? "+" : "−"} {fmtBRL(Math.abs(h.valorMostrado))}
                            </span>
                            <div className="flex gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditing(h.l)}
                                className="size-6 rounded text-muted-foreground hover:bg-primary/10 hover:text-primary flex items-center justify-center"
                                aria-label="Editar"
                              >
                                <Pencil className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Apagar "${h.l.descricao}"?`)) delMut.mutate(h.l.id);
                                }}
                                className="size-6 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                                aria-label="Apagar"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="space-y-4 rounded-2xl bg-card border p-5"
      >
        <h2 className="font-bold">Novo lançamento</h2>

        <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl">
          <button
            type="button"
            onClick={() => setTipo("despesa")}
            className={`h-10 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 transition ${tipo === "despesa" ? "bg-destructive text-destructive-foreground shadow" : "text-muted-foreground"}`}
          >
            <TrendingDown className="size-4" /> Despesa
          </button>
          <button
            type="button"
            onClick={() => setTipo("receita")}
            className={`h-10 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 transition ${tipo === "receita" ? "bg-emerald-600 text-white shadow" : "text-muted-foreground"}`}
          >
            <TrendingUp className="size-4" /> Receita
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Viveiro">
            <select
              value={viveiroId}
              onChange={(e) => setViveiroId(e.target.value)}
              className="app-input"
            >
              <option value={TODOS}>🔄 Todos (rateado)</option>
              {viveiros.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input
              required
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="app-input"
            />
          </Field>
        </div>

        {(produtos.length > 0 || funcionarios.length > 0) && (
          <Field label="Produto ou funcionário (opcional)">
            <select
              value={produtoId}
              onChange={(e) => {
                const id = e.target.value;
                setProdutoId(id);
                if (id.startsWith("func:")) {
                  const fid = id.slice(5);
                  const f = funcionarios.find((x) => x.id === fid);
                  if (f) {
                    setDescricao(`Salário: ${f.nome}`);
                    setCategoria("salario");
                    setPrecoKg("");
                    setQtd("");
                    setValorManual(String(f.salario));
                    setViveiroId(f.viveiro_id ?? TODOS);
                  }
                  return;
                }
                const p = produtos.find((x) => x.id === id);
                if (p) {
                  setDescricao(p.nome);
                  if (p.categoria) setCategoria(p.categoria);
                  if (p.preco_unidade != null) setPrecoKg(String(p.preco_unidade));
                }
              }}
              className="app-input"
            >
              <option value="">— Digitar manualmente —</option>
              {produtos.length > 0 && (
                <optgroup label="Produtos">
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {p.preco_unidade != null
                        ? ` · R$ ${Number(p.preco_unidade).toLocaleString("pt-BR")}/${p.unidade}`
                        : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {funcionarios.length > 0 && (
                <optgroup label="Funcionários (salário)">
                  {funcionarios.map((f) => (
                    <option key={f.id} value={`func:${f.id}`}>
                      {f.nome} · {Number(f.salario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      {f.viveiro_id ? "" : " · rateado"}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
        )}

        <Field label="Descrição">
          <input
            required
            value={descricao}
            onChange={(e) => {
              setDescricao(e.target.value);
              setProdutoId("");
            }}
            className="app-input"
            placeholder="Ex: Ração 40%, energia, transporte..."
          />
        </Field>

        <Field label="Categoria (opcional)">
          <input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="app-input"
            placeholder="Ex: ração, energia, manutenção"
          />
        </Field>

        <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Calcular por preço × quantidade (opcional)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço por kg (R$)">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9.,]*"
                value={precoKg}
                onChange={(e) => setPrecoKg(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="app-input"
                placeholder="Ex: 1000"
              />
            </Field>
            <Field label="Quantidade">
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value.replace(/[^0-9.,]/g, ""))}
                  className="app-input flex-1"
                  placeholder="Ex: 1"
                />
                <select
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value as "kg" | "g")}
                  className="app-input w-20"
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                </select>
              </div>
            </Field>
          </div>
          {valorAuto > 0 && (
            <p className="text-sm">
              Valor calculado:{" "}
              <span className="font-bold text-primary">{fmtBRL(valorAuto)}</span>
            </p>
          )}
        </div>

        <Field label={valorAuto > 0 ? "Valor (auto)" : "Valor total (R$)"}>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={valorAuto > 0 ? valorAuto.toFixed(2) : valorManual}
            disabled={valorAuto > 0}
            onChange={(e) => setValorManual(e.target.value.replace(/[^0-9.,]/g, ""))}
            className="app-input disabled:opacity-70"
            placeholder="Ex: 150,00"
          />
        </Field>

        <button
          disabled={saveMut.isPending}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
        >
          {saveMut.isPending ? "Salvando..." : "Salvar despesa"}
        </button>
      </form>

      {!isLoading && lancamentos.length === 0 && (
        <div className="p-5 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground">
          Sem despesas ainda.
        </div>
      )}



      {editing && (
        <EditModal
          lanc={editing}
          viveiros={viveiros}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["caixa"] });
          }}
        />
      )}
    </div>
  );
}

function EditModal({
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
  const [tipo, setTipo] = useState<"despesa" | "receita">(lanc.tipo ?? "despesa");
  const [viveiroId, setViveiroId] = useState<string>(lanc.viveiro_id ?? TODOS);
  const [data, setData] = useState(lanc.data_lancamento);
  const [descricao, setDescricao] = useState(lanc.descricao);
  const [categoria, setCategoria] = useState(lanc.categoria);
  const [valor, setValor] = useState(String(lanc.valor));

  const mut = useMutation({
    mutationFn: async () => {
      const v = Number(valor.replace(",", "."));
      if (!descricao.trim() || !v || v <= 0) throw new Error("Preencha descrição e valor.");
      const { error } = await supabase
        .from("caixa_lancamentos")
        .update({
          viveiro_id: viveiroId === TODOS ? null : viveiroId,
          data_lancamento: data,
          descricao: descricao.trim(),
          categoria: categoria.trim() || "geral",
          valor: v,
          tipo,
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
          <h3 className="font-bold">Editar despesa</h3>
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
              value={viveiroId}
              onChange={(e) => setViveiroId(e.target.value)}
              className="app-input"
            >
              <option value={TODOS}>🔄 Todos (rateado)</option>
              {viveiros.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input
              required
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="app-input"
            />
          </Field>
          <Field label="Descrição">
            <input
              required
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="app-input"
            />
          </Field>
          <Field label="Categoria">
            <input
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="app-input"
            />
          </Field>
          <Field label="Valor (R$)">
            <input
              required
              type="text"
              inputMode="decimal"
              pattern="[0-9.,]*"
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ""))}
              className="app-input"
            />
          </Field>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1.5">{label}</span>
      {children}
    </label>
  );
}
