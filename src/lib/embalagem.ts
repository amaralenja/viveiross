export type EmbalagemInfo = {
  temEmbalagem: boolean;
  unidadeBase: string; // "kg", "g", "litro", "unidade", etc.
  tipoEmbalagem: string; // "saco", "pacote", "caixa", "fardo", "galao", "balde", etc.
  pesoEmbalagem: number | null; // e.g. 10 ou 335
  rotuloEmbalagem: string; // e.g. "Balde de 335 g"
};

export function parseProdutoEmbalagem(unidadeStr: string | null | undefined): EmbalagemInfo {
  if (!unidadeStr) {
    return { temEmbalagem: false, unidadeBase: "kg", tipoEmbalagem: "", pesoEmbalagem: null, rotuloEmbalagem: "" };
  }

  const str = unidadeStr.trim();

  // Formato 1: "g [balde:335]" or "kg [saco:10]" or "unidade [caixa:20]"
  const matchTag = str.match(/^([^[\]]+)\s*\[([a-zA-ZáàâãéèêíóôõúçÁÀÂÃÉÈÊÍÓÔÕÚÇ]+):(\d+(?:[.,]\d+)?)\]/i);
  if (matchTag) {
    const base = matchTag[1].trim() || "kg";
    const tipo = matchTag[2].toLowerCase().trim();
    const peso = Number(matchTag[3].replace(",", "."));
    if (peso > 0) {
      const tipoCap = tipo.charAt(0).toUpperCase() + tipo.slice(1);
      return {
        temEmbalagem: true,
        unidadeBase: base,
        tipoEmbalagem: tipo,
        pesoEmbalagem: peso,
        rotuloEmbalagem: `${tipoCap} de ${peso} ${base}`,
      };
    }
  }

  // Formato 2: "balde de 335g" or "saco (10 kg)" or "caixa 20 un"
  const matchLegacy = str.match(/^(saco|pacote|caixa|fardo|galao|galão|balde|bombona|lata|frasco)\s*(?:\(|de)?\s*(\d+(?:[.,]\d+)?)\s*(kg|g|grama|gramas|litro|litros|l|ml|un|unidade|unidades)?(?:\))?/i);
  if (matchLegacy) {
    const tipo = matchLegacy[1].toLowerCase().trim();
    const peso = Number(matchLegacy[2].replace(",", "."));
    let base = (matchLegacy[3] || "kg").toLowerCase().trim();
    if (base === "grama" || base === "gramas") base = "g";
    if (base === "litros" || base === "l") base = "litro";
    if (peso > 0) {
      const tipoCap = tipo.charAt(0).toUpperCase() + tipo.slice(1);
      return {
        temEmbalagem: true,
        unidadeBase: base,
        tipoEmbalagem: tipo,
        pesoEmbalagem: peso,
        rotuloEmbalagem: `${tipoCap} de ${peso} ${base}`,
      };
    }
  }

  // Padrão: sem marcação de embalagem
  return {
    temEmbalagem: false,
    unidadeBase: str.replace(/\[.*\]/, "").trim() || "kg",
    tipoEmbalagem: "",
    pesoEmbalagem: null,
    rotuloEmbalagem: "",
  };
}

export function formatUnidadeDb(unidadeBase: string, tipoEmbalagem?: string, pesoEmbalagem?: number | null): string {
  const base = (unidadeBase || "kg").trim();
  if (tipoEmbalagem && pesoEmbalagem && pesoEmbalagem > 0) {
    const tipo = tipoEmbalagem.toLowerCase().trim();
    return `${base} [${tipo}:${pesoEmbalagem}]`;
  }
  return base;
}

export function getUnidadeBase(unidadeStr: string | null | undefined): string {
  return parseProdutoEmbalagem(unidadeStr).unidadeBase;
}
