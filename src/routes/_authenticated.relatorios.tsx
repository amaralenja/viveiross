import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios" }] }),
  component: () => (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Relatórios</h1>
      <div className="p-10 rounded-2xl border-2 border-dashed text-center">
        <Construction className="size-12 mx-auto text-muted-foreground" />
        <p className="mt-3 text-muted-foreground">
          Em breve: consumo, biomassa, FCA, custos — com exportação PDF/Excel.
        </p>
      </div>
    </div>
  ),
});
