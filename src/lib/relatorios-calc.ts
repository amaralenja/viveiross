// Cálculos e formatadores compartilhados entre a página de Relatórios (autenticada)
// e a página pública de compartilhamento (/r/$token).
// IMPORTANTE: computeLinhas é a ÚNICA fonte de cálculo — a página do app também a
// chama, então app e link público mostram exatamente os mesmos números.

export type ViveiroRel = {
  id: string;
  nome: string;
  qtd_povoada: number | null;
  data_povoamento: string | null;
  status: string;
  fornecedor: string | null;
  biomassa_manual: number | null;
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
  observacao?: string | null;
  tipo_remuneracao?: "mensal" | "diaria" | null;
  data_inicio?: string | null;
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
  despesa_id: string | null;
  lancamento_id: string | null;
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

export function computeLinhas(bundle: Partial<RelatorioBundle> | null | undefined) {
  const viveiros = bundle?.viveiros ?? [];
  const lancamentos = bundle?.lancamentos ?? [];
  const biometrias = bundle?.biometrias ?? [];
  const despesas = bundle?.despesas ?? [];
  const funcionarios = bundle?.funcionarios ?? [];
  const vales = bundle?.vales ?? [];
  const caixa = bundle?.caixa ?? [];

  const nAtivos = Math.max(1, viveiros.filter((viv) => viv.status === "ativo").length);
  const despesasRateadas = despesas.filter((d) => d.rateio === "todos" || d.viveiro_id == null);
  const despesasIndividuais = despesas.filter((d) => d.rateio !== "todos" && d.viveiro_id != null);
  const custoRateioPorViveiro = despesasRateadas.reduce((s, d) => s + Number(d.valor ?? 0), 0) / nAtivos;
  const caixaRateado = caixa.filter((c) => c.viveiro_id == null && c.categoria !== "interno");
  // Despesas puras do caixa (não vieram de despesas_gerais nem de lançamentos de ração)
  const caixaDespesaPura = caixa.filter(
    (c) => c.tipo !== "receita" && c.despesa_id == null && c.lancamento_id == null && c.categoria !== "interno",
  );
  const caixaDespesaRateada = caixaDespesaPura.filter((c) => c.viveiro_id == null);
  const caixaDespesaIndiv = caixaDespesaPura.filter((c) => c.viveiro_id != null);
  const custoCaixaRateioPorViveiro = caixaDespesaRateada.reduce((s, c) => s + Number(c.valor ?? 0), 0) / nAtivos;

  return viveiros.map((v) => {
    // Rateio (despesas/caixa/receitas compartilhadas) só cai em viveiro ATIVO.
    const isAtivo = v.status === "ativo";
    const lancs = lancamentos.filter((l) => l.viveiro_id === v.id);
    const lancsRacao = lancs.filter((l) => l.tipo === "racao");
    const lancsOutros = lancs.filter((l) => l.tipo !== "racao");

    const racaoKg = lancsRacao.reduce((s, l) => s + Number(l.quantidade ?? 0), 0);
    const custoRacao = lancsRacao.reduce((s, l) => s + Number(l.custo_total ?? 0), 0);
    const custoOutrosLanc = lancsOutros.reduce((s, l) => s + Number(l.custo_total ?? 0), 0);
    const despesasDoViveiro = despesasIndividuais.filter((d) => d.viveiro_id === v.id);
    const custoDespIndiv = despesasDoViveiro.reduce((s, d) => s + Number(d.valor ?? 0), 0);
    const custoDespRateio = isAtivo ? custoRateioPorViveiro : 0;
    const caixaDespIndivViv = caixaDespesaIndiv.filter((c) => c.viveiro_id === v.id);
    const custoCaixaIndiv = caixaDespIndivViv.reduce((s, c) => s + Number(c.valor ?? 0), 0);
    const custoCaixaRateio = isAtivo ? custoCaixaRateioPorViveiro : 0;
    const custoOutros = custoOutrosLanc + custoDespIndiv + custoDespRateio + custoCaixaIndiv + custoCaixaRateio;
    const custoTotal = custoRacao + custoOutros;

    const bios = biometrias.filter((b) => b.viveiro_id === v.id);
    const ultimaBio = bios[0];
    const pesoMedio = Number(ultimaBio?.peso_medio_g ?? 0);
    const sobrevivencia = ultimaBio?.sobrevivencia_percent != null ? Number(ultimaBio.sobrevivencia_percent) : null;
    const sobrevivenciaCalculo = sobrevivencia ?? 100;
    const qtdPovoada = Number(v.qtd_povoada ?? 0);
    const biomassaCalc = ultimaBio && qtdPovoada > 0 && pesoMedio > 0
      ? (qtdPovoada * (sobrevivenciaCalculo / 100) * pesoMedio) / 1000
      : 0;
    const biomassa = v.biomassa_manual != null ? Number(v.biomassa_manual) : biomassaCalc;
    const fca = ultimaBio && biomassa > 0 ? racaoKg / biomassa : null;
    const custoPorKg = biomassa > 0 ? custoTotal / biomassa : 0;

    const base = v.data_povoamento ?? null;
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

    // Lançamentos de funcionário/folha não entram na lista de "Despesas gerais" (só o que é lançado ali).
    const ehFuncionario = (c: { descricao?: string | null; categoria?: string | null }) =>
      (!!c.descricao && /funcion|folha|sal[áa]rio/i.test(c.descricao)) || c.categoria === "folha_pagamento";

    const despesasLista = [
      ...despesasDoViveiro.filter((d) => !ehFuncionario(d)).map((d) => ({ ...d, share: Number(d.valor ?? 0), tipoRateio: "individual" as const, source: "despesa" as const })),
      ...(isAtivo ? despesasRateadas.filter((d) => !ehFuncionario(d)).map((d) => ({ ...d, share: Number(d.valor ?? 0) / nAtivos, tipoRateio: "rateado" as const, source: "despesa" as const })) : []),
      ...caixaDespIndivViv.filter((c) => !ehFuncionario(c)).map((c) => ({
        id: c.id,
        viveiro_id: c.viveiro_id,
        descricao: c.descricao,
        categoria: c.categoria ?? "caixa",
        valor: Number(c.valor ?? 0),
        data_despesa: c.data_lancamento,
        rateio: "individual",
        share: Number(c.valor ?? 0),
        tipoRateio: "individual" as const,
        source: "caixa" as const,
      })),
      ...(isAtivo ? caixaDespesaRateada.filter((c) => !ehFuncionario(c)).map((c) => ({
        id: c.id,
        viveiro_id: c.viveiro_id,
        descricao: c.descricao,
        categoria: c.categoria ?? "caixa",
        valor: Number(c.valor ?? 0),
        data_despesa: c.data_lancamento,
        rateio: "todos",
        share: Number(c.valor ?? 0) / nAtivos,
        tipoRateio: "rateado" as const,
        source: "caixa" as const,
      })) : []),
    ];

    // Funcionários ligados a este viveiro + total de vales por funcionário
    const funcsDiretos = funcionarios.filter((f) => f.viveiro_id === v.id);
    const funcsRateados = funcionarios.filter((f) => f.viveiro_id === null);
    const dCultivo = Math.max(1, dias ?? 1);

    const totalDiasTodos = viveiros.filter((viv) => viv.status === "ativo").reduce((sum, viv) => {
      const b = viv.data_povoamento ?? null;
      return sum + (b ? Math.max(1, diasDeCultivo(b)) : 1);
    }, 0);

    const calcCustoFunc = (f: FuncionarioRel, isDireto: boolean): number => {
      const baseSal = Number(f.salario ?? 0);
      const dataBase = f.data_inicio ?? v.data_povoamento ?? null;
      const diasFunc = dataBase ? Math.max(1, diasDeCultivo(dataBase)) : dCultivo;
      if (f.tipo_remuneracao === "diaria") {
        return baseSal * diasFunc;
      }
      if (isDireto) return baseSal;
      const prop = totalDiasTodos > 0 ? dCultivo / totalDiasTodos : 1 / nAtivos;
      return baseSal * prop;
    };

    const funcsComVales = [...funcsDiretos.map((f) => {
      const meus = vales.filter((vv) => vv.funcionario_id === f.id);
      const totalVales = meus.reduce((s, x) => s + Number(x.valor ?? 0), 0);
      const custoCalculado = calcCustoFunc(f, true);
      return { ...f, vales: meus, totalVales, custoCalculado };
    }), ...funcsRateados.map((f) => {
      const meus = vales.filter((vv) => vv.funcionario_id === f.id);
      const totalVales = meus.reduce((s, x) => s + Number(x.valor ?? 0), 0);
      const custoCalculado = calcCustoFunc(f, false);
      return { ...f, vales: meus, totalVales, custoCalculado };
    })];
    const totalSalarios = funcsComVales.reduce((s, f) => s + (f.custoCalculado ?? Number(f.salario ?? 0)), 0);
    const totalValesViv = funcsComVales.reduce((s, f) => s + f.totalVales, 0);

    // Caixa: receitas/despesas atribuídas a este viveiro + rateados (viveiro_id null)
    const caixaDoVivDireto = caixa.filter((c) => c.viveiro_id === v.id);
    const caixaDoViv = [...caixaDoVivDireto, ...(isAtivo ? caixaRateado.map((c) => ({ ...c, valor: Number(c.valor ?? 0) / nAtivos })) : [])];
    // Receitas = só as vendas atribuídas a ESTE viveiro (não rateia entrada compartilhada).
    const receitasLista = caixaDoVivDireto.filter((c) => c.tipo === "receita");
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
      custoCaixaRateio,
      custoCaixaIndiv,
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
