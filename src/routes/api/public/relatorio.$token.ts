import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { RelatorioBundle } from "@/lib/relatorios-calc";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/relatorio/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token) return new Response("Missing token", { status: 400 });

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Configuração do relatório indisponível", { status: 500 });
        }

        const supabasePublic = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: bundle, error } = await supabasePublic.rpc("get_relatorio_share_bundle", {
          _token: token,
        });

        if (error) return new Response(error.message, { status: 500 });
        if (!bundle) return new Response("Link inválido ou expirado", { status: 404 });

        return Response.json(bundle as RelatorioBundle & { titulo: string | null; createdAt: string }, {
          headers: { "Cache-Control": "public, max-age=60" },
        });
      },
    },
  },
});
