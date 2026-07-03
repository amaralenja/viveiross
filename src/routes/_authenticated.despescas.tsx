import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Fish, Check, Trash2, Pencil, X } from "lucide-react";
import { todayLocal } from "@/lib/date";
import { formatBRL, formatDate, formatNumber } from "@/lib/relatorios-calc";

export const Route = createFileRoute("/_authenticated/despescas")({
  component: DespescasPage,
});

type Despesca = {
  id: string;
  viveiro_id: string | null;
  data_despesca: string;
  quantidade_kg: number;
  preco_kg: number;
  valor_total: number;
  observacao: string | null;
  status: string;
  caixa_lancamento_id: string | null;
};

function DespescasPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [viveiroId, setViveiroId] = useState<string>("todos");
  const [data, setData] = useState(todayLocal());
  const [qtd, setQtd] = useState("");
  const [preco, setPreco] = useState("");
  const [valorOverride, setValorOverride] = useState("");
  const [obs, setObs] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros-min", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome")
        .eq("user_id", user!.id)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: despescas = [] } = useQuery({
    queryKey: ["despescas", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("despescas")
        .select("*")
        .eq("user_id", user!.id)
        .order("data_despesca", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Despesca[];
    },
  });

  const qtdN = Number(qtd.replace(",", ".")) || 0;
  const precoN = Number(preco.replace(",", ".")) || 0;
  const valorCalc = qtdN * precoN;
  const valorFinal = valorOverride ? Number(valorOverride.replace(",", ".")) || 0 : valorCalc;

  function reset() {
    setEditId(null);
    setViveiroId("todos");
    setData(todayLocal());
    setQtd("");
    setPreco("");
    setValorOverride("");
    setObs("");
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sem usuário");
      if (qtdN <= 0 || precoN <= 0) throw new Error("Preencha quantidade e preço");
      const payload = {
        user_id: user.id,
        viveiro_id: viveiroId === "todos" ? null : viveiroId,
        data_despesca: data,
        quantidade_kg: qtdN,
        preco_kg: precoN,
        valor_total: valorFinal,
        observacao: obs || null,
      };
      if (editId) {
        const { error } = await (supabase as any).from("despescas").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("despescas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Despesca atualizada" : "Despesca registrada");
      reset();
      qc.invalidateQueries({ queryKey: ["despescas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aprovarMut = useMutation({
    mutationFn: async (d: Despesca) => {
      if (!user) throw new Error("Sem usuário");
      const nomeViv = d.viveiro_id ? viveiros.find((v) => v.id === d.viveiro_id)?.nome ?? "" : "todos os viveiros";
      const { data: lanc, error } = await supabase
        .from("caixa_lancamentos")
        .insert({
          user_id: user.id,
          viveiro_id: d.viveiro_id,
          data_lancamento: d.data_despesca,
          descricao: `Venda de camarão - ${nomeViv} (${d.quantidade_kg} kg)`,
          categoria: "venda",
          tipo: "receita",
          valor: d.valor_total,
          quantidade: d.quantidade_kg,
          unidade: "kg",
          observacao: d.observacao,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: upErr } = await supabase
        .from("despescas" as never)
        .update({ status: "aprovada", caixa_lancamento_id: lanc.id })
        .eq("id", d.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      toast.success("Despesca aprovada e lançada no caixa");
      qc.invalidateQueries({ queryKey: ["despescas"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (d: Despesca) => {
      if (d.caixa_lancamento_id) {
        await supabase.from("caixa_lancamentos").delete().eq("id", d.caixa_lancamento_id);
      }
      const { error } = await (supabase as any).from("despescas").delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Despesca removida");
      qc.invalidateQueries({ queryKey: ["despescas"] });
      qc.invalidateQueries({ queryKey: ["caixa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totais = useMemo(() => {
    const aprov = despescas.filter((d) => d.status === "aprovada");
    return {
      totalKg: aprov.reduce((s, d) => s + Number(d.quantidade_kg ?? 0), 0),
      totalValor: aprov.reduce((s, d) => s + Number(d.valor_total ?? 0), 0),
      pendentes: despescas.filter((d) => d.status !== "aprovada").length,
    };
  }, [despescas]);

  function edit(d: Despesca) {
    setEditId(d.id);
    setViveiroId(d.viveiro_id ?? "todos");
    setData(d.data_despesca);
    setQtd(String(d.quantidade_kg));
    setPreco(String(d.preco_kg));
    setValorOverride(String(d.valor_total));
    setObs(d.observacao ?? "");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Fish className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Despesca</h1>
          <p className="text-sm text-muted-foreground">Registro de vendas de camarão</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Total vendido</div>
          <div className="font-bold">{formatNumber(totais.totalKg)} kg</div>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Receita</div>
          <div className="font-bold text-emerald-600">{formatBRL(totais.totalValor)}</div>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Pendentes</div>
          <div className="font-bold">{totais.pendentes}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="font-semibold">{editId ? "Editar despesca" : "Nova despesca"}</div>

        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 text-sm">
            <span className="text-muted-foreground">Viveiro</span>
            <select
              value={viveiroId}
              onChange={(e) => setViveiroId(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border bg-transparent px-2"
            >
              <option value="todos">Todos os viveiros</option>
              {viveiros.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="text-muted-foreground">Data</span>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border bg-transparent px-2"
            />
          </label>

          <label className="text-sm">
            <span className="text-muted-foreground">Quantidade (kg)</span>
            <input
              inputMode="decimal"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              placeholder="0"
              className="mt-1 w-full h-10 rounded-md border bg-transparent px-2"
            />
          </label>

          <label className="text-sm">
            <span className="text-muted-foreground">Preço por kg (R$)</span>
            <input
              inputMode="decimal"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder="0,00"
              className="mt-1 w-full h-10 rounded-md border bg-transparent px-2"
            />
          </label>

          <label className="text-sm">
            <span className="text-muted-foreground">Valor total (editável)</span>
            <input
              inputMode="decimal"
              value={valorOverride}
              onChange={(e) => setValorOverride(e.target.value)}
              placeholder={formatBRL(valorCalc)}
              className="mt-1 w-full h-10 rounded-md border bg-transparent px-2 font-semibold"
            />
          </label>

          <label className="col-span-2 text-sm">
            <span className="text-muted-foreground">Observação</span>
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border bg-transparent px-2"
            />
          </label>
        </div>

        <div className="rounded-lg bg-muted/50 p-2 text-sm">
          Total calculado: <b>{formatBRL(valorFinal)}</b>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            {editId ? "Atualizar" : "Salvar despesca"}
          </button>
          {editId && (
            <button onClick={reset} className="h-11 px-4 rounded-lg border">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-semibold">Histórico</div>
        {despescas.length === 0 && (
          <div className="text-sm text-muted-foreground rounded-xl border bg-card p-4">
            Nenhuma despesca registrada.
          </div>
        )}
        {despescas.map((d) => {
          const nomeViv = d.viveiro_id ? viveiros.find((v) => v.id === d.viveiro_id)?.nome : "Todos";
          const aprov = d.status === "aprovada";
          return (
            <div key={d.id} className="rounded-xl border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{nomeViv ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(d.data_despesca)} · {formatNumber(d.quantidade_kg)} kg × {formatBRL(d.preco_kg)}
                  </div>
                  {d.observacao && <div className="text-xs text-muted-foreground mt-0.5">{d.observacao}</div>}
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-600">{formatBRL(d.valor_total)}</div>
                  <span
                    className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      aprov ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {aprov ? "Aprovada" : "Pendente"}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                {!aprov && (
                  <button
                    onClick={() => aprovarMut.mutate(d)}
                    disabled={aprovarMut.isPending}
                    className="flex-1 h-9 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-1"
                  >
                    <Check className="size-4" /> Aprovar venda
                  </button>
                )}
                <button onClick={() => edit(d)} className="h-9 px-3 rounded-lg border text-sm flex items-center gap-1">
                  <Pencil className="size-3.5" /> Editar
                </button>
                <button
                  onClick={() => {
                    if (confirm("Remover essa despesca?")) deleteMut.mutate(d);
                  }}
                  className="h-9 px-3 rounded-lg border text-sm text-destructive flex items-center gap-1"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
