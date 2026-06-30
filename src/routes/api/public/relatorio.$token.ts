import { createFileRoute } from "@tanstack/react-router";
import type { RelatorioBundle } from "@/lib/relatorios-calc";

export const Route = createFileRoute("/api/public/relatorio/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token) return new Response("Missing token", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: share, error: shareErr } = await supabaseAdmin
          .from("relatorio_shares")
          .select("user_id, viveiro_ids, titulo, created_at")
          .eq("token", token)
          .maybeSingle();

        if (shareErr) return new Response(shareErr.message, { status: 500 });
        if (!share) return new Response("Link inválido ou expirado", { status: 404 });

        const userId = share.user_id;
        const filtroIds = (share.viveiro_ids as string[] | null) ?? null;

        let qViv = supabaseAdmin
          .from("viveiros")
          .select("id, nome, qtd_povoada, data_povoamento, status, fornecedor, fazendas(nome)")
          .eq("user_id", userId);
        if (filtroIds && filtroIds.length > 0) qViv = qViv.in("id", filtroIds);

        const { data: viveiros, error: e1 } = await qViv.order("nome");
        if (e1) return new Response(e1.message, { status: 500 });
        const vivIds = (viveiros ?? []).map((v) => v.id);

        const [lancs, bios, desps, funcs, caixa] = await Promise.all([
          supabaseAdmin.from("lancamentos")
            .select("id, viveiro_id, produto_nome, quantidade, unidade, tipo, custo_total, preco_unidade, data_lancamento")
            .eq("user_id", userId).in("viveiro_id", vivIds.length ? vivIds : ["00000000-0000-0000-0000-000000000000"]),
          supabaseAdmin.from("biometrias")
            .select("id, viveiro_id, data_biometria, peso_medio_g, amostras, sobrevivencia_percent")
            .eq("user_id", userId).in("viveiro_id", vivIds.length ? vivIds : ["00000000-0000-0000-0000-000000000000"])
            .order("data_biometria", { ascending: false }),
          supabaseAdmin.from("despesas_gerais")
            .select("id, viveiro_id, descricao, categoria, valor, data_despesa, rateio")
            .eq("user_id", userId),
          supabaseAdmin.from("funcionarios")
            .select("id, nome, salario, ativo, viveiro_id, observacao")
            .eq("user_id", userId),
          supabaseAdmin.from("caixa_lancamentos")
            .select("id, viveiro_id, data_lancamento, descricao, categoria, tipo, valor, quantidade, unidade, observacao")
            .eq("user_id", userId),
        ]);

        const funcIds = (funcs.data ?? []).map((f) => f.id);
        const { data: vales } = funcIds.length
          ? await supabaseAdmin.from("vales")
              .select("id, funcionario_id, valor, motivo, data_vale")
              .in("funcionario_id", funcIds)
          : { data: [] as Array<{ id: string; funcionario_id: string; valor: number; motivo: string | null; data_vale: string }> };

        // Despesas rateadas (todos) vêm também quando há filtro de viveiros, mas as individuais filtramos pelos ids alvo
        const despesasAll = (desps.data ?? []);
        const despesasFiltradas = filtroIds && filtroIds.length > 0
          ? despesasAll.filter((d) => d.rateio === "todos" || d.viveiro_id == null || filtroIds.includes(d.viveiro_id ?? ""))
          : despesasAll;

        const bundle: RelatorioBundle & { titulo: string | null; createdAt: string } = {
          viveiros: (viveiros ?? []) as RelatorioBundle["viveiros"],
          lancamentos: (lancs.data ?? []) as RelatorioBundle["lancamentos"],
          biometrias: (bios.data ?? []) as RelatorioBundle["biometrias"],
          despesas: despesasFiltradas as RelatorioBundle["despesas"],
          funcionarios: (funcs.data ?? []) as RelatorioBundle["funcionarios"],
          vales: (vales ?? []) as RelatorioBundle["vales"],
          caixa: (caixa.data ?? []) as RelatorioBundle["caixa"],
          titulo: share.titulo ?? null,
          createdAt: share.created_at as string,
        };

        return Response.json(bundle, {
          headers: { "Cache-Control": "public, max-age=60" },
        });
      },
    },
  },
});
