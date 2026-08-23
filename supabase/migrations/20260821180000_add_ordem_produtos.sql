-- Ordem manual dos produtos (definida pelo usuário na aba Produtos)
alter table public.produtos add column if not exists ordem integer;
