import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vales")({
  component: ValesPage,
});

type Funcionario = { id: string; nome: string };
type Vale = {
  id: string;
  funcionario_id: string;
  valor: number;
  motivo: string | null;
  data_vale: string;
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ValesPage() {
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [vales, setVales] = useState<Vale[]>([]);
  const [funcId, setFuncId] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  async function load() {
    const { data: f } = await supabase.from("funcionarios").select("id,nome").eq("ativo", true).order("nome");
    setFuncs(f ?? []);
    const { data: v } = await supabase.from("vales").select("*").order("data_vale", { ascending: false });
    setVales(v ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!funcId || !valor) {
      toast.error("Selecione funcionário e valor");
      return;
    }
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("vales").insert({
      user_id: u.user!.id,
      funcionario_id: funcId,
      valor: Number(valor),
      motivo: motivo || null,
      data_vale: data,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setValor("");
    setMotivo("");
    toast.success("Vale registrado");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remover vale?")) return;
    await supabase.from("vales").delete().eq("id", id);
    load();
  }

  const porFunc = funcs.map((f) => {
    const list = vales.filter((v) => v.funcionario_id === f.id);
    const total = list.reduce((s, v) => s + Number(v.valor), 0);
    return { ...f, list, total };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vales</h1>
        <p className="text-sm text-muted-foreground">Adiantamentos para funcionários</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="size-4" /> Novo vale
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Funcionário</Label>
            <Select value={funcId} onValueChange={setFuncId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {funcs.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Motivo</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que o vale?" />
          </div>
          <Button onClick={add} disabled={loading} className="w-full">Registrar vale</Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {porFunc.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum funcionário cadastrado. Cadastre em Produtos → Funcionários.</p>
        )}
        {porFunc.map((f) => (
          <Card key={f.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{f.nome}</CardTitle>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="font-bold text-primary">{brl(f.total)}</div>
              </div>
            </CardHeader>
            <CardContent>
              {f.list.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem vales</p>
              ) : (
                <ul className="space-y-2">
                  {f.list.map((v) => (
                    <li key={v.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                      <div className="min-w-0">
                        <div className="font-medium">{brl(Number(v.valor))}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(v.data_vale + "T00:00").toLocaleDateString("pt-BR")}
                        </div>
                        {v.motivo && <div className="text-sm mt-1">{v.motivo}</div>}
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => remove(v.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
