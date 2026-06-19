import { todayLocal } from "@/lib/date";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { FileDown, FileText, Printer, Scale, Utensils, DollarSign, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ViveiroRelatorio = {
  id: string;
  nome: string;
  qtd_povoada: number | null;
  data_povoamento: string | null;
  status: string;
  fornecedor: string | null;
  fazendas: { nome: string } | null;
};
type LancamentoRelatorio = {
  id: string;
  viveiro_id: string;
  produto_nome: string;
  quantidade: number;
  unidade: string;
  tipo: string;
  custo_total: number | null;
  preco_unidade: number | null;
  data_lancamento: string;
};
type BiometriaRelatorio = {
  id: string;
  viveiro_id: string;
  data_biometria: string;
  peso_medio_g: number;
  amostras: number | null;
  sobrevivencia_percent: number | null;
};

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const qc = useQueryClient();
  const [printOnlyId, setPrintOnlyId] = useState<string | null>(null);
  const [editLanc, setEditLanc] = useState<LancamentoRelatorio | null>(null);
  const [editBio, setEditBio] = useState<BiometriaRelatorio | null>(null);

  const { data: viveiros = [] } = useQuery({
    queryKey: ["viveiros", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viveiros")
        .select("id, nome, qtd_povoada, data_povoamento, status, fornecedor, fazendas(nome)")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as ViveiroRelatorio[];
    },
  });

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["lancamentos", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("id, viveiro_id, produto_nome, quantidade, unidade, tipo, custo_total, preco_unidade, data_lancamento")
        .order("data_lancamento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LancamentoRelatorio[];
    },
  });

  const { data: biometrias = [] } = useQuery({
    queryKey: ["biometrias", "relatorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("biometrias")
        .select("id, viveiro_id, data_biometria, peso_medio_g, amostras, sobrevivencia_percent")
        .order("data_biometria", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BiometriaRelatorio[];
    },
  });

  const linhas = useMemo(() => {
    return viveiros.map((v) => {
      const lancs = lancamentos.filter((l) => l.viveiro_id === v.id);
      const lancsRacao = lancs.filter((l) => l.tipo === "racao");
      const lancsOutros = lancs.filter((l) => l.tipo !== "racao");

      const racaoKg = lancsRacao.reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
      const custoRacao = lancsRacao.reduce((s, l) => s + Number(l.custo_total ?? 0), 0);
      const custoOutros = lancsOutros.reduce((s, l) => s + Number(l.custo_total ?? 0), 0);
      const custoTotal = custoRacao + custoOutros;

      const bios = biometrias.filter((b) => b.viveiro_id === v.id);
      const ultimaBio = bios[0];
      const pesoMedio = Number(ultimaBio?.peso_medio_g ?? 0);
      const sobrevivencia = Number(ultimaBio?.sobrevivencia_percent ?? 0);
      const biomassa = ((v.qtd_povoada ?? 0) * (sobrevivencia / 100) * pesoMedio) / 1000;
      const fca = biomassa > 0 ? racaoKg / biomassa : 0;
      const custoPorKg = biomassa > 0 ? custoTotal / biomassa : 0;

      const datasLanc = lancs.map((l) => l.data_lancamento).sort();
      const primeiraData = datasLanc[0];
      const base = v.data_povoamento ?? primeiraData ?? null;
      const dias = base ? diasDeCultivo(base) : null;

      // Ração dia a dia
      const mapaRacao = new Map<string, { kg: number; custo: number }>();
      for (const l of lancsRacao) {
        const cur = mapaRacao.get(l.data_lancamento) ?? { kg: 0, custo: 0 };
        cur.kg += Number(l.quantidade ?? 0);
        cur.custo += Number(l.custo_total ?? 0);
        mapaRacao.set(l.data_lancamento, cur);
      }
      const racaoDiaria = Array.from(mapaRacao.entries())
        .map(([data, r]) => ({ data, kg: r.kg, custo: r.custo }))
        .sort((a, b) => (a.data < b.data ? 1 : -1));

      return {
        id: v.id,
        viveiro: v.nome,
        fazenda: v.fazendas?.nome ?? "Sem fazenda",
        status: v.status,
        fornecedor: v.fornecedor ?? "—",
        dataPovoamento: v.data_povoamento,
        dias,
        qtdPovoada: v.qtd_povoada ?? 0,
        racaoKg,
        custoRacao,
        custoOutros,
        custoTotal,
        custoPorKg,
        pesoMedio,
        sobrevivencia,
        biomassa,
        fca,
        ultimaBioData: ultimaBio?.data_biometria ?? null,
        nLancamentos: lancs.length,
        nBiometrias: bios.length,
        lancs,
        bios,
        racaoDiaria,
      };
    });
  }, [biometrias, lancamentos, viveiros]);

  const totais = useMemo(() => {
    return linhas.reduce(
      (acc, l) => ({
        viveiros: acc.viveiros + 1,
        racaoKg: acc.racaoKg + l.racaoKg,
        biomassa: acc.biomassa + l.biomassa,
        custoTotal: acc.custoTotal + l.custoTotal,
      }),
      { viveiros: 0, racaoKg: 0, biomassa: 0, custoTotal: 0 },
    );
  }, [linhas]);

  async function exportPdf() {
    const [pdfModule, tableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const jsPDF = pdfModule.default;
    const autoTable = (tableModule as { default?: unknown; autoTable?: unknown }).default ?? (tableModule as { autoTable?: unknown }).autoTable;
    if (typeof autoTable !== "function") throw new Error("PDF generator falhou.");

    const doc = new jsPDF({ orientation: "landscape" });
    const hoje = new Date().toLocaleDateString("pt-BR");
    doc.setFontSize(16);
    doc.text("Relatório Completo de Viveiros", 14, 16);
    doc.setFontSize(10);
    doc.text(`Gerado em ${hoje}`, 14, 22);
    doc.text(
      `Viveiros: ${totais.viveiros} | Ração: ${formatNumber(totais.racaoKg)} kg | Biomassa: ${formatNumber(totais.biomassa)} kg | Custo: ${formatBRL(totais.custoTotal)}`,
      14,
      28,
    );
    const header = ["Viveiro","Fazenda","Povoamento","Dias","Povoados","Ração kg","Custo total","Peso g","Sobrev.","Biomassa","FCA","R$/kg"];
    const rows = linhas.map((l) => [
      l.viveiro, l.fazenda,
      l.dataPovoamento ? formatDate(l.dataPovoamento) : "—",
      String(l.dias ?? "—"),
      l.qtdPovoada.toLocaleString("pt-BR"),
      formatNumber(l.racaoKg),
      formatBRL(l.custoTotal),
      l.pesoMedio ? formatNumber(l.pesoMedio) : "—",
      l.sobrevivencia ? formatNumber(l.sobrevivencia) : "—",
      l.biomassa ? formatNumber(l.biomassa) : "—",
      l.fca ? formatNumber(l.fca) : "—",
      l.custoPorKg ? formatBRL(l.custoPorKg) : "—",
    ]);
    (autoTable as (d: unknown, o: unknown) => void)(doc, {
      head: [header], body: rows, startY: 34,
      styles: { fontSize: 8 }, headStyles: { fillColor: [13, 148, 136] },
    });
    doc.save(`relatorio-viveiros-${todayLocal()}.pdf`);
  }

  function imprimirTudo() {
    setPrintOnlyId(null);
    setTimeout(() => window.print(), 50);
  }

  function imprimirViveiro(id: string) {
    setPrintOnlyId(id);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintOnlyId(null), 200);
    }, 50);
  }

  const delLanc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delBio = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("biometrias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Biometria removida");
      qc.invalidateQueries({ queryKey: ["biometrias"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function confirmDelLanc(id: string) {
    if (window.confirm("Apagar este lançamento?")) delLanc.mutate(id);
  }
  function confirmDelBio(id: string) {
    if (window.confirm("Apagar esta biometria?")) delBio.mutate(id);
  }

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only-target { display: block !important; }
          ${printOnlyId ? `.viveiro-card:not([data-vid="${printOnlyId}"]) { display: none !important; }` : ""}
        }
      `}</style>

      <div className="no-print flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="mt-1 text-muted-foreground break-words">Extrato por viveiro</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <button
            onClick={imprimirTudo}
            disabled={linhas.length === 0}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border bg-secondary px-3 font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 sm:px-4"
          >
            <Printer className="size-5" /> Imprimir tudo
          </button>
          <button
            onClick={exportPdf}
            disabled={linhas.length === 0}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 font-semibold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 sm:px-4"
          >
            <FileDown className="size-5" /> PDF
          </button>
        </div>
      </div>

      <div className="no-print grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <ResumoCard Icon={FileText} label="Viveiros" value={String(totais.viveiros)} />
        <ResumoCard Icon={Utensils} label="Ração" value={`${formatNumber(totais.racaoKg)} kg`} />
        <ResumoCard Icon={Scale} label="Biomassa" value={`${formatNumber(totais.biomassa)} kg`} />
        <ResumoCard Icon={DollarSign} label="Custo total" value={formatBRL(totais.custoTotal)} />
      </div>

      {linhas.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
          Sem dados ainda para relatório.
        </p>
      ) : (
        <div className="grid min-w-0 gap-4">
          {linhas.map((l) => (
            <div
              key={l.id}
              data-vid={l.id}
              className="viveiro-card min-w-0 rounded-2xl border bg-card p-5 print:border-black"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-bold">{l.viveiro}</h2>
                  <p className="break-words text-xs text-muted-foreground">
                    {l.fazenda} • {l.status} • {l.dias != null ? `${l.dias} dias de cultivo` : "sem povoamento"}
                  </p>
                </div>
                <button
                  onClick={() => imprimirViveiro(l.id)}
                  className="no-print inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
                >
                  <Printer className="size-4" /> Imprimir
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 md:grid-cols-4">
                <Info label="Fornecedor" value={l.fornecedor} />
                <Info label="Povoamento" value={l.dataPovoamento ? formatDate(l.dataPovoamento) : "—"} />
                <Info label="Pós-larvas" value={l.qtdPovoada.toLocaleString("pt-BR")} />
                <Info label="Ração total" value={`${formatNumber(l.racaoKg)} kg`} />
                <Info label="Custo ração" value={formatBRL(l.custoRacao)} />
                <Info label="Custo outros" value={formatBRL(l.custoOutros)} />
                <Info label="Custo total" value={formatBRL(l.custoTotal)} />
                <Info label="R$/kg" value={l.custoPorKg ? formatBRL(l.custoPorKg) : "—"} />
                <Info label="Peso médio" value={l.pesoMedio ? `${formatNumber(l.pesoMedio)} g` : "—"} />
                <Info label="Sobrev." value={l.sobrevivencia ? `${formatNumber(l.sobrevivencia)} %` : "—"} />
                <Info label="Biomassa" value={l.biomassa ? `${formatNumber(l.biomassa)} kg` : "—"} />
                <Info label="FCA" value={l.fca ? formatNumber(l.fca) : "—"} />
                <Info label="Lançamentos" value={String(l.nLancamentos)} />
                <Info label="Biometrias" value={String(l.nBiometrias)} />
                <Info label="Última biometria" value={l.ultimaBioData ? formatDate(l.ultimaBioData) : "—"} />
              </div>

              {l.bios.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Biometrias</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Data</th>
                          <th className="p-2 text-right">Peso médio (g)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.bios.map((b) => (
                          <tr key={b.id} className="border-t">
                            <td className="p-2">{formatDate(b.data_biometria)}</td>
                            <td className="p-2 text-right">{formatNumber(Number(b.peso_medio_g ?? 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {l.racaoDiaria.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ração dia a dia</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Data</th>
                          <th className="p-2 text-right">Ração (kg)</th>
                          <th className="p-2 text-right">Custo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.racaoDiaria.map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{formatDate(r.data)}</td>
                            <td className="p-2 text-right">{formatNumber(r.kg)}</td>
                            <td className="p-2 text-right">{formatBRL(r.custo)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/50 font-semibold">
                        <tr>
                          <td className="p-2">Total</td>
                          <td className="p-2 text-right">{formatNumber(l.racaoKg)}</td>
                          <td className="p-2 text-right">{formatBRL(l.custoRacao)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {l.lancs.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lançamentos</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Data</th>
                          <th className="p-2 text-left">Produto</th>
                          <th className="p-2 text-left">Tipo</th>
                          <th className="p-2 text-right">Qtd</th>
                          <th className="p-2 text-right">Custo</th>
                          <th className="no-print p-2 text-right w-24">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.lancs.map((x) => (
                          <tr key={x.id} className="border-t">
                            <td className="p-2">{formatDate(x.data_lancamento)}</td>
                            <td className="p-2">{x.produto_nome}</td>
                            <td className="p-2">{x.tipo}</td>
                            <td className="p-2 text-right">{formatNumber(Number(x.quantidade ?? 0))} {x.unidade}</td>
                            <td className="p-2 text-right">{formatBRL(Number(x.custo_total ?? 0))}</td>
                            <td className="no-print p-2 text-right">
                              <div className="inline-flex gap-1">
                                <button
                                  onClick={() => setEditLanc(x)}
                                  className="size-7 rounded hover:bg-primary/10 hover:text-primary inline-flex items-center justify-center"
                                  aria-label="Editar"
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                                <button
                                  onClick={() => confirmDelLanc(x.id)}
                                  className="size-7 rounded hover:bg-destructive/10 hover:text-destructive inline-flex items-center justify-center"
                                  aria-label="Apagar"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editBio && (
        <EditBioModal
          bio={editBio}
          onClose={() => setEditBio(null)}
          onSaved={() => {
            setEditBio(null);
            qc.invalidateQueries({ queryKey: ["biometrias"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
          }}
        />
      )}
      {editLanc && (
        <EditLancModal
          lanc={editLanc}
          onClose={() => setEditLanc(null)}
          onSaved={() => {
            setEditLanc(null);
            qc.invalidateQueries({ queryKey: ["lancamentos"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
          }}
        />
      )}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
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
          <h3 className="font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="size-8 rounded-lg hover:bg-muted flex items-center justify-center"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function EditBioModal({
  bio,
  onClose,
  onSaved,
}: {
  bio: BiometriaRelatorio;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState(bio.data_biometria);
  const [qtd, setQtd] = useState(String(bio.amostras ?? ""));
  const [pesoTotal, setPesoTotal] = useState(
    bio.amostras && bio.peso_medio_g
      ? String(Number(bio.amostras) * Number(bio.peso_medio_g))
      : "",
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
        })
        .eq("id", bio.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Biometria atualizada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalShell title="Editar biometria" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        className="p-4 space-y-4"
      >
        <FieldRow label="Data">
          <input
            required
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="app-input"
          />
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Qtd camarões">
            <input
              required
              min="1"
              type="number"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              className="app-input"
            />
          </FieldRow>
          <FieldRow label="Peso total (g)">
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={pesoTotal}
              onChange={(e) => setPesoTotal(e.target.value)}
              className="app-input"
            />
          </FieldRow>
        </div>
        <p className="text-sm text-muted-foreground">
          Peso médio: <span className="font-bold text-foreground">{pesoMedio ? `${pesoMedio.toFixed(2)} g` : "—"}</span>
        </p>
        <div className="flex gap-2">
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
    </ModalShell>
  );
}

function EditLancModal({
  lanc,
  onClose,
  onSaved,
}: {
  lanc: LancamentoRelatorio;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState(lanc.data_lancamento);
  const [produto, setProduto] = useState(lanc.produto_nome);
  const [quantidade, setQuantidade] = useState(String(lanc.quantidade ?? ""));
  const [unidade, setUnidade] = useState(lanc.unidade);
  const [tipo, setTipo] = useState(lanc.tipo);
  const [preco, setPreco] = useState(String(lanc.preco_unidade ?? ""));
  const [custo, setCusto] = useState(String(lanc.custo_total ?? ""));

  const mut = useMutation({
    mutationFn: async () => {
      const q = Number(quantidade);
      if (!produto.trim() || q <= 0) throw new Error("Preencha produto e quantidade.");
      const { error } = await supabase
        .from("lancamentos")
        .update({
          data_lancamento: data,
          produto_nome: produto,
          quantidade: q,
          unidade,
          tipo,
          preco_unidade: preco ? Number(preco) : null,
          custo_total: custo ? Number(custo) : null,
        })
        .eq("id", lanc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento atualizado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalShell title="Editar lançamento" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        className="p-4 space-y-3 max-h-[70vh] overflow-y-auto"
      >
        <FieldRow label="Data">
          <input required type="date" value={data} onChange={(e) => setData(e.target.value)} className="app-input" />
        </FieldRow>
        <FieldRow label="Produto">
          <input required value={produto} onChange={(e) => setProduto(e.target.value)} className="app-input" />
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Quantidade">
            <input required min="0" step="0.01" type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="app-input" />
          </FieldRow>
          <FieldRow label="Unidade">
            <input value={unidade} onChange={(e) => setUnidade(e.target.value)} className="app-input" />
          </FieldRow>
        </div>
        <FieldRow label="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="app-input">
            <option value="racao">Ração</option>
            <option value="insumo">Insumo</option>
            <option value="medicamento">Medicamento</option>
            <option value="outro">Outro</option>
          </select>
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Preço unidade (R$)">
            <input min="0" step="0.01" type="number" value={preco} onChange={(e) => setPreco(e.target.value)} className="app-input" />
          </FieldRow>
          <FieldRow label="Custo total (R$)">
            <input min="0" step="0.01" type="number" value={custo} onChange={(e) => setCusto(e.target.value)} className="app-input" />
          </FieldRow>
        </div>
        <div className="flex gap-2 pt-2">
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
    </ModalShell>
  );
}

function ResumoCard({
  Icon,
  label,
  value,
}: {
  Icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p className="mt-2 text-xl font-bold break-words">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words font-semibold">{value}</p>
    </div>
  );
}

function diasDeCultivo(data: string) {
  const d = new Date(data);
  const hoje = new Date();
  return Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatBRL(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  if (y && m && day) return `${day}/${m}/${y}`;
  return new Date(d).toLocaleDateString("pt-BR");
}
