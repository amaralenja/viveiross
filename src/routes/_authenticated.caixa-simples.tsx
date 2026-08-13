import { createFileRoute, redirect } from "@tanstack/react-router";

// A antiga aba "Caixa Simples" foi unificada dentro de "Financeiro".
// Mantemos a rota só pra redirecionar links/atalhos antigos.
export const Route = createFileRoute("/_authenticated/caixa-simples")({
  beforeLoad: () => {
    throw redirect({ to: "/financeiro" });
  },
});
