-- Ordem manual das pessoas/contas no Financeiro (setinhas subir/descer)
alter table public.categorias_financeiro add column if not exists ordem integer;
