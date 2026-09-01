-- Arquivamento: viveiros (Relatórios) e pessoas/contas (Financeiro)
alter table public.viveiros add column if not exists arquivado boolean not null default false;
alter table public.categorias_financeiro add column if not exists arquivada boolean not null default false;
