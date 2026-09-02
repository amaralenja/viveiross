-- Permitir quantidade negativa em estoque_entradas (ajuste/zeragem de estoque).
-- Compras continuam positivas; só a zeragem insere um ajuste negativo.
alter table public.estoque_entradas drop constraint if exists estoque_entradas_quantidade_check;
alter table public.estoque_entradas add constraint estoque_entradas_quantidade_check check (quantidade <> 0);
