-- Fix: o código (_authenticated.financeiro.tsx) usa a coluna `excluida` em
-- categorias_financeiro para "esconder" categorias padrão, mas nenhuma migration
-- criava essa coluna. Sem ela, remover/ocultar categoria padrão falha.
-- Idempotente: seguro rodar mais de uma vez.

ALTER TABLE public.categorias_financeiro
  ADD COLUMN IF NOT EXISTS excluida BOOLEAN NOT NULL DEFAULT false;
