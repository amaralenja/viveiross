import { todayLocal } from "@/lib/date";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Activity, Trash2, TrendingUp, Calendar, Utensils, Users, Scale, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ViveiroOption = {
  id: string;
  nome: string;
  qtd_povoada: number | null;
  data_povoamento: string | null;
};
type BiometriaRow = {
  id: string;
  viveiro_id: string;
  data_biometria: string;
  peso_medio_g: number;
  amostras: number | null;
  crescimento_semanal_g: number | null;
  viveiros: { nome: string; qtd_povoada: number | null; data_povoamento: string | null } | null;
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
  const [pesoTotal, setPesoTotal] = useState("");
  const [qtdCamaroes, setQtdCamaroes] = useState("");
  const [crescimentoManual, setCrescimentoManual] = useState("");

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, qtd_povoada, data_povoamento, status")
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
        .select(
          "id, viveiro_id, data_biometria, peso_medio_g, amostras, crescimento_semanal_g, viveiros(nome, qtd_povoada, data_povoamento)",
        )
        .order("data_biometria", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as BiometriaRow[];
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

  const pesoMedio = useMemo(() => {
    const t = Number(pesoTotal || 0);
    const q = Number(qtdCamaroes || 0);
    return t > 0 && q > 0 ? t / q : 0;
  }, [pesoTotal, qtdCamaroes]);

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
    if (recentes.length === 0) return 0;
    const total = recentes.reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
    const diasComLanc = new Set(recentes.map((l) => l.data_lancamento)).size;
    return total / Math.max(1, diasComLanc);
  }, [lancamentos, viveiroId]);

  const ultimaBiometria = useMemo(() => {
    return biometrias
      .filter((b) => b.viveiro_id === viveiroId && b.data_biometria < dataBiometria)
      .sort((a, b) => (a.data_biometria < b.data_biometria ? 1 : -1))[0];
  }, [biometrias, viveiroId, dataBiometria]);

  const crescimentoSemanal = useMemo(() => {
    if (!ultimaBiometria || pesoMedio <= 0) return 0;
    const dias = Math.max(
      1,
      Math.round(
        (new Date(`${dataBiometria}T00:00:00`).getTime() -
          new Date(`${ultimaBiometria.data_biometria}T00:00:00`).getTime()) /
          86400000,
      ),
    );
    return ((pesoMedio - Number(ultimaBiometria.peso_medio_g)) / dias) * 7;
  }, [ultimaBiometria, pesoMedio, dataBiometria]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada. Entre novamente.");
      if (!viveiroId) throw new Error("Escolha um viveiro.");
      if (pesoMedio <= 0) throw new Error("Informe peso total e quantidade.");
      const { error } = await supabase.from("biometrias").insert({
        user_id: userId,
        viveiro_id: viveiroId,
        data_biometria: dataBiometria,
        peso_medio_g: pesoMedio,
        amostras: Number(qtdCamaroes),
        crescimento_semanal_g: crescimentoManual ? Number(crescimentoManual) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Biometria salva");
      setPesoTotal("");
      setQtdCamaroes("");
      setCrescimentoManual("");
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

  const [editing, setEditing] = useState<BiometriaRow | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Biometrias</h1>
        <p className="text-muted-foreground mt-1">Peso médio e crescimento por viveiro</p>
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
                value={dataBiometria}
                onChange={(e) => setDataBiometria(e.target.value)}
                className="app-input"
              />
            </Field>
          </div>

          {selectedViveiro && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl bg-muted/40 p-3">
              <MiniInfo
                icon={<Users className="size-3.5" />}
                label="Povoamento"
                value={formatNumber(selectedViveiro.qtd_povoada ?? 0)}
              />
              <MiniInfo
                icon={<Calendar className="size-3.5" />}
                label="Dias povoado"
                value={`${diasPovoado}`}
              />
              <MiniInfo
                icon={<Utensils className="size-3.5" />}
                label="Ração/dia (7d)"
                value={`${formatNumber(racaoDiariaMedia)} kg`}
              />
              <MiniInfo
                icon={<Activity className="size-3.5" />}
                label="Último peso"
                value={
                  ultimaBiometria ? `${formatNumber(ultimaBiometria.peso_medio_g)} g` : "—"
                }
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Qtd camarões (un)">
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-4">
              <div className="flex items-center gap-2 text-sm text-primary/80">
                <Scale className="size-4" /> Peso médio
              </div>
              <p className="mt-1 text-2xl font-bold text-primary">
                {pesoMedio ? `${formatNumber(pesoMedio)} g` : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="size-4" /> Cresc. semanal
              </div>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={crescimentoManual}
                onChange={(e) => setCrescimentoManual(e.target.value)}
                placeholder={
                  ultimaBiometria && pesoMedio > 0
                    ? `Auto: ${formatNumber(crescimentoSemanal)} g`
                    : "Ex: 1.8"
                }
                className="mt-1 w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/60"
              />
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {crescimentoManual ? "Manual (g)" : "Deixe vazio para calcular automático"}
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

      <HistoricoBiometrias
        biometrias={biometrias}
        lancamentos={lancamentos}
        isLoading={isLoading}
        onDelete={(id) => delMut.mutate(id)}
        onEdit={(b) => setEditing(b)}
      />

      {editing && (
        <EditBiometriaModal
          biometria={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["biometrias"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
          }}
        />
      )}
    </div>
  );
}

function EditBiometriaModal({
  biometria,
  onClose,
  onSaved,
}: {
  biometria: BiometriaRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState(biometria.data_biometria);
  const [qtd, setQtd] = useState(String(biometria.amostras ?? ""));
  const [pesoTotal, setPesoTotal] = useState(
    biometria.amostras && biometria.peso_medio_g
      ? String(Number(biometria.amostras) * Number(biometria.peso_medio_g))
      : "",
  );
  const [cresc, setCresc] = useState(
    biometria.crescimento_semanal_g != null ? String(biometria.crescimento_semanal_g) : "",
  );

  const pesoMedio = useMemo(() => {
    const t = Number(pesoTotal || 0);
    const q = Number(qtd || 0);
    return t > 0 && q > 0 ? t / q : 0;
  }, [pesoTotal, qtd]);

  const mut = useMutation({
    mutationFn: async () => {
      if (pesoMedio <= 0) throw new Error("Informe peso total e quantidade.");
      const { error } = await supabase
        .from("biometrias")
        .update({
          data_biometria: data,
          peso_medio_g: pesoMedio,
          amostras: Number(qtd),
          crescimento_semanal_g: cresc ? Number(cresc) : null,
        })
        .eq("id", biometria.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Biometria atualizada");
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
          <h3 className="font-bold">Editar biometria</h3>
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
          className="p-4 space-y-4"
        >
          <Field label="Data">
            <input
              required
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="app-input"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qtd camarões (un)">
              <input
                required
                min="1"
                type="number"
                value={qtd}
                onChange={(e) => setQtd(e.target.value)}
                className="app-input"
              />
            </Field>
            <Field label="Peso total (g)">
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={pesoTotal}
                onChange={(e) => setPesoTotal(e.target.value)}
                className="app-input"
              />
            </Field>
          </div>
          <Field label="Crescimento semanal (g) — opcional">
            <input
              type="number"
              step="0.01"
              value={cresc}
              onChange={(e) => setCresc(e.target.value)}
              placeholder="Deixe vazio para calcular automático"
              className="app-input"
            />
          </Field>
          <div className="rounded-xl bg-primary/10 border border-primary/20 p-3">
            <p className="text-xs text-primary/80">Peso médio</p>
            <p className="text-xl font-bold text-primary">
              {pesoMedio ? `${formatNumber(pesoMedio)} g` : "—"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border font-semibold"
            >
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

type PeriodoKey = "hoje" | "ontem" | "7d" | "10d" | "30d" | "tudo" | "custom";

function HistoricoBiometrias({
  biometrias,
  lancamentos,
  isLoading,
  onDelete,
  onEdit,
}: {
  biometrias: BiometriaRow[];
  lancamentos: RacaoRow[];
  isLoading: boolean;
  onDelete: (id: string) => void;
  onEdit: (b: BiometriaRow) => void;
}) {
  const [periodo, setPeriodo] = useState<PeriodoKey>("tudo");
  const [de, setDe] = useState(todayLocal());
  const [ate, setAte] = useState(todayLocal());

  const filtradas = useMemo(() => {
    const hoje = todayLocal();
    const ontemDate = new Date();
    ontemDate.setDate(ontemDate.getDate() - 1);
    const ontem = ontemDate.toISOString().slice(0, 10);

    let inicio = "0000-01-01";
    let fim = "9999-12-31";

    if (periodo === "hoje") {
      inicio = hoje;
      fim = hoje;
    } else if (periodo === "ontem") {
      inicio = ontem;
      fim = ontem;
    } else if (periodo === "7d" || periodo === "10d" || periodo === "30d") {
      const dias = periodo === "7d" ? 7 : periodo === "10d" ? 10 : 30;
      const d = new Date();
      d.setDate(d.getDate() - (dias - 1));
      inicio = d.toISOString().slice(0, 10);
      fim = hoje;
    } else if (periodo === "custom") {
      inicio = de;
      fim = ate;
    }

    return biometrias.filter((b) => b.data_biometria >= inicio && b.data_biometria <= fim);
  }, [biometrias, periodo, de, ate]);

  const porViveiro = useMemo(() => {
    const map = new Map<
      string,
      { nome: string; qtd_povoada: number; data_povoamento: string | null; rows: BiometriaRow[] }
    >();
    for (const b of filtradas) {
      const key = b.viveiro_id;
      const prev = map.get(key);
      if (prev) prev.rows.push(b);
      else
        map.set(key, {
          nome: b.viveiros?.nome ?? "Viveiro",
          qtd_povoada: b.viveiros?.qtd_povoada ?? 0,
          data_povoamento: b.viveiros?.data_povoamento ?? null,
          rows: [b],
        });
    }
    return Array.from(map.values()).map((g) => ({
      ...g,
      rows: g.rows.sort((a, b) => (a.data_biometria < b.data_biometria ? 1 : -1)),
    }));
  }, [filtradas]);

  const racaoDiariaPorViveiro = useMemo(() => {
    const map = new Map<string, number>();
    const seteDias = new Date();
    seteDias.setDate(seteDias.getDate() - 7);
    for (const l of lancamentos) {
      if (new Date(`${l.data_lancamento}T00:00:00`) < seteDias) continue;
      map.set(l.viveiro_id, (map.get(l.viveiro_id) ?? 0) + Number(l.quantidade ?? 0));
    }
    return map;
  }, [lancamentos]);

  const periodos: { key: PeriodoKey; label: string }[] = [
    { key: "hoje", label: "Hoje" },
    { key: "ontem", label: "Ontem" },
    { key: "7d", label: "7 dias" },
    { key: "10d", label: "10 dias" },
    { key: "30d", label: "30 dias" },
    { key: "tudo", label: "Tudo" },
    { key: "custom", label: "Personalizado" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Histórico por viveiro</h2>
        <span className="text-sm text-muted-foreground">{filtradas.length} biometrias</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {periodos.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriodo(p.key)}
            className={`shrink-0 h-9 px-3 rounded-lg text-sm font-medium border transition ${
              periodo === p.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card hover:bg-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {periodo === "custom" && (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3">
          <label className="text-xs font-medium">
            De
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="app-input mt-1"
            />
          </label>
          <label className="text-xs font-medium">
            Até
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="app-input mt-1"
            />
          </label>
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : porViveiro.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
          Nenhuma biometria neste período.
        </p>
      ) : (
        <div className="space-y-4">
          {porViveiro.map((grupo) => {
            const ult = grupo.rows[0];
            const ant = grupo.rows[1];
            let cresc = 0;
            if (ult?.crescimento_semanal_g != null) {
              cresc = Number(ult.crescimento_semanal_g);
            } else if (ant) {
              const dias = Math.max(
                1,
                Math.round(
                  (new Date(`${ult.data_biometria}T00:00:00`).getTime() -
                    new Date(`${ant.data_biometria}T00:00:00`).getTime()) /
                    86400000,
                ),
              );
              cresc = ((Number(ult.peso_medio_g) - Number(ant.peso_medio_g)) / dias) * 7;
            }
            const viveiroId = grupo.rows[0].viveiro_id;
            const racaoDia = (racaoDiariaPorViveiro.get(viveiroId) ?? 0) / 7;
            const diasPov = grupo.data_povoamento
              ? Math.max(
                  0,
                  Math.round(
                    (Date.now() - new Date(`${grupo.data_povoamento}T00:00:00`).getTime()) /
                      86400000,
                  ),
                )
              : 0;

            return (
              <div key={viveiroId} className="rounded-2xl bg-card border overflow-hidden">
                <div className="p-4 border-b bg-muted/30 space-y-3">
                  <p className="font-bold truncate">{grupo.nome}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MiniInfo
                      icon={<Users className="size-3.5" />}
                      label="Povoamento"
                      value={formatNumber(grupo.qtd_povoada)}
                    />
                    <MiniInfo
                      icon={<Utensils className="size-3.5" />}
                      label="Ração/dia"
                      value={`${formatNumber(racaoDia)} kg`}
                    />
                    <MiniInfo
                      icon={<Calendar className="size-3.5" />}
                      label="Dias povoado"
                      value={`${diasPov}`}
                    />
                    <MiniInfo
                      icon={<TrendingUp className="size-3.5" />}
                      label="Cresc. semanal"
                      value={ant ? `${formatNumber(cresc)} g` : "—"}
                    />
                  </div>
                </div>

                <ul className="divide-y">
                  {grupo.rows.map((b) => {
                    const qtd = b.amostras ?? 0;
                    const pesoTotal = qtd * Number(b.peso_medio_g ?? 0);
                    return (
                      <li
                        key={b.id}
                        className="p-3 flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0 flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <span className="font-medium">{formatDate(b.data_biometria)}</span>
                          <span>
                            <span className="text-muted-foreground">Peso: </span>
                            <span className="font-semibold">
                              {formatNumber(b.peso_medio_g)} g
                            </span>
                          </span>
                          <span>
                            <span className="text-muted-foreground">Qtd: </span>
                            <span className="font-semibold">{formatNumber(qtd)} un</span>
                          </span>
                          <span>
                            <span className="text-muted-foreground">Total: </span>
                            <span className="font-semibold">{formatNumber(pesoTotal)} g</span>
                          </span>
                          {b.crescimento_semanal_g != null && (
                            <span>
                              <span className="text-muted-foreground">Cresc: </span>
                              <span className="font-semibold">
                                {formatNumber(b.crescimento_semanal_g)} g/sem
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => onEdit(b)}
                            className="size-9 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary flex items-center justify-center"
                            aria-label="Editar biometria"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => onDelete(b.id)}
                            className="size-9 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                            aria-label="Remover biometria"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
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
