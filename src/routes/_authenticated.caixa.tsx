import { todayLocal } from "@/lib/date";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Wallet, Trash2, X, CalendarDays, Warehouse } from "lucide-react";

export const Route = createFileRoute("/_authenticated/caixa")({
  head: () => ({ meta: [{ title: "Caixa" }] }),
  component: CaixaPage,
});

type Viveiro = { id: string; nome: string };
type CaixaLanc = {
  id: string;
  descricao: string;
  valor: number;
  data_lancamento: string;
  categoria: string;
  viveiro_id: string | null;
  observacao: string | null;
  viveiros: { nome: string } | { nome: string }[] | null;
};

const CATEGORIAS = [
  "geral",
  "funcionario",
  "energia",
  "manutencao",
  "combustivel",
  "insumo",
  "outro",
] as const;

function relName(rel: { nome: string } | { nome: string }[] | null | undefined): string {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.nome ?? "";
  return rel.nome ?? "";
}

function formatDateBR(data: string) {
  const [y, m, d] = data.split("-");
  return `${d}/${m}/${y}`;
}

function CaixaPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Viveiro[];
    },
  });

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ["caixa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixa_lancamentos")
        .select("id, descricao, valor, data_lancamento, categoria, viveiro_id, observacao, viveiros(nome)")
        .order("data_lancamento", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CaixaLanc[];
    },
  });

  const total = useMemo(
    () => lancamentos.reduce((acc, l) => acc + Number(l.valor ?? 0), 0),
    [lancamentos],
  );

  const totalMes = useMemo(() => {
    const hoje = new Date();
    const ym = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    return lancamentos
      .filter((l) => l.data_lancamento.startsWith(ym))
      .reduce((acc, l) => acc + Number(l.valor ?? 0), 0);
  }, [lancamentos]);

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("caixa_lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["caixa"] });
      toast.success("Lançamento removido");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Caixa</h1>
          <p className="text-muted-foreground mt-1">Despesas gerais</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="h-12 px-5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 shrink-0"
        >
          <Plus className="size-5" /> Novo
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl border bg-card">
          <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Mês atual</p>
          <p className="mt-1 text-2xl font-bold text-primary">
            {totalMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        </div>
        <div className="p-4 rounded-2xl border bg-card">
          <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Total geral</p>
          <p className="mt-1 text-2xl font-bold">
            {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : lancamentos.length === 0 ? (
        <div className="p-10 rounded-2xl border-2 border-dashed text-center">
          <Wallet className="size-12 mx-auto text-muted-foreground" />
          <h3 className="mt-3 font-semibold text-lg">Nenhum gasto registrado</h3>
          <p className="text-muted-foreground mt-1">Adicione seu primeiro lançamento de caixa.</p>
          <button
            onClick={() => setOpen(true)}
            className="mt-4 h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2"
          >
            <Plus className="size-5" /> Lançar
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {lancamentos.map((l) => (
            <li key={l.id} className="p-4 rounded-2xl border bg-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{l.descricao}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3.5" /> {formatDateBR(l.data_lancamento)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-foreground font-medium capitalize">
                      {l.categoria}
                    </span>
                    {relName(l.viveiros) && (
                      <span className="flex items-center gap-1">
                        <Warehouse className="size-3.5" /> {relName(l.viveiros)}
                      </span>
                    )}
                  </div>
                  {l.observacao && (
                    <p className="text-xs text-muted-foreground mt-1.5 truncate">{l.observacao}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <p className="font-bold text-lg text-primary">
                    {Number(l.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                  <button
                    onClick={() => {
                      if (confirm(`Remover "${l.descricao}"?`)) delMut.mutate(l.id);
                    }}
                    className="size-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                    aria-label="Remover"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <NovoLancamentoModal
          viveiros={viveiros}
          onClose={() => setOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["caixa"] });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NovoLancamentoModal({
  viveiros,
  onClose,
  onSaved,
}: {
  viveiros: Viveiro[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(todayLocal());
  const [categoria, setCategoria] = useState<string>("geral");
  const [viveiroId, setViveiroId] = useState<string>("");
  const [observacao, setObservacao] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Sessão expirada.");
      if (!descricao.trim()) throw new Error("Informe a descrição.");
      const v = Number(valor.replace(",", "."));
      if (!v || v <= 0) throw new Error("Informe um valor válido.");
      const { error } = await supabase.from("caixa_lancamentos").insert({
        user_id,
        descricao: descricao.trim(),
        valor: v,
        data_lancamento: data,
        categoria,
        viveiro_id: viveiroId || null,
        observacao: observacao.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento salvo");
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Novo gasto</h2>
          <button onClick={onClose} className="size-9 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="size-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-3"
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Descrição</label>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Salário João"
              className="mt-1 w-full h-11 px-3 rounded-xl border bg-background"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Valor (R$)</label>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ""))}
                inputMode="decimal"
                pattern="[0-9.,]*"
                placeholder="0,00"
                className="mt-1 w-full h-11 px-3 rounded-xl border bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Data</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="mt-1 w-full h-11 px-3 rounded-xl border bg-background"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Categoria</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-xl border bg-background capitalize"
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Viveiro (opcional)</label>
            <select
              value={viveiroId}
              onChange={(e) => setViveiroId(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-xl border bg-background"
            >
              <option value="">Nenhum (gasto geral)</option>
              {viveiros.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="mt-1 w-full px-3 py-2 rounded-xl border bg-background"
            />
          </div>

          <button
            type="submit"
            disabled={mut.isPending}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {mut.isPending ? "Salvando..." : "Salvar"}
          </button>
        </form>
      </div>
    </div>
  );
}
