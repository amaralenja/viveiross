import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/p/$token")({
  component: PdfRedirect,
});

function PdfRedirect() {
  const { token } = Route.useParams();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_pdf_share", { _token: token });
      const d = data as { signed_url?: string } | null;
      if (error || !d?.signed_url) {
        setErr("Link inválido ou expirado.");
        return;
      }
      window.location.replace(d.signed_url);
    })();
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <p className="text-muted-foreground">{err ?? "Abrindo PDF..."}</p>
    </div>
  );
}
