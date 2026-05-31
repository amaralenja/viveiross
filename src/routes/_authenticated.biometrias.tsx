import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/_authenticated/biometrias")({
  head: () => ({ meta: [{ title: "Biometrias" }] }),
  component: () => (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Biometrias</h1>
      <div className="p-10 rounded-2xl border-2 border-dashed text-center">
        <Construction className="size-12 mx-auto text-muted-foreground" />
        <p className="mt-3 text-muted-foreground">
          Em breve: peso médio, sobrevivência e cálculos automáticos de biomassa/FCA.
        </p>
      </div>
    </div>
  ),
});
