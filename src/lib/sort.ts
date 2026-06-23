// Ordena nomes de viveiros pelo número contido no texto.
// Ex.: "Viveiro 2", "Viveiro 10" -> 2 antes de 10.
export function viveiroNum(nome: string | null | undefined): number {
  if (!nome) return Number.POSITIVE_INFINITY;
  const m = String(nome).match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
}

export function sortByViveiroNome<T>(arr: T[], getNome: (item: T) => string | null | undefined): T[] {
  return [...arr].sort((a, b) => {
    const na = viveiroNum(getNome(a));
    const nb = viveiroNum(getNome(b));
    if (na !== nb) return na - nb;
    return String(getNome(a) ?? "").localeCompare(String(getNome(b) ?? ""), "pt-BR");
  });
}
