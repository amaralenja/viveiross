import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Package, Trash2, X, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos" }] }),
  component: ProdutosPage,
});

type Produto = {
  id: string;
  nome: string;
  categoria: string;
  unidade: string;
  preco_unidade: number | null;
};

function formatBRL(v: number | null | undefined) {
  if (v == null) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ProdutosPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);

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

  const produtos = produtosQuery.data ?? [];
  const isLoading = produtosQuery.isLoading;

  const delMut = useMutation({
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Produtos</h1>
          <p className="text-muted-foreground mt-1">{produtos.length} cadastrados</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="h-12 px-5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 shrink-0"
        >
          <Plus className="size-5" /> Novo
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : produtos.length === 0 ? (
        <div className="p-10 rounded-2xl border-2 border-dashed text-center">
          <Package className="size-12 mx-auto text-muted-foreground" />
          <h3 className="mt-3 font-semibold text-lg">Nenhum produto ainda</h3>
          <p className="text-muted-foreground mt-1">Cadastre rações e outros insumos.</p>
          <button
            onClick={() => setOpen(true)}
            className="mt-4 h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2"
          >
            <Plus className="size-5" /> Cadastrar
          </button>
        </div>
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
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setEditando(p)}
                  className="size-10 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary flex items-center justify-center"
                  aria-label="Editar"
                >
                  <Pencil className="size-5" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Remover "${p.nome}"?`)) delMut.mutate(p.id);
                  }}
                  className="size-10 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                  aria-label="Remover"
                >
                  <Trash2 className="size-5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(open || editando) && (
        <ProdutoModal
          produto={editando}
          onClose={() => {
            setOpen(false);
            setEditando(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["produtos"] });
            setOpen(false);
            setEditando(null);
          }}
        />
      )}
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
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">{produto ? "Editar produto" : "Novo produto"}</h2>
          <button
            onClick={onClose}
            className="size-9 rounded-lg hover:bg-muted flex items-center justify-center"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">Nome</label>
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Ração 35%"
              className="w-full h-12 px-4 rounded-xl border bg-background text-base"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Categoria</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border bg-background text-base"
            >
              <option value="racao">Ração</option>
              <option value="probiotico">Probiótico</option>
              <option value="medicamento">Medicamento</option>
              <option value="fertilizante">Fertilizante</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1.5">Unidade</label>
              <input
                required
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="kg"
                className="w-full h-12 px-4 rounded-xl border bg-background text-base"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Preço por {unidade || "un"} (R$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                placeholder="0,00"
                className="w-full h-12 px-4 rounded-xl border bg-background text-base"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </form>
      </div>
    </div>
  );
}
