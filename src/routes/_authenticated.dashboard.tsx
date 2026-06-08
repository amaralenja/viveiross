import { todayLocal } from "@/lib/date";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Pencil, X, ClipboardList } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

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
      return (data ?? []) as ViveiroOpt[];
    },
  });

  const { data: produtosList = [] } = useQuery({
    queryKey: ["produtos", "racao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, unidade, preco_unidade")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; unidade: string; preco_unidade: number | null }[];
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
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Lanc[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada.");
      if (!viveiroId) throw new Error("Escolha um viveiro.");
      if (!produto.trim()) throw new Error("Informe o nome da ração.");
      const q = Number(quantidade);
      if (!q || q <= 0) throw new Error("Informe a quantidade.");
      const v = valor ? Number(valor.replace(",", ".")) : null;
      if (valor && (v === null || Number.isNaN(v))) throw new Error("Valor inválido.");
      const { error } = await supabase.from("lancamentos").insert({
        user_id: userId,
        viveiro_id: viveiroId,
        data_lancamento: data,
        produto_nome: produto.trim(),
        quantidade: q,
        unidade: "kg",
        tipo: "racao",
        preco_unidade: null,
        custo_total: v,
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
          {produtosList.length > 0 && (
            <Field label="Produto cadastrado">
              <select
                value={produtoId}
                onChange={(e) => {
                  const id = e.target.value;
                  setProdutoId(id);
                  const p = produtosList.find((x) => x.id === id);
                  if (p) setProduto(p.nome);
                }}
                className="app-input"
              >
                <option value="">— Selecionar produto cadastrado —</option>
                {produtosList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Ração (nome)">
            <input
              required
              value={produto}
              onChange={(e) => {
                setProduto(e.target.value);
                setProdutoId("");
              }}
              className="app-input"
              placeholder="Ex: Ração 40% — ou escolha acima"
            />
          </Field>
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
            <Field label="Valor (R$)">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9.,]*"
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ""))}
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
      )}

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
                min="0"
                step="0.01"
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
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
