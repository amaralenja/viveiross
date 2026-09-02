-- Preço por milheiro das pós-larvas (usado para lançar automático a despesa de povoamento no caixa)
alter table public.viveiros add column if not exists preco_milheiro numeric;
