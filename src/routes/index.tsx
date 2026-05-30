import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bem-vindo" },
      { name: "description", content: "Tela de boas-vindas do app." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight text-foreground">
          Bem-vindo
        </h1>
        <p className="text-lg text-muted-foreground">
          Que bom ter você aqui. Vamos começar?
        </p>
      </div>
    </main>
  );
}
