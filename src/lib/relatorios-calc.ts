// Cálculos e formatadores compartilhados entre a página de Relatórios (autenticada)
// e a página pública de compartilhamento (/r/$token).

export type ViveiroRel = {
  id: string;
  nome: string;
  qtd_povoada: number | null;
  data_povoamento: string | null;
  status: string;
  fornecedor: string | null;
  fazendas: { nome: string } | { nome: string }[] | null;
};
export type LancamentoRel = {
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
export type BiometriaRel = {
  id: string;
  viveiro_id: string;
  data_biometria: string;
  peso_medio_g: number;
  amostras: number | null;
  sobrevivencia_percent: number | null;
};
export type DespesaRel = {
  id: string;
  viveiro_id: string | null;
  descricao: string;
  categoria: string | null;
  valor: number;
  data_despesa: string;
  rateio: string;
};
export type FuncionarioRel = {
  id: string;
  nome: string;
  salario: number | null;
  ativo: boolean;
  viveiro_id: string | null;
  observacao: string | null;
};
export type ValeRel = {
  id: string;
  funcionario_id: string;
  valor: number;
  motivo: string | null;
  data_vale: string;
};
export type CaixaRel = {
  id: string;
  viveiro_id: string | null;
  data_lancamento: string;
  descricao: string;
  categoria: string;
  tipo: string;
  valor: number;
  quantidade: number | null;
  unidade: string | null;
  observacao: string | null;
};

export type RelatorioBundle = {
  viveiros: ViveiroRel[];
  lancamentos: LancamentoRel[];
  biometrias: BiometriaRel[];
  despesas: DespesaRel[];
  funcionarios: FuncionarioRel[];
  vales: ValeRel[];
  caixa: CaixaRel[];
};

export function textValue(value: unknown, fallback = "—"): string {
  if (value == null || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return textValue(value[0], fallback);
  if (typeof value === "object" && "nome" in value) return textValue((value as { nome?: unknown }).nome, fallback);
  return fallback;
}

export function relName(rel: { nome: string } | { nome: string }[] | null | undefined): string {
  return textValue(rel, "");
}

export function diasDeCultivo(data: string) {
  const d = new Date(data);
  const hoje = new Date();
  return Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

export function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function formatBRL(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  if (y && m && day) return `${day}/${m}/${y}`;
  return new Date(d).toLocaleDateString("pt-BR");
}

export function computeLinhas(bundle: RelatorioBundle) {
  const { viveiros, lancamentos, biometrias, despesas, funcionarios, vales, caixa } = bundle;
  const ativos = viveiros.filter((v) => (v.status ?? "ativo") === "ativo");
  const nViv = Math.max(1, ativos.length);
  const ativosSet = new Set(ativos.map((v) => v.id));
  const despesasRateadas = despesas.filter((d) => d.rateio === "todos" || d.viveiro_id == null);
  const despesasIndividuais = despesas.filter((d) => d.rateio !== "todos" && d.viveiro_id != null);
  const custoRateioPorViveiro = despesasRateadas.reduce((s, d) => s + Number(d.valor ?? 0), 0) / nViv;

  return viveiros.map((v) => {
    const ehAtivo = ativosSet.has(v.id);
    const lancs = lancamentos.filter((l) => l.viveiro_id === v.id);
    const lancsRacao = lancs.filter((l) => l.tipo === "racao");
    const lancsOutros = lancs.filter((l) => l.tipo !== "racao");

    const racaoKg = lancsRacao.reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
    const custoRacao = lancsRacao.reduce((s, l) => s + Number(l.custo_total ?? 0), 0);
    const custoOutrosLanc = lancsOutros.reduce((s, l) => s + Number(l.custo_total ?? 0), 0);
    const despesasDoViveiro = despesasIndividuais.filter((d) => d.viveiro_id === v.id);
    const custoDespIndiv = despesasDoViveiro.reduce((s, d) => s + Number(d.valor ?? 0), 0);
    const custoDespRateio = ehAtivo ? custoRateioPorViveiro : 0;
    const custoOutros = custoOutrosLanc + custoDespIndiv + custoDespRateio;
    const custoTotal = custoRacao + custoOutros;

    const bios = biometrias.filter((b) => b.viveiro_id === v.id);
    const ultimaBio = bios[0];
    const pesoMedio = Number(ultimaBio?.peso_medio_g ?? 0);
    const sobrevivencia = ultimaBio?.sobrevivencia_percent != null ? Number(ultimaBio.sobrevivencia_percent) : null;
    const sobrevivenciaCalculo = sobrevivencia ?? 100;
    const qtdPovoada = Number(v.qtd_povoada ?? 0);
    const biomassa = ultimaBio && qtdPovoada > 0 && pesoMedio > 0
      ? (qtdPovoada * (sobrevivenciaCalculo / 100) * pesoMedio) / 1000
      : 0;
    const fca = ultimaBio && biomassa > 0 ? racaoKg / biomassa : null;
    const custoPorKg = biomassa > 0 ? custoTotal / biomassa : 0;

    const datasLanc = lancs.map((l) => l.data_lancamento).sort();
    const primeiraData = datasLanc[0];
    const base = v.data_povoamento ?? primeiraData ?? null;
    const dias = base ? diasDeCultivo(base) : null;

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

    const despesasLista = [
      ...despesasDoViveiro.map((d) => ({ ...d, share: Number(d.valor ?? 0), tipoRateio: "individual" as const })),
      ...(ehAtivo ? despesasRateadas.map((d) => ({ ...d, share: Number(d.valor ?? 0) / nViv, tipoRateio: "rateado" as const })) : []),
    ];

    const funcsDoViveiro = funcionarios.filter((f) => f.viveiro_id === v.id);
    const funcsComVales = funcsDoViveiro.map((f) => {
      const meus = vales.filter((vv) => vv.funcionario_id === f.id);
      const totalVales = meus.reduce((s, x) => s + Number(x.valor ?? 0), 0);
      return { ...f, vales: meus, totalVales };
    });
    const totalSalarios = funcsDoViveiro.reduce((s, f) => s + Number(f.salario ?? 0), 0);
    const totalValesViv = funcsComVales.reduce((s, f) => s + f.totalVales, 0);

    const caixaDoViv = caixa.filter((c) => c.viveiro_id === v.id);
    const receitasLista = caixaDoViv.filter((c) => c.tipo === "receita");
    const despesasCaixa = caixaDoViv.filter((c) => c.tipo !== "receita");
    const receitas = receitasLista.reduce((s, c) => s + Number(c.valor ?? 0), 0);
    const despesasCaixaTot = despesasCaixa.reduce((s, c) => s + Number(c.valor ?? 0), 0);
    const saldoCaixa = receitas - despesasCaixaTot;
    const lucro = receitas - custoTotal;

    return {
      id: v.id,
      viveiro: textValue(v.nome),
      fazenda: relName(v.fazendas) || "Sem fazenda",
      status: textValue(v.status),
      fornecedor: textValue(v.fornecedor),
      dataPovoamento: v.data_povoamento,
      dias,
      qtdPovoada,
      racaoKg,
      custoRacao,
      custoOutros,
      custoDespRateio,
      custoDespIndiv,
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
      despesasLista,
      funcionarios: funcsComVales,
      totalSalarios,
      totalValesViv,
      receitas,
      despesasCaixaTot,
      saldoCaixa,
      lucro,
      receitasLista,
      caixaDoViv,
    };
  });
}

export type LinhaRel = ReturnType<typeof computeLinhas>[number];

export function computeTotais(linhas: LinhaRel[]) {
  const base = linhas.reduce(
    (acc, l) => ({
      viveiros: acc.viveiros + 1,
      racaoKg: acc.racaoKg + l.racaoKg,
      biomassa: acc.biomassa + l.biomassa,
      custoTotal: acc.custoTotal + l.custoTotal,
      receitas: acc.receitas + l.receitas,
      lucro: acc.lucro + l.lucro,
      vales: acc.vales + l.totalValesViv,
      salarios: acc.salarios + l.totalSalarios,
    }),
    { viveiros: 0, racaoKg: 0, biomassa: 0, custoTotal: 0, receitas: 0, lucro: 0, vales: 0, salarios: 0 },
  );
  return { ...base, fca: base.biomassa > 0 ? base.racaoKg / base.biomassa : null };
}
