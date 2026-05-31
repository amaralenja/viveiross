import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Activity, FlaskConical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/biometrias")({
  head: () => ({ meta: [{ title: "Biometrias" }] }),
  component: BiometriasPage,
});

function BiometriasPage() {
  const qc = useQueryClient();
  const [viveiroId, setViveiroId] = useState("");
  const [dataBiometria, setDataBiometria] = useState(new Date().toISOString().slice(0, 10));
  const [pesoMedio, setPesoMedio] = useState("");
  const [sobrevivencia, setSobrevivencia] = useState("80");
  const [amostras, setAmostras] = useState("");
  const [observacao, setObservacao] = useState("");

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, qtd_povoada, status, fazendas(nome)")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: biometrias = [], isLoading } = useQuery({
    queryKey: ["biometrias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("biometrias")
        .select("*, viveiros(nome, qtd_povoada)")
        .order("data_biometria", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["lancamentos", "racao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("viveiro_id, quantidade, tipo")
        .eq("tipo", "racao");
      if (error) throw error;
      return data;
    },
  });

  const selectedViveiro = viveiros.find((v) => v.id === viveiroId);
  const biomassaPreview = useMemo(() => {
    const povoada = selectedViveiro?.qtd_povoada ?? 0;
    const peso = Number(pesoMedio || 0);
    const sobreviventes = Number(sobrevivencia || 0) / 100;
    return (povoada * sobreviventes * peso) / 1000;
  }, [pesoMedio, selectedViveiro?.qtd_povoada, sobrevivencia]);

  const fcaPreview = useMemo(() => {
    const racao = lancamentos
      .filter((l) => l.viveiro_id === viveiroId)
      .reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
    return biomassaPreview > 0 ? racao / biomassaPreview : 0;
  }, [biomassaPreview, lancamentos, viveiroId]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada. Entre novamente.");
      if (!viveiroId) throw new Error("Escolha um viveiro.");
      const { error } = await supabase.from("biometrias").insert({
        user_id: userId,
        viveiro_id: viveiroId,
        data_biometria: dataBiometria,
        peso_medio_g: Number(pesoMedio),
        sobrevivencia_percent: sobrevivencia ? Number(sobrevivencia) : null,
        amostras: amostras ? Number(amostras) : null,
        observacao: observacao.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Biometria salva");
      setPesoMedio("");
      setAmostras("");
      setObservacao("");
      qc.invalidateQueries({ queryKey: ["biometrias"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("biometrias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Biometria removida");
      qc.invalidateQueries({ queryKey: ["biometrias"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Biometrias</h1>
        <p className="text-muted-foreground mt-1">Peso médio, biomassa e FCA estimado</p>
      </div>

      {viveiros.length === 0 ? (
        <div className="p-8 rounded-2xl border-2 border-dashed text-center">
          <p className="font-semibold">Cadastre um viveiro primeiro</p>
          <p className="text-muted-foreground mt-1">
            A biometria precisa estar ligada a um viveiro.
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
            <Field label="Data">
              <input
                required
                type="date"
                value={dataBiometria}
                onChange={(e) => setDataBiometria(e.target.value)}
                className="app-input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Peso médio (g)">
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                inputMode="decimal"
                value={pesoMedio}
                onChange={(e) => setPesoMedio(e.target.value)}
                className="app-input"
                placeholder="Ex: 8.5"
              />
            </Field>
            <Field label="Sobrevivência (%)">
              <input
                min="0"
                max="100"
                step="0.01"
                type="number"
                inputMode="decimal"
                value={sobrevivencia}
                onChange={(e) => setSobrevivencia(e.target.value)}
                className="app-input"
                placeholder="80"
              />
            </Field>
            <Field label="Amostras">
              <input
                min="1"
                type="number"
                inputMode="numeric"
                value={amostras}
                onChange={(e) => setAmostras(e.target.value)}
                className="app-input"
                placeholder="Opcional"
              />
            </Field>
          </div>

          <Field label="Observação">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="app-input"
              placeholder="Opcional"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-accent p-4">
              <div className="flex items-center gap-2 text-sm text-accent-foreground/80">
                <Activity className="size-4" /> Biomassa
              </div>
              <p className="mt-1 text-2xl font-bold">{formatNumber(biomassaPreview)} kg</p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FlaskConical className="size-4" /> FCA estimado
              </div>
              <p className="mt-1 text-2xl font-bold">
                {fcaPreview ? formatNumber(fcaPreview) : "—"}
              </p>
            </div>
          </div>

          <button
            disabled={saveMut.isPending}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMut.isPending ? "Salvando..." : "Salvar biometria"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Últimas biometrias</h2>
        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : biometrias.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
            Nenhuma biometria ainda.
          </p>
        ) : (
          <ul className="space-y-3">
            {biometrias.map((b: any) => {
              const povoada = b.viveiros?.qtd_povoada ?? 0;
              const biomassa =
                (povoada * ((b.sobrevivencia_percent ?? 0) / 100) * Number(b.peso_medio_g ?? 0)) /
                1000;
              return (
                <li
                  key={b.id}
                  className="rounded-2xl bg-card border p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-semibold">
                      {b.viveiros?.nome ?? "Viveiro"} · {formatNumber(b.peso_medio_g)} g
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(b.data_biometria)} · biomassa {formatNumber(biomassa)} kg
                    </p>
                  </div>
                  <button
                    onClick={() => delMut.mutate(b.id)}
                    className="size-10 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                    aria-label="Remover biometria"
                  >
                    <Trash2 className="size-5" />
                  </button>
                </li>
              );
            })}
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
