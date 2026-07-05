import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Shield, UserPlus, KeyRound, CalendarPlus, Trash2, ShieldCheck, ShieldOff } from "lucide-react";
import {
  listUsersFn,
  createUserFn,
  updatePasswordFn,
  setAccessFn,
  toggleAdminFn,
  deleteUserFn,
  type AdminUser,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administrador" }] }),
  component: AdminPage,
});

function formatDate(iso: string | null) {
  if (!iso) return "Ilimitado";
  return new Date(iso).toLocaleString("pt-BR");
}
function diasRestantes(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function AdminPage() {
  const qc = useQueryClient();
  const listUsers = useServerFn(listUsersFn);
  const createUser = useServerFn(createUserFn);
  const updatePassword = useServerFn(updatePasswordFn);
  const setAccess = useServerFn(setAccessFn);
  const toggleAdmin = useServerFn(toggleAdminFn);
  const deleteUser = useServerFn(deleteUserFn);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listUsers(),
    retry: false,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dias, setDias] = useState("30");
  const [isAdminNew, setIsAdminNew] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "users"] });

  const createMut = useMutation({
    mutationFn: () =>
      createUser({
        data: {
          email: email.trim(),
          password,
          dias: isAdminNew ? null : Number(dias) || 0,
          isAdmin: isAdminNew,
        },
      }),
    onSuccess: () => {
      toast.success("Usuário criado");
      setEmail(""); setPassword(""); setDias("30"); setIsAdminNew(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) {
    return (
      <div className="rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-8 text-center">
        <Shield className="mx-auto size-10 text-destructive" />
        <h2 className="mt-3 text-lg font-bold">Acesso restrito</h2>
        <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="size-7 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Administrador</h1>
          <p className="text-muted-foreground text-sm">Gerencie usuários, senhas e dias de acesso.</p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}
        className="rounded-2xl border bg-card p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="size-5 text-primary" />
          <h2 className="font-bold">Criar novo usuário</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">E-mail</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="app-input" placeholder="pessoa@exemplo.com" />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Senha</span>
            <input required minLength={6} type="text" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="app-input" placeholder="mín. 6 caracteres" />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Dias de acesso</span>
            <input type="number" min="1" value={dias} disabled={isAdminNew}
              onChange={(e) => setDias(e.target.value)}
              className="app-input disabled:opacity-50" placeholder="ex: 30" />
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={isAdminNew}
              onChange={(e) => setIsAdminNew(e.target.checked)} className="size-5 accent-primary" />
            <span className="text-sm font-medium">Criar como admin (ilimitado)</span>
          </label>
        </div>
        <button disabled={createMut.isPending}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
          {createMut.isPending ? "Criando..." : "Criar usuário"}
        </button>
      </form>

      <div className="space-y-3">
        <h2 className="font-bold text-lg">Usuários ({users.length})</h2>
        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : users.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
            Nenhum usuário ainda.
          </p>
        ) : (
          <div className="grid gap-3">
            {users.map((u) => (
              <UserCard
                key={u.user_id}
                u={u}
                onPassword={() =>
                  updatePassword({ data: { user_id: u.user_id, email: u.email } })
                    .then(() => toast.success("E-mail de reset enviado"))
                    .catch((e) => toast.error((e as Error).message))
                }
                onAddDays={(n) =>
                  setAccess({ data: { user_id: u.user_id, dias: n, addDays: true } })
                    .then(() => { toast.success(`+${n} dias liberados`); invalidate(); })
                    .catch((e) => toast.error((e as Error).message))
                }
                onSetDays={(n) =>
                  setAccess({ data: { user_id: u.user_id, dias: n, addDays: false } })
                    .then(() => { toast.success(`Acesso definido para ${n} dias`); invalidate(); })
                    .catch((e) => toast.error((e as Error).message))
                }
                onUnlimited={() =>
                  setAccess({ data: { user_id: u.user_id, dias: null } })
                    .then(() => { toast.success("Acesso ilimitado"); invalidate(); })
                    .catch((e) => toast.error((e as Error).message))
                }
                onToggleAdmin={() =>
                  toggleAdmin({ data: { user_id: u.user_id, is_admin: !u.is_admin } })
                    .then(() => { toast.success(u.is_admin ? "Admin removido" : "Agora é admin"); invalidate(); })
                    .catch((e) => toast.error((e as Error).message))
                }
                onDelete={() =>
                  deleteUser({ data: { user_id: u.user_id } })
                    .then(() => { toast.success("Usuário removido"); invalidate(); })
                    .catch((e) => toast.error((e as Error).message))
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserCard({
  u, onPassword, onAddDays, onSetDays, onUnlimited, onToggleAdmin, onDelete,
}: {
  u: AdminUser;
  onPassword: (p: string) => void;
  onAddDays: (n: number) => void;
  onSetDays: (n: number) => void;
  onUnlimited: () => void;
  onToggleAdmin: () => void;
  onDelete: () => void;
}) {
  const [newPwd, setNewPwd] = useState("");
  const [addN, setAddN] = useState("30");
  const dr = diasRestantes(u.expires_at);
  const expirado = dr != null && dr <= 0;

  return (
    <div className={`rounded-2xl border bg-card p-4 space-y-3 ${expirado ? "border-destructive/50" : ""}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold truncate">{u.email}</p>
            {u.is_admin && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded">Admin</span>
            )}
            {expirado && !u.is_admin && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-destructive/10 text-destructive px-2 py-0.5 rounded">Expirado</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Expira: <span className="font-semibold">{formatDate(u.expires_at)}</span>
            {dr != null && !u.is_admin && (
              <> · <span className={expirado ? "text-destructive" : ""}>
                {expirado ? "expirado" : `${dr} dias restantes`}
              </span></>
            )}
          </p>
        </div>
        <div className="flex gap-1">
          <button onClick={onToggleAdmin}
            title={u.is_admin ? "Remover admin" : "Tornar admin"}
            className="size-9 rounded-lg border hover:bg-accent flex items-center justify-center">
            {u.is_admin ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
          </button>
          <button onClick={() => { if (confirm(`Remover ${u.email}?`)) onDelete(); }}
            title="Remover usuário"
            className="size-9 rounded-lg border text-destructive hover:bg-destructive/10 flex items-center justify-center">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex gap-2">
          <input value={addN} onChange={(e) => setAddN(e.target.value)}
            type="number" min="1" className="app-input" placeholder="dias" />
          <button onClick={() => onAddDays(Number(addN) || 0)}
            className="h-11 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1">
            <CalendarPlus className="size-4" /> Somar
          </button>
          <button onClick={() => onSetDays(Number(addN) || 0)}
            className="h-11 px-3 rounded-xl border text-sm font-semibold whitespace-nowrap">
            Definir
          </button>
        </div>
        <div className="flex gap-2">
          <input value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
            type="text" className="app-input" placeholder="nova senha (mín. 6)" />
          <button
            onClick={() => {
              if (newPwd.length < 6) { toast.error("Mín. 6 caracteres"); return; }
              onPassword(newPwd); setNewPwd("");
            }}
            className="h-11 px-3 rounded-xl border text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1">
            <KeyRound className="size-4" /> Trocar
          </button>
        </div>
      </div>

      {!u.is_admin && (
        <button onClick={onUnlimited}
          className="text-xs font-medium text-primary hover:underline">
          Tornar acesso ilimitado
        </button>
      )}
    </div>
  );
}
