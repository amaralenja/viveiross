import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Warehouse, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/viveiros")({
  head: () => ({ meta: [{ title: "Viveiros" }] }),
  component: ViveirosPage,
});

function ViveirosPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: fazendas } = useQuery({
    queryKey: ["fazendas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fazendas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: viveiros, isLoading } = useQuery({
    queryKey: ["viveiros"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("*, fazendas(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("viveiros").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["viveiros"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Viveiro removido");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Viveiros</h1>
          <p className="text-muted-foreground mt-1">{viveiros?.length ?? 0} cadastrados</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="h-12 px-5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90"
        >
          <Plus className="size-5" /> Novo
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : viveiros?.length === 0 ? (
        <EmptyState onAdd={() => setOpen(true)} />
      ) : (
        <ul className="space-y-3">
          {viveiros?.map((v: any) => (
            <li
              key={v.id}
              className="p-5 rounded-2xl bg-card border flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-xl bg-accent text-accent-foreground flex items-center justify-center">
                  <Warehouse className="size-6" />
                </div>
                <div>
                  <p className="font-semibold text-lg">{v.nome}</p>
                  <p className="text-sm text-muted-foreground">
                    {v.fazendas?.nome ?? "Sem fazenda"} ·{" "}
                    {v.data_povoamento
                      ? `${diasDeCultivo(v.data_povoamento)} dias de cultivo`
                      : "Sem povoamento"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Remover "${v.nome}"?`)) delMut.mutate(v.id);
                }}
                className="size-10 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
              >
                <Trash2 className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <NovoViveiroModal
          fazendas={fazendas ?? []}
          onClose={() => setOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["viveiros"] });
            qc.invalidateQueries({ queryKey: ["fazendas"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function diasDeCultivo(data: string) {
  const d = new Date(data);
  const hoje = new Date();
  return Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="p-10 rounded-2xl border-2 border-dashed text-center">
      <Warehouse className="size-12 mx-auto text-muted-foreground" />
      <h3 className="mt-3 font-semibold text-lg">Nenhum viveiro ainda</h3>
      <p className="text-muted-foreground mt-1">Cadastre seu primeiro viveiro pra começar.</p>
      <button
        onClick={onAdd}
        className="mt-4 h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2"
      >
        <Plus className="size-5" /> Cadastrar
      </button>
    </div>
  );
}

function NovoViveiroModal({
  fazendas,
  onClose,
  onSaved,
}: {
  fazendas: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [fazendaId, setFazendaId] = useState(fazendas[0]?.id ?? "");
  const [novaFazenda, setNovaFazenda] = useState("");
  const [novaCidade, setNovaCidade] = useState("");
  const [dataPovoamento, setDataPovoamento] = useState("");
  const [qtdPovoada, setQtdPovoada] = useState("");
  const [loading, setLoading] = useState(false);
  const criandoFazenda = fazendas.length === 0 || fazendaId === "__new";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Sem sessão");

      let usarFazendaId = fazendaId;
      if (criandoFazenda) {
        const { data, error } = await supabase
          .from("fazendas")
          .insert({ nome: novaFazenda, cidade: novaCidade || null, user_id })
          .select()
          .single();
        if (error) throw error;
        usarFazendaId = data.id;
      }

      const { error } = await supabase.from("viveiros").insert({
        user_id,
        fazenda_id: usarFazendaId,
        nome,
        data_povoamento: dataPovoamento || null,
        qtd_povoada: qtdPovoada ? Number(qtdPovoada) : null,
      });
      if (error) throw error;
      toast.success("Viveiro criado!");
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">Novo viveiro</h2>
          <button onClick={onClose} className="size-9 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Nome do viveiro">
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Viveiro 1"
              className="input"
            />
          </Field>

          <Field label="Fazenda">
            {fazendas.length > 0 && (
              <select
                value={fazendaId}
                onChange={(e) => setFazendaId(e.target.value)}
                className="input"
              >
                {fazendas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
                <option value="__new">+ Nova fazenda</option>
              </select>
            )}
            {criandoFazenda && (
              <div className="space-y-2 mt-2">
                <input
                  required
                  value={novaFazenda}
                  onChange={(e) => setNovaFazenda(e.target.value)}
                  placeholder="Nome da fazenda"
                  className="input"
                />
                <input
                  value={novaCidade}
                  onChange={(e) => setNovaCidade(e.target.value)}
                  placeholder="Cidade (opcional)"
                  className="input"
                />
              </div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Povoamento">
              <input
                type="date"
                value={dataPovoamento}
                onChange={(e) => setDataPovoamento(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Quantidade">
              <input
                type="number"
                inputMode="numeric"
                value={qtdPovoada}
                onChange={(e) => setQtdPovoada(e.target.value)}
                placeholder="0"
                className="input"
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

        <style>{`.input { width:100%; height:48px; padding: 0 16px; border-radius: 12px; border:1px solid var(--color-border); background: var(--color-background); font-size:16px; outline:none; }
        .input:focus { box-shadow: 0 0 0 2px var(--color-ring); }`}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
