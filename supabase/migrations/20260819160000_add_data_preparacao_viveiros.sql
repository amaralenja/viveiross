-- Data de preparação do viveiro (fase antes do povoamento/cultivo)
alter table public.viveiros add column if not exists data_preparacao date;
