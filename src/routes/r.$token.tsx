import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  computeLinhas,
  computeTotais,
  formatBRL,
  formatDate,
  formatNumber,
  textValue,
  type LinhaRel,
  type RelatorioBundle,
} from "@/lib/relatorios-calc";
import { Fish, Scale, Utensils, DollarSign, TrendingUp, Wallet, Users, Calendar, Printer } from "lucide-react";

export const Route = createFileRoute("/r/$token")({
  head: () => ({ meta: [{ title: "Relatório de Viveiros" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ pdf: s.pdf === "1" || s.pdf === 1 || s.pdf === true ? 1 : undefined }),
  component: PublicReport,
});

type Bundle = RelatorioBundle & { titulo: string | null; createdAt: string };

function PublicReport() {
  const { token } = Route.useParams();
  const { pdf } = Route.useSearch();
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-relatorio", token],
    queryFn: async (): Promise<Bundle> => {
      const res = await fetch(`/api/public/relatorio/${token}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  useEffect(() => {
    if (pdf && data) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [pdf, data]);


  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <p className="text-slate-500">Carregando relatório…</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-slate-900">Link inválido</h1>
          <p className="mt-2 text-slate-600">{(error as Error)?.message ?? "Esse link de relatório não está mais disponível."}</p>
        </div>
      </div>
    );
  }

  const linhas = computeLinhas(data);
  const totais = computeTotais(linhas);
  const hoje = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50">
      <header className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Fish className="size-7" />
            </div>
            <div>
              <p className="text-sm text-white/80">Relatório de Viveiros</p>
              <h1 className="text-3xl font-bold">{data.titulo ?? "Extrato completo"}</h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-white/80 flex items-center gap-2">
            <Calendar className="size-4" /> Gerado em {hoje} · {linhas.length} viveiro{linhas.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 space-y-8">
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi icon={<Utensils />} label="Ração total" value={`${formatNumber(totais.racaoKg)} kg`} tone="teal" />
          <Kpi icon={<Scale />} label="Biomassa" value={`${formatNumber(totais.biomassa)} kg`} tone="emerald" />
          <Kpi icon={<DollarSign />} label="Custo total" value={formatBRL(totais.custoTotal)} tone="rose" />
          <Kpi icon={<TrendingUp />} label="Receitas" value={formatBRL(totais.receitas)} tone="indigo" />
          <Kpi icon={<Wallet />} label="Lucro estimado" value={formatBRL(totais.lucro)} tone={totais.lucro >= 0 ? "emerald" : "rose"} />
          <Kpi icon={<Users />} label="Salários" value={formatBRL(totais.salarios)} tone="slate" />
          <Kpi icon={<DollarSign />} label="Vales" value={formatBRL(totais.vales)} tone="amber" />
          <Kpi icon={<Scale />} label="FCA geral" value={totais.fca != null ? formatNumber(totais.fca) : "—"} tone="slate" />
        </section>

        {linhas.map((l) => (
          <ViveiroBlock key={l.id} l={l} />
        ))}

        <footer className="pt-6 pb-10 text-center text-xs text-slate-400">
          Relatório gerado pelo app Viveiros · {hoje}
        </footer>
      </main>
    </div>
  );
}

function Kpi({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone: "teal" | "emerald" | "rose" | "indigo" | "slate" | "amber" }) {
  const tones: Record<string, string> = {
    teal: "bg-teal-50 text-teal-700 ring-teal-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
  };
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium ring-1 ${tones[tone]}`}>
        <span className="[&>svg]:size-3.5">{icon}</span> {label}
      </div>
      <p className="mt-3 text-xl font-bold text-slate-900 break-words">{value}</p>
    </div>
  );
}

function ViveiroBlock({ l }: { l: LinhaRel }) {
  return (
    <article className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">{l.viveiro}</h2>
            <p className="text-sm text-white/70">
              {l.fazenda} · {l.status} · {l.dias != null ? `${l.dias} dias de cultivo` : "sem povoamento"}
            </p>
          </div>
          {l.lucro !== 0 && (
            <div className={`rounded-xl px-3 py-2 text-sm font-bold ${l.lucro >= 0 ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>
              {l.lucro >= 0 ? "Lucro" : "Prejuízo"}: {formatBRL(l.lucro)}
            </div>
          )}
        </div>
      </div>

      <div className="p-5 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <Info label="Fornecedor" value={l.fornecedor} />
          <Info label="Povoamento" value={l.dataPovoamento ? formatDate(l.dataPovoamento) : "—"} />
          <Info label="Pós-larvas" value={l.qtdPovoada.toLocaleString("pt-BR")} />
          <Info label="Ração total" value={`${formatNumber(l.racaoKg)} kg`} />
          <Info label="Custo ração" value={formatBRL(l.custoRacao)} />
          <Info label="Custo outros" value={formatBRL(l.custoOutros)} />
          <Info label="Despesas rateadas" value={formatBRL(l.custoDespRateio)} />
          <Info label="Despesas próprias" value={formatBRL(l.custoDespIndiv)} />
          <Info label="Custo total" value={formatBRL(l.custoTotal)} highlight />
          <Info label="R$/kg" value={l.custoPorKg ? formatBRL(l.custoPorKg) : "—"} />
          <Info label="Peso médio" value={l.pesoMedio ? `${formatNumber(l.pesoMedio)} g` : "—"} />
          <Info label="Sobrev." value={l.sobrevivencia ? `${formatNumber(l.sobrevivencia)} %` : "—"} />
          <Info label="Biomassa" value={l.biomassa ? `${formatNumber(l.biomassa)} kg` : "—"} />
          <Info label="FCA" value={l.fca != null ? formatNumber(l.fca) : "—"} />
          <Info label="Receitas" value={formatBRL(l.receitas)} highlight />
          <Info label="Saldo caixa" value={formatBRL(l.saldoCaixa)} />
        </div>

        {l.racaoDiaria.length > 0 && (
          <Block title="Ração dia a dia">
            <SimpleTable
              head={["Data", "Ração (kg)", "Custo"]}
              rows={l.racaoDiaria.map((r) => [formatDate(r.data), formatNumber(r.kg), formatBRL(r.custo)])}
              foot={["Total", formatNumber(l.racaoKg), formatBRL(l.custoRacao)]}
            />
          </Block>
        )}

        {l.bios.length > 0 && (
          <Block title="Biometrias">
            <SimpleTable
              head={["Data", "Peso médio (g)"]}
              rows={l.bios.map((b) => [formatDate(b.data_biometria), formatNumber(Number(b.peso_medio_g ?? 0))])}
            />
          </Block>
        )}

        {l.lancs.length > 0 && (
          <Block title="Lançamentos">
            <SimpleTable
              head={["Data", "Produto", "Tipo", "Qtd", "Custo"]}
              rows={l.lancs.map((x) => [
                formatDate(x.data_lancamento),
                textValue(x.produto_nome),
                textValue(x.tipo),
                `${formatNumber(Number(x.quantidade ?? 0))} ${textValue(x.unidade, "")}`,
                formatBRL(Number(x.custo_total ?? 0)),
              ])}
            />
          </Block>
        )}

        {l.despesasLista.length > 0 && (
          <Block title="Despesas gerais">
            <SimpleTable
              head={["Data", "Descrição", "Rateio", "Valor", "Atribuído"]}
              rows={l.despesasLista.map((d) => [
                formatDate(d.data_despesa),
                textValue(d.descricao),
                d.tipoRateio === "rateado" ? "Rateado" : "Individual",
                formatBRL(Number(d.valor ?? 0)),
                formatBRL(d.share),
              ])}
            />
          </Block>
        )}

        {l.funcionarios.length > 0 && (
          <Block title="Funcionários e vales">
            <SimpleTable
              head={["Nome", "Salário", "Vales (total)", "Status"]}
              rows={l.funcionarios.map((f) => [
                f.nome,
                formatBRL(Number(f.salario ?? 0)),
                formatBRL(f.totalVales),
                f.ativo ? "Ativo" : "Inativo",
              ])}
              foot={["Total", formatBRL(l.totalSalarios), formatBRL(l.totalValesViv), ""]}
            />
          </Block>
        )}

        {l.receitasLista.length > 0 && (
          <Block title="Receitas">
            <SimpleTable
              head={["Data", "Descrição", "Categoria", "Qtd", "Valor"]}
              rows={l.receitasLista.map((c) => [
                formatDate(c.data_lancamento),
                c.descricao,
                c.categoria,
                c.quantidade != null ? `${formatNumber(Number(c.quantidade))} ${c.unidade ?? ""}` : "—",
                formatBRL(Number(c.valor ?? 0)),
              ])}
              foot={["Total", "", "", "", formatBRL(l.receitas)]}
            />
          </Block>
        )}

        {l.caixaDoViv.length > 0 && (
          <Block title="Caixa (todos os lançamentos)">
            <SimpleTable
              head={["Data", "Tipo", "Descrição", "Valor"]}
              rows={l.caixaDoViv.map((c) => [
                formatDate(c.data_lancamento),
                c.tipo,
                c.descricao,
                `${c.tipo === "receita" ? "+" : "-"} ${formatBRL(Number(c.valor ?? 0))}`,
              ])}
              foot={["", "", "Saldo", formatBRL(l.saldoCaixa)]}
            />
          </Block>
        )}
      </div>
    </article>
  );
}

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ring-1 ring-slate-100 ${highlight ? "bg-teal-50" : "bg-slate-50"}`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`font-semibold break-words ${highlight ? "text-teal-800" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-100">{children}</div>
    </div>
  );
}

function SimpleTable({ head, rows, foot }: { head: string[]; rows: (string | number)[][]; foot?: (string | number)[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-100 text-slate-700">
        <tr>{head.map((h, i) => <th key={i} className="p-2 text-left font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100">
            {r.map((c, j) => <td key={j} className="p-2 text-slate-700">{c}</td>)}
          </tr>
        ))}
      </tbody>
      {foot && (
        <tfoot className="bg-slate-50 font-bold text-slate-900">
          <tr>{foot.map((c, i) => <td key={i} className="p-2">{c}</td>)}</tr>
        </tfoot>
      )}
    </table>
  );
}
