import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({ meta: [{ title: "Lançamentos" }] }),
  component: () => <Soon titulo="Lançamentos" descricao="Em breve: registre ração, probiótico e medicamentos em 3 cliques." />,
});

function Soon({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{titulo}</h1>
      <div className="p-10 rounded-2xl border-2 border-dashed text-center">
        <Construction className="size-12 mx-auto text-muted-foreground" />
        <p className="mt-3 text-muted-foreground">{descricao}</p>
      </div>
    </div>
  );
}
