import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ClipboardList, Plus, Trash2, Utensils } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

function LancamentosPage() {
  const qc = useQueryClient();
  const [viveiroId, setViveiroId] = useState("");
  const [produtoId, setProdutoId] = useState("__new");
  const [tipo, setTipo] = useState("racao");
  const [produtoNome, setProdutoNome] = useState("Ração");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("kg");
  const [dataLancamento, setDataLancamento] = useState(new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState("");

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, status, fazendas(nome)")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ["lancamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("*, viveiros(nome)")
        .order("data_lancamento", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
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

      let finalProdutoId: string | null = produtoId === "__new" ? null : produtoId;
      let finalProdutoNome = produtoNome.trim();
      let finalTipo = tipo;
      let finalUnidade = unidade.trim() || "kg";

      if (produtoId !== "__new") {
        const produto = produtos.find((p) => p.id === produtoId);
        if (!produto) throw new Error("Produto inválido.");
        finalProdutoNome = produto.nome;
        finalTipo = produto.categoria;
        finalUnidade = produto.unidade;
      } else {
        if (!finalProdutoNome) throw new Error("Informe o produto.");
        const { data: novoProduto, error } = await supabase
          .from("produtos")
          .insert({
            user_id: userId,
            nome: finalProdutoNome,
            categoria: finalTipo,
            unidade: finalUnidade,
          })
          .select()
          .single();
        if (error) throw error;
        finalProdutoId = novoProduto.id;
      }

      const { error } = await supabase.from("lancamentos").insert({
        user_id: userId,
        viveiro_id: viveiroId,
        produto_id: finalProdutoId,
        tipo: finalTipo,
        produto_nome: finalProdutoNome,
        quantidade: Number(quantidade),
        unidade: finalUnidade,
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
      qc.invalidateQueries({ queryKey: ["produtos"] });
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

      {viveiros.length === 0 ? (
        <div className="p-8 rounded-2xl border-2 border-dashed text-center">
          <p className="font-semibold">Cadastre um viveiro primeiro</p>
          <p className="text-muted-foreground mt-1">
            Depois disso o lançamento fica em poucos cliques.
          </p>
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
                {viveiros.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.nome} · {v.fazendas?.nome ?? "Fazenda"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Produto">
              <select
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
                className="app-input"
              >
                <option value="__new">+ Novo produto</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.unidade})
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {produtoId === "__new" && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nome do produto">
                <input
                  required
                  value={produtoNome}
                  onChange={(e) => setProdutoNome(e.target.value)}
                  className="app-input"
                  placeholder="Ex: Ração 35%"
                />
              </Field>
              <Field label="Tipo">
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="app-input"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unidade">
                <input
                  required
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  className="app-input"
                  placeholder="kg"
                />
              </Field>
            </div>
          )}

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
      )}

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
            {lancamentos.map((l: any) => (
              <li
                key={l.id}
                className="rounded-2xl bg-card border p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="font-semibold">
                    {l.produto_nome} · {formatNumber(l.quantidade)} {l.unidade}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(l.data_lancamento)} · {l.viveiros?.nome ?? "Viveiro"}
                  </p>
                </div>
                <button
                  onClick={() => delMut.mutate(l.id)}
                  className="size-10 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                  aria-label="Remover lançamento"
                >
                  <Trash2 className="size-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
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

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}
