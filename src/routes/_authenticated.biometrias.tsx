import { todayLocal } from "@/lib/date";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Activity, FlaskConical, Trash2, Calculator, TrendingUp, Calendar, Utensils } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ViveiroOption = {
  id: string;
  nome: string;
  qtd_povoada: number | null;
  data_povoamento: string | null;
  fazendas: { nome: string } | null;
};
type BiometriaRow = {
  id: string;
  viveiro_id: string;
  data_biometria: string;
  peso_medio_g: number;
  sobrevivencia_percent: number | null;
  amostras: number | null;
  viveiros: { nome: string; qtd_povoada: number | null } | null;
};
type RacaoRow = { viveiro_id: string; quantidade: number; tipo: string; data_lancamento: string };

export const Route = createFileRoute("/_authenticated/biometrias")({
  head: () => ({ meta: [{ title: "Biometrias" }] }),
  component: BiometriasPage,
});

function BiometriasPage() {
  const qc = useQueryClient();
  const [viveiroId, setViveiroId] = useState("");
  const [dataBiometria, setDataBiometria] = useState(todayLocal());
  const [modo, setModo] = useState<"direto" | "calcular">("direto");
  const [pesoMedio, setPesoMedio] = useState("");
  const [pesoTotal, setPesoTotal] = useState("");
  const [qtdCamaroes, setQtdCamaroes] = useState("");
  const [sobrevivencia, setSobrevivencia] = useState("80");
  const [amostras, setAmostras] = useState("");
  const [observacao, setObservacao] = useState("");

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, qtd_povoada, data_povoamento, status, fazendas(nome)")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ViveiroOption[];
    },
  });

  const { data: biometrias = [], isLoading } = useQuery({
    queryKey: ["biometrias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("biometrias")
        .select("id, viveiro_id, data_biometria, peso_medio_g, sobrevivencia_percent, amostras, viveiros(nome, qtd_povoada)")
        .order("data_biometria", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as BiometriaRow[];
    },
  });

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["lancamentos", "racao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("viveiro_id, quantidade, tipo, data_lancamento")
        .eq("tipo", "racao");
      if (error) throw error;
      return (data ?? []) as RacaoRow[];
    },
  });

  // Auto-calc peso médio quando estiver no modo "calcular"
  const pesoCalculado = useMemo(() => {
    const total = Number(pesoTotal || 0);
    const qtd = Number(qtdCamaroes || 0);
    if (total > 0 && qtd > 0) return total / qtd;
    return 0;
  }, [pesoTotal, qtdCamaroes]);

  const pesoFinal = modo === "calcular" ? pesoCalculado : Number(pesoMedio || 0);

  const selectedViveiro = viveiros.find((v) => v.id === viveiroId);

  const diasPovoado = useMemo(() => {
    if (!selectedViveiro?.data_povoamento) return 0;
    const ini = new Date(`${selectedViveiro.data_povoamento}T00:00:00`);
    const fim = new Date(`${dataBiometria}T00:00:00`);
    return Math.max(0, Math.round((fim.getTime() - ini.getTime()) / 86400000));
  }, [selectedViveiro?.data_povoamento, dataBiometria]);

  const racaoDiariaMedia = useMemo(() => {
    if (!viveiroId) return 0;
    const seteDias = new Date();
    seteDias.setDate(seteDias.getDate() - 7);
    const recentes = lancamentos.filter(
      (l) => l.viveiro_id === viveiroId && new Date(`${l.data_lancamento}T00:00:00`) >= seteDias,
    );
    const total = recentes.reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
    return total / 7;
  }, [lancamentos, viveiroId]);

  const ultimaBiometria = useMemo(() => {
    return biometrias
      .filter((b) => b.viveiro_id === viveiroId && b.data_biometria < dataBiometria)
      .sort((a, b) => (a.data_biometria < b.data_biometria ? 1 : -1))[0];
  }, [biometrias, viveiroId, dataBiometria]);

  const crescimentoSemanal = useMemo(() => {
    if (!ultimaBiometria || pesoFinal <= 0) return 0;
    const dias = Math.max(
      1,
      Math.round(
        (new Date(`${dataBiometria}T00:00:00`).getTime() -
          new Date(`${ultimaBiometria.data_biometria}T00:00:00`).getTime()) /
          86400000,
      ),
    );
    return ((pesoFinal - Number(ultimaBiometria.peso_medio_g)) / dias) * 7;
  }, [ultimaBiometria, pesoFinal, dataBiometria]);

  const biomassaPreview = useMemo(() => {
    const povoada = selectedViveiro?.qtd_povoada ?? 0;
    const sobreviventes = Number(sobrevivencia || 0) / 100;
    return (povoada * sobreviventes * pesoFinal) / 1000;
  }, [pesoFinal, selectedViveiro?.qtd_povoada, sobrevivencia]);

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
      if (pesoFinal <= 0) throw new Error("Informe o peso médio.");
      const amostrasFinal =
        modo === "calcular" && qtdCamaroes ? Number(qtdCamaroes) : amostras ? Number(amostras) : null;
      const { error } = await supabase.from("biometrias").insert({
        user_id: userId,
        viveiro_id: viveiroId,
        data_biometria: dataBiometria,
        peso_medio_g: pesoFinal,
        sobrevivencia_percent: sobrevivencia ? Number(sobrevivencia) : null,
        amostras: amostrasFinal,
        observacao: observacao.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Biometria salva");
      setPesoMedio("");
      setPesoTotal("");
      setQtdCamaroes("");
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
                {viveiros.map((v) => (
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

          {selectedViveiro && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl bg-muted/40 p-3">
              <MiniInfo
                icon={<Calendar className="size-3.5" />}
                label="Povoamento"
                value={
                  selectedViveiro.data_povoamento
                    ? formatDate(selectedViveiro.data_povoamento)
                    : "—"
                }
              />
              <MiniInfo
                icon={<Activity className="size-3.5" />}
                label="Pós-larvas"
                value={formatNumber(selectedViveiro.qtd_povoada ?? 0)}
              />
              <MiniInfo
                icon={<TrendingUp className="size-3.5" />}
                label="Dias povoado"
                value={`${diasPovoado}`}
              />
              <MiniInfo
                icon={<Utensils className="size-3.5" />}
                label="Ração/dia (7d)"
                value={`${formatNumber(racaoDiariaMedia)} kg`}
              />
            </div>
          )}

          <div className="flex gap-2 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setModo("direto")}
              className={`flex-1 h-9 rounded-lg text-sm font-medium transition ${
                modo === "direto" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              Peso médio direto
            </button>
            <button
              type="button"
              onClick={() => setModo("calcular")}
              className={`flex-1 h-9 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1.5 ${
                modo === "calcular" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Calculator className="size-4" /> Calcular (total ÷ qtd)
            </button>
          </div>

          {modo === "direto" ? (
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
                  placeholder="Ex: 11.6"
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
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Peso total (g)">
                  <input
                    required
                    min="0.01"
                    step="0.01"
                    type="number"
                    inputMode="decimal"
                    value={pesoTotal}
                    onChange={(e) => setPesoTotal(e.target.value)}
                    className="app-input"
                    placeholder="Ex: 464"
                  />
                </Field>
                <Field label="Qtd camarões">
                  <input
                    required
                    min="1"
                    type="number"
                    inputMode="numeric"
                    value={qtdCamaroes}
                    onChange={(e) => setQtdCamaroes(e.target.value)}
                    className="app-input"
                    placeholder="Ex: 40"
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
              </div>
              <div className="rounded-xl bg-primary/10 border border-primary/20 p-3 flex items-center justify-between">
                <span className="text-sm font-medium">Peso médio calculado</span>
                <span className="text-xl font-bold text-primary">
                  {pesoCalculado ? `${formatNumber(pesoCalculado)} g` : "—"}
                </span>
              </div>
            </div>
          )}

          <Field label="Observação">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="app-input"
              placeholder="Opcional"
            />
          </Field>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
            <div className="rounded-xl bg-muted p-4 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="size-4" /> Cresc. semanal
              </div>
              <p className="mt-1 text-2xl font-bold">
                {ultimaBiometria ? `${formatNumber(crescimentoSemanal)} g` : "—"}
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
            {biometrias.map((b) => {
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function MiniInfo({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wide">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-sm font-bold mt-0.5 truncate" style={{ wordBreak: "break-word" }}>
        {value}
      </p>
    </div>
  );
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}
