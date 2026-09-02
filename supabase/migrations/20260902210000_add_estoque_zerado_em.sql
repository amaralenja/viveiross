-- Ponto de zeragem do estoque: Entrada/Saída/Saldo contam só a partir dessa data.
-- Preserva o histórico (não apaga alimentação dos viveiros / FCA).
alter table public.produtos add column if not exists estoque_zerado_em timestamptz;
