import { todayLocal } from "@/lib/date";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Pencil, X, ClipboardList } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { sortByViveiroNome } from "@/lib/sort";

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

function Dashboard() {
  const qc = useQueryClient();

  const [viveiroId, setViveiroId] = useState("");
  const [data, setData] = useState(todayLocal());
  const [produtoId, setProdutoId] = useState("");
  const [produto, setProduto] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [valor, setValor] = useState("");
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
      const [{ data: prods, error: errP }, { data: lancs, error: errL }] = await Promise.all([
        supabase.from("produtos").select("id, nome, unidade, preco_unidade").order("nome"),
        supabase.from("lancamentos").select("produto_nome, unidade, preco_unidade, data_lancamento").order("data_lancamento", { ascending: false }).limit(500),
      ]);
      if (errP) throw errP;
      if (errL) throw errL;
      const list = ((prods ?? []) as { id: string; nome: string; unidade: string; preco_unidade: number | null }[]).slice();
      const seen = new Set(list.map((p) => p.nome.trim().toLowerCase()));
      for (const l of (lancs ?? []) as { produto_nome: string | null; unidade: string | null; preco_unidade: number | null }[]) {
        const nome = (l.produto_nome ?? "").trim();
        if (!nome) continue;
        const key = nome.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ id: `hist:${key}`, nome, unidade: l.unidade ?? "kg", preco_unidade: l.preco_unidade });
      }
      list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      return list;
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
        .order("created_at", { ascending: false })
        .limit(50);

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
  const totalCalc = unitNum > 0 && qNum > 0 ? unitNum * qNum : 0;

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada.");
      if (!viveiroId) throw new Error("Escolha um viveiro.");
      if (!produto.trim()) throw new Error("Informe o nome da ração.");
      const q = Number(quantidade.replace(",", "."));
      if (!q || q <= 0) throw new Error("Informe a quantidade.");
      const unit = valorIsAuto
        ? Number(precoCadastrado)
        : valor
          ? Number(valor.replace(",", "."))
          : null;
      if (unit != null && Number.isNaN(unit)) throw new Error("Valor inválido.");
      const total = unit != null ? unit * q : null;
      const { error } = await supabase.from("lancamentos").insert({
        user_id: userId,
        viveiro_id: viveiroId,
        data_lancamento: data,
        produto_nome: produto.trim(),
        quantidade: q,
        unidade: "kg",
        tipo: "racao",
        preco_unidade: unit,
        custo_total: total,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento salvo");
      setProdutoId("");
      setProduto("");
      setQuantidade("");
      setValor("");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalHoje = useMemo(() => {
    const hoje = todayLocal();
    return ultimos
      .filter((l) => l.tipo === "racao" && l.data_lancamento === hoje)
      .reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
  }, [ultimos]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Olá 👋</h1>
        <p className="text-muted-foreground mt-1">
          Ração hoje: <span className="font-semibold text-foreground">{totalHoje.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg</span>
        </p>
      </div>

      {viveiros.length === 0 ? (
        <div className="p-8 rounded-2xl border-2 border-dashed text-center">
          <p className="font-semibold">Cadastre um viveiro primeiro</p>
          <Link
            to="/viveiros"
            className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
          >
            Abrir viveiros
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate();
          }}
          className="space-y-4 rounded-2xl bg-card border p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Viveiro">
              <select
                required
                value={viveiroId}
                onChange={(e) => setViveiroId(e.target.value)}
                className="app-input"
              >
                <option value="">Escolha</option>
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
          <Field label="Produto">
            <select
              value={produtoId || (produto ? "__manual__" : "")}
              onChange={(e) => {
                const id = e.target.value;
                if (id === "__manual__") {
                  setProdutoId("");
                  setProduto("");
                  return;
                }
                setProdutoId(id);
                const p = produtosList.find((x) => x.id === id);
                if (p) setProduto(p.nome);
                else setProduto("");
              }}
              className="app-input"
              required
            >
              <option value="">— Escolha o produto —</option>
              {produtosList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.preco_unidade != null ? ` — R$ ${Number(p.preco_unidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/${p.unidade}` : ""}
                </option>
              ))}
              <option value="__manual__">✏️ Outro (digitar nome)</option>
            </select>
          </Field>
          {!produtoId && (
            <Field label="Ração (nome)">
              <input
                required
                value={produto}
                onChange={(e) => {
                  setProduto(e.target.value);
                  setProdutoId("");
                }}
                className="app-input"
                placeholder="Ex: Ração 40%"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantidade (kg)">
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                inputMode="decimal"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="app-input"
                placeholder="Ex: 55"
              />
            </Field>
            <Field label={valorIsAuto ? "Valor unit. (auto)" : "Valor unit. (R$)"}>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9.,]*"
                value={valorIsAuto ? String(precoCadastrado) : valor}
                disabled={valorIsAuto}
                onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="app-input disabled:opacity-70"
                placeholder="Opcional"
              />
            </Field>
          </div>
          {totalCalc > 0 && (
            <p className="text-sm text-muted-foreground">
              Total:{" "}
              <span className="font-semibold text-foreground">
                {totalCalc.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </p>
          )}
          <button
            disabled={saveMut.isPending}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMut.isPending ? "Salvando..." : "Salvar lançamento"}
          </button>
        </form>
      )}

      <RacaoHojeOntem />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Histórico</h2>
          <Link to="/relatorios" className="text-sm text-primary font-medium">
            Ver relatório
          </Link>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : ultimos.length === 0 ? (
          <div className="p-5 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <ClipboardList className="size-4" /> Sem lançamentos ainda.
          </div>
        ) : (
          <ul className="space-y-2">
            {ultimos.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between p-4 rounded-xl bg-card border gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{l.produto_nome}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {relName(l.viveiros) || "—"} · {formatDate(l.data_lancamento)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">
                    {Number(l.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {l.unidade}
                  </p>
                  {l.custo_total != null && (
                    <p className="text-xs text-muted-foreground">
                      {Number(l.custo_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditing(l)}
                    className="size-9 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary flex items-center justify-center"
                    aria-label="Editar"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Apagar "${l.produto_nome}"?`)) delMut.mutate(l.id);
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
          <Field label="Ração">
            <input required value={produto} onChange={(e) => setProduto(e.target.value)} className="app-input" />
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
  const hoje = todayLocal();
  const ontemDate = new Date();
  ontemDate.setDate(ontemDate.getDate() - 1);
  const ontem = ymd(ontemDate);

  const { data: linhas = [] } = useQuery({
    queryKey: ["dashboard", "racao-hoje-ontem", hoje, ontem],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("viveiro_id, quantidade, data_lancamento, viveiros(nome)")
        .eq("tipo", "racao")
        .in("data_lancamento", [hoje, ontem]);
      if (error) throw error;
      return (data ?? []) as Array<{
        viveiro_id: string;
        quantidade: number | null;
        data_lancamento: string;
        viveiros: { nome: string } | { nome: string }[] | null;
      }>;
    },
  });

  const stats = useMemo(() => {
    const map = new Map<string, { nome: string; hoje: number; ontem: number }>();
    let totalHoje = 0;
    let totalOntem = 0;
    for (const l of linhas) {
      const nome = relName(l.viveiros) || "Sem viveiro";
      const cur = map.get(l.viveiro_id) ?? { nome, hoje: 0, ontem: 0 };
      const q = Number(l.quantidade ?? 0);
      if (l.data_lancamento === hoje) {
        cur.hoje += q;
        totalHoje += q;
      } else if (l.data_lancamento === ontem) {
        cur.ontem += q;
        totalOntem += q;
      }
      map.set(l.viveiro_id, cur);
    }
    const porViveiro = sortByViveiroNome(Array.from(map.values()), (v) => v.nome);
    return { totalHoje, totalOntem, porViveiro };
  }, [linhas, hoje, ontem]);

  if (stats.totalHoje === 0 && stats.totalOntem === 0) return null;

  const diff = stats.totalHoje - stats.totalOntem;
  const pct = stats.totalOntem > 0 ? (diff / stats.totalOntem) * 100 : null;
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <section className="rounded-2xl border bg-gradient-to-br from-primary/10 to-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Ração — hoje x ontem
        </h2>
        <span
          className={`text-xs font-bold ${
            diff > 0 ? "text-emerald-600" : diff < 0 ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {diff > 0 ? "+" : ""}
          {fmt(diff)} kg
          {pct !== null && (
            <> ({diff > 0 ? "+" : ""}{pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</>
          )}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-background/60 p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Hoje</p>
          <p className="text-xl font-bold text-primary">{fmt(stats.totalHoje)} kg</p>
        </div>
        <div className="rounded-xl bg-background/60 p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Ontem</p>
          <p className="text-xl font-bold">{fmt(stats.totalOntem)} kg</p>
        </div>
      </div>
      {stats.porViveiro.length > 0 && (
        <ul className="space-y-1">
          {stats.porViveiro.map((v) => {
            const d = v.hoje - v.ontem;
            return (
              <li
                key={v.nome}
                className="flex items-center justify-between text-xs rounded-lg bg-background/40 px-3 py-2"
              >
                <span className="font-medium truncate">{v.nome}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-muted-foreground">
                    {fmt(v.ontem)} → <span className="font-semibold text-foreground">{fmt(v.hoje)}</span> kg
                  </span>
                  <span
                    className={`font-bold tabular-nums ${
                      d > 0 ? "text-emerald-600" : d < 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {d > 0 ? "+" : ""}
                    {fmt(d)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

