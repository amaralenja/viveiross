// Retorna a data local (timezone do usuário) no formato YYYY-MM-DD.
// Evita o bug do .toISOString() que usa UTC e pula dia no Brasil à noite.
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
