import { createFileRoute, redirect } from "@tanstack/react-router";

// Biometria agora é feita dentro da aba de Viveiros (botão "Fazer biometria").
// Mantido só como redirect pra não quebrar links antigos.
export const Route = createFileRoute("/_authenticated/biometrias")({
  beforeLoad: () => {
    throw redirect({ to: "/viveiros" });
  },
});
