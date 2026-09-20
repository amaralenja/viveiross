import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Shield, UserPlus, KeyRound, CalendarPlus, CalendarMinus, Trash2, Clock, AlertTriangle, Infinity as InfinityIcon, MessageCircle, Pencil, Check, Send, Copy, X, RotateCcw, Ban } from "lucide-react";
import {
  listUsersFn,
  createUserFn,
  updatePasswordFn,
  setExpiryFn,
  deleteUserFn,
  softDeleteUserFn,
  restoreUserFn,
  listDeletedUsersFn,
  setViveiroLimitFn,
  setWhatsappFn,
  resendAccessFn,
  listEnviosFn,
  type AdminUser,
  type DeletedUser,
} from "@/lib/admin.functions";

// Monta link do WhatsApp a partir de um número livre (só dígitos; assume BR se faltar DDI)
function waLink(raw: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = "55" + d; // adiciona DDI Brasil se veio só com DDD+numero
  return `https://wa.me/${d}`;
}

// URL do app (o domínio onde o admin está aberto). Fallback pro domínio de produção.
function appLink(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "https://viveiross.vercel.app";
}

// Mensagem pronta pra mandar no WhatsApp com o acesso da pessoa
function buildAccessMessage(email: string, password: string, link: string): string {
  return `🦐 *Viveiros — Seu acesso*\n\n🔗 Link: ${link}\n👤 E-mail: ${email}\n🔑 Senha: ${password}\n\nÉ só abrir o link e entrar com o e-mail e a senha acima. Qualquer dúvida, me chama!`;
}

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
  const setExpiry = useServerFn(setExpiryFn);
  const deleteUser = useServerFn(deleteUserFn);
  const softDelete = useServerFn(softDeleteUserFn);
  const restoreUser = useServerFn(restoreUserFn);
  const listDeleted = useServerFn(listDeletedUsersFn);
  const setViveiroLimit = useServerFn(setViveiroLimitFn);
  const setWhatsapp = useServerFn(setWhatsappFn);
  const resendAccess = useServerFn(resendAccessFn);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listUsers(),
    retry: false,
  });

  const { data: deletedUsers = [] } = useQuery({
    queryKey: ["admin", "deleted"],
    queryFn: () => listDeleted(),
    retry: false,
  });

  // Helpers de dias -> chama setExpiry com a data calculada
  const DAY = 86400000;
  const setExpiryDo = (user_id: string, iso: string | null, msg: string) =>
    setExpiry({ data: { user_id, expires_at: iso } })
      .then(() => { toast.success(msg); invalidate(); })
      .catch((e) => toast.error((e as Error).message));

  const listEnvios = useServerFn(listEnviosFn);
  const { data: envios = [] } = useQuery({
    queryKey: ["admin", "envios"],
    queryFn: () => listEnvios(),
    retry: false,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dias, setDias] = useState("30");
  const [whatsapp, setWhatsappInput] = useState("");
  // Credenciais recém-geradas (criação ou reenvio) pra montar a mensagem de acesso
  const [creds, setCreds] = useState<{ email: string; password: string; whatsapp: string | null } | null>(null);

  async function copyCredsMsg() {
    if (!creds) return;
    const msg = buildAccessMessage(creds.email, creds.password, appLink());
    try { await navigator.clipboard.writeText(msg); toast.success("Mensagem copiada!"); }
    catch { toast.error("Não consegui copiar — selecione o texto e copie manual."); }
  }
  function sendCredsWa() {
    if (!creds) return;
    const msg = buildAccessMessage(creds.email, creds.password, appLink());
    const wa = waLink(creds.whatsapp);
    const url = wa ? `${wa}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); qc.invalidateQueries({ queryKey: ["admin", "deleted"] }); qc.invalidateQueries({ queryKey: ["admin", "envios"] }); };

  const createMut = useMutation({
    mutationFn: () =>
      createUser({
        data: {
          email: email.trim(),
          password,
          dias: Number(dias) || 0,
          isAdmin: false,
          whatsapp: whatsapp.trim() || null,
        },
      }),
    onSuccess: (res: { emailed?: boolean; emailError?: string | null }) => {
      toast.success(res?.emailed ? "Usuário criado — e-mail enviado com a senha" : "Usuário criado");
      if (!res?.emailed && res?.emailError) toast.error(`E-mail não enviado: ${res.emailError}`, { duration: 15000 });
      // Guarda as credenciais pra montar a mensagem (a senha só existe em texto agora)
      setCreds({ email: email.trim(), password, whatsapp: whatsapp.trim() || null });
      setEmail(""); setPassword(""); setDias("30"); setWhatsappInput("");
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
            <input type="number" min="1" value={dias}
              onChange={(e) => setDias(e.target.value)}
              className="app-input" placeholder="ex: 30" />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">WhatsApp (opcional)</span>
            <input type="tel" value={whatsapp} onChange={(e) => setWhatsappInput(e.target.value)}
              className="app-input" placeholder="ex: (88) 99999-9999" />
          </label>
        </div>
        <button disabled={createMut.isPending}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
          {createMut.isPending ? "Criando..." : "Criar usuário"}
        </button>
      </form>

      {creds && (
        <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold inline-flex items-center gap-2"><Check className="size-5 text-emerald-600" /> Acesso pronto pra enviar</h3>
            <button onClick={() => setCreds(null)} title="Fechar" className="size-8 rounded-lg hover:bg-muted inline-flex items-center justify-center"><X className="size-4" /></button>
          </div>
          <p className="text-xs text-muted-foreground">Copie a mensagem e mande pra pessoa. A senha só aparece <strong>agora</strong> — depois fica protegida.</p>
          <textarea readOnly rows={7}
            value={buildAccessMessage(creds.email, creds.password, appLink())}
            onFocus={(e) => e.currentTarget.select()}
            className="app-input w-full text-sm font-mono resize-none leading-relaxed" />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={copyCredsMsg}
              className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-1.5">
              <Copy className="size-4" /> Copiar mensagem
            </button>
            <button onClick={sendCredsWa}
              className="h-11 rounded-xl bg-green-600 text-white font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-green-700">
              <MessageCircle className="size-4" /> Enviar no WhatsApp
            </button>
          </div>
        </div>
      )}

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
                onAddDays={(n) => {
                  const now = Date.now();
                  const curr = u.expires_at ? new Date(u.expires_at).getTime() : 0;
                  const base = Math.max(now, curr); // soma/subtrai a partir de hoje ou do vencimento futuro
                  const iso = new Date(base + n * DAY).toISOString();
                  setExpiryDo(u.user_id, iso, n >= 0 ? `+${n} dias liberados` : `${Math.abs(n)} dias removidos`);
                }}
                onSetDays={(n) => {
                  const iso = new Date(Date.now() + n * DAY).toISOString();
                  setExpiryDo(u.user_id, iso, `Acesso definido para ${n} dias`);
                }}
                onZerar={() => setExpiryDo(u.user_id, new Date().toISOString(), "Dias zerados — acesso bloqueado")}
                onResend={() =>
                  resendAccess({ data: { user_id: u.user_id, email: u.email } })
                    .then((r: { mode?: "senha" | "link"; emailed?: boolean; emailError?: string | null; password?: string | null }) => {
                      if (r?.mode === "link") {
                        toast.success("Enviado link de redefinição por e-mail (para gerar nova senha automática, configure SUPABASE_SERVICE_ROLE_KEY no Vercel).", { duration: 12000 });
                      } else if (r?.emailed) {
                        toast.success("Nova senha gerada e enviada por e-mail");
                      } else {
                        toast.success(`Nova senha: ${r?.password ?? "—"} — copie e envie manualmente.`, { duration: 15000 });
                        if (r?.emailError) toast.error(`E-mail não enviado: ${r.emailError}`, { duration: 15000 });
                      }
                      // Se veio uma nova senha em texto, prepara a mensagem pra copiar/enviar
                      if (r?.password) setCreds({ email: u.email, password: r.password, whatsapp: u.whatsapp });
                      invalidate();
                    })
                    .catch((e) => toast.error((e as Error).message))
                }
                onDelete={() =>
                  softDelete({ data: { user_id: u.user_id } })
                    .then(() => { toast.success("Movido pra Usuários apagados"); invalidate(); })
                    .catch((e) => toast.error((e as Error).message))
                }
                onViveiroLimit={(limite) =>
                  setViveiroLimit({ data: { user_id: u.user_id, limite } })
                    .then(() => { toast.success(limite ? `Limite de ${limite} viveiro(s)` : "Limite removido"); invalidate(); })
                    .catch((e) => toast.error((e as Error).message))
                }
                onSetWhatsapp={(wpp) =>
                  setWhatsapp({ data: { user_id: u.user_id, whatsapp: wpp } })
                    .then(() => { toast.success("WhatsApp salvo"); invalidate(); })
                    .catch((e) => toast.error((e as Error).message))
                }
              />
            ))}
          </div>
        )}
      </div>

      {deletedUsers.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2"><Trash2 className="size-5 text-muted-foreground" /> Usuários apagados ({deletedUsers.length})</h2>
            <p className="text-xs text-muted-foreground">Ficam guardados aqui. Você pode <span className="font-semibold">reativar</span> ou <span className="font-semibold">excluir de vez</span>.</p>
          </div>
          <div className="grid gap-2">
            {deletedUsers.map((u) => (
              <div key={u.user_id} className="rounded-2xl border bg-muted/30 p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{u.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Apagado em {u.deleted_at ? new Date(u.deleted_at).toLocaleString("pt-BR") : "—"} · {u.viveiros_ativos ?? 0} viveiro(s)
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() =>
                      restoreUser({ data: { user_id: u.user_id } })
                        .then(() => { toast.success("Usuário reativado"); invalidate(); })
                        .catch((e) => toast.error((e as Error).message))
                    }
                    className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5">
                    <RotateCcw className="size-4" /> Reativar
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Excluir DE VEZ ${u.email}? Some do painel do admin (os dados no banco permanecem). Não dá pra desfazer pela tela.`))
                        deleteUser({ data: { user_id: u.user_id } })
                          .then(() => { toast.success("Excluído de vez"); invalidate(); })
                          .catch((e) => toast.error((e as Error).message));
                    }}
                    className="h-10 px-3 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-destructive/10">
                    <Ban className="size-4" /> Excluir de vez
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="font-bold text-lg flex items-center gap-2"><Send className="size-5 text-primary" /> Envios de acesso ({envios.length})</h2>
        <p className="text-xs text-muted-foreground -mt-1">Para quem você já enviou o acesso, quando e como.</p>
        {envios.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum envio ainda.</p>
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            {envios.map((e, i) => (
              <div key={e.id} className={`flex items-center gap-3 p-3 ${i > 0 ? "border-t" : ""}`}>
                <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${e.emailed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                  {e.emailed ? <Check className="size-4" /> : <AlertTriangle className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{e.target_email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {e.tipo === "criacao" ? "Criação de acesso" : e.tipo.startsWith("reenvio") ? "Reenvio de acesso" : e.tipo}
                    {" · "}{new Date(e.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${e.emailed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
                  {e.emailed ? "E-mail enviado" : "Não enviado"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserCard({
  u, onPassword, onAddDays, onSetDays, onZerar, onResend, onDelete, onViveiroLimit, onSetWhatsapp,
}: {
  u: AdminUser;
  onPassword: () => void;
  onAddDays: (n: number) => void;
  onSetDays: (n: number) => void;
  onZerar: () => void;
  onResend: () => void;
  onDelete: () => void;
  onViveiroLimit: (limite: number | null) => void;
  onSetWhatsapp: (wpp: string | null) => void;
}) {
  const [customDays, setCustomDays] = useState("");
  const [editWpp, setEditWpp] = useState(false);
  const [wppInput, setWppInput] = useState(u.whatsapp ?? "");
  const wa = waLink(u.whatsapp);
  const dr = diasRestantes(u.expires_at);
  const aguardando = !u.is_admin && (!u.has_access || u.expires_at == null);
  const expirado = !aguardando && dr != null && dr <= 0;
  const acabando = dr != null && dr > 0 && dr <= 7;

  // Progresso: assume ciclo de 30 dias como referência
  const pct = u.is_admin
    ? 100
    : aguardando
      ? 0
      : dr == null
        ? 0
      : Math.max(0, Math.min(100, (dr / 30) * 100));

  const statusColor = u.is_admin
    ? "border-primary/40 bg-primary/5"
    : aguardando
      ? "border-amber-500/50 bg-amber-500/5"
    : expirado
      ? "border-destructive/50 bg-destructive/5"
      : acabando
        ? "border-amber-500/50 bg-amber-500/5"
        : "border-border";

  const barColor = aguardando
    ? "bg-amber-500"
    : expirado
    ? "bg-destructive"
    : acabando
      ? "bg-amber-500"
      : "bg-primary";

  return (
    <div className={`rounded-2xl border-2 p-4 space-y-3 transition-colors ${statusColor}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold truncate">{u.email}</p>
            {u.is_admin && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded inline-flex items-center gap-1">
                <InfinityIcon className="size-3" /> Admin
              </span>
            )}
            {expirado && !u.is_admin && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-destructive/10 text-destructive px-2 py-0.5 rounded inline-flex items-center gap-1">
                <AlertTriangle className="size-3" /> Expirado
              </span>
            )}
            {aguardando && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded inline-flex items-center gap-1">
                <Clock className="size-3" /> Aguardando liberação
              </span>
            )}
            {acabando && !u.is_admin && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded">
                Acabando
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {!u.is_admin && (
            <button onClick={() => { if (confirm(`Apagar ${u.email}? Ele vai pra "Usuários apagados" e pode ser reativado depois.`)) onDelete(); }}
              title="Apagar (vai pra Usuários apagados)"
              className="size-9 rounded-lg border text-destructive hover:bg-destructive/10 flex items-center justify-center">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Status de assinatura */}
      {u.is_admin ? (
        <div className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
          <InfinityIcon className="size-4" /> Acesso ilimitado (admin)
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="inline-flex items-center gap-1.5">
              <Clock className={`size-4 ${expirado ? "text-destructive" : acabando ? "text-amber-500" : "text-muted-foreground"}`} />
              <span className={`text-2xl font-bold tabular-nums ${expirado ? "text-destructive" : acabando ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {aguardando || expirado ? 0 : dr ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">
                {aguardando ? "dias — liberar conta" : expirado ? "dias — expirado" : "dias restantes"}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{aguardando ? "Sem acesso ativo" : formatDate(u.expires_at)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Controle de dias de acesso */}
      {!u.is_admin && (
        <div className="rounded-xl border bg-background/60 p-3 space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Dias de acesso</p>
          {aguardando && (
            <button onClick={() => onSetDays(30)}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-1.5">
              <Check className="size-4" /> Liberar conta por 30 dias
            </button>
          )}
          <div className="grid grid-cols-4 gap-1.5">
            <button onClick={() => onAddDays(30)}
              className="h-10 rounded-lg bg-emerald-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1 hover:bg-emerald-700">
              <CalendarPlus className="size-3.5" />30
            </button>
            <button onClick={() => onAddDays(7)}
              className="h-10 rounded-lg bg-emerald-600/90 text-white text-sm font-bold inline-flex items-center justify-center gap-1 hover:bg-emerald-700">
              <CalendarPlus className="size-3.5" />7
            </button>
            <button onClick={() => onAddDays(-7)}
              title="Diminuir 7 dias"
              className="h-10 rounded-lg border border-amber-500/50 text-amber-700 dark:text-amber-400 text-sm font-bold inline-flex items-center justify-center gap-1 hover:bg-amber-500/10">
              <CalendarMinus className="size-3.5" />7
            </button>
            <button onClick={() => { if (confirm(`Zerar os dias de ${u.email}? O acesso fica bloqueado na hora.`)) onZerar(); }}
              title="Zerar dias (bloqueia o acesso agora)"
              className="h-10 rounded-lg border border-destructive/50 text-destructive text-sm font-bold inline-flex items-center justify-center gap-1 hover:bg-destructive/10">
              <Ban className="size-3.5" />0
            </button>
          </div>
          <div className="flex gap-1.5">
            <input value={customDays} onChange={(e) => setCustomDays(e.target.value.replace(/[^0-9]/g, ""))}
              type="text" inputMode="numeric" className="app-input h-10 flex-1" placeholder="qtd. de dias" />
            <button onClick={() => { const n = Number(customDays) || 0; if (n > 0) { onSetDays(n); setCustomDays(""); } }}
              disabled={!customDays}
              className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold whitespace-nowrap disabled:opacity-40">
              Definir exato
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            <strong>+30/+7</strong> soma · <strong>−7</strong> diminui · <strong>0</strong> zera · <strong>Definir exato</strong> conta a partir de hoje.
          </p>
        </div>
      )}

      <div className="pt-1 border-t space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">🐟 Viveiros:</span>
          <span className="font-bold">{u.viveiros_ativos ?? 0} ativo(s)</span>
          {u.viveiro_limit != null
            ? <span className="text-muted-foreground">/ limite {u.viveiro_limit}</span>
            : <span className="text-muted-foreground">/ sem limite</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Liberar:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onViveiroLimit(Math.max(0, (u.viveiro_limit ?? (u.viveiros_ativos ?? 0)) - 1))}
              className="size-9 rounded-lg border font-bold text-lg flex items-center justify-center hover:bg-muted">−</button>
            <span className="w-12 text-center font-black text-lg tabular-nums">{u.viveiro_limit ?? "∞"}</span>
            <button
              onClick={() => onViveiroLimit((u.viveiro_limit ?? (u.viveiros_ativos ?? 0)) + 1)}
              className="size-9 rounded-lg border font-bold text-lg flex items-center justify-center hover:bg-muted">+</button>
          </div>
          <button onClick={() => onViveiroLimit(null)}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border hover:bg-muted">Sem limite</button>
        </div>
        <p className="text-[10px] text-muted-foreground">Diminuir o limite não apaga viveiros — os que passarem do limite ficam bloqueados até liberar de novo.</p>
      </div>

      {/* WhatsApp */}
      <div className="pt-1 border-t space-y-2">
        {editWpp ? (
          <div className="flex gap-2">
            <input value={wppInput} onChange={(e) => setWppInput(e.target.value)} type="tel" autoFocus
              className="app-input" placeholder="(88) 99999-9999" />
            <button onClick={() => { onSetWhatsapp(wppInput.trim() || null); setEditWpp(false); }}
              className="h-11 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1">
              <Check className="size-4" /> Salvar
            </button>
            <button onClick={() => { setWppInput(u.whatsapp ?? ""); setEditWpp(false); }}
              className="h-11 px-3 rounded-xl border text-sm">✕</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer"
                className="flex-1 h-10 px-3 rounded-xl bg-green-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-green-700">
                <MessageCircle className="size-4" /> Chamar no WhatsApp
              </a>
            ) : (
              <span className="flex-1 text-sm text-muted-foreground inline-flex items-center gap-1.5">
                <MessageCircle className="size-4" /> Sem WhatsApp
              </span>
            )}
            <button onClick={() => { setWppInput(u.whatsapp ?? ""); setEditWpp(true); }}
              title="Editar WhatsApp"
              className="size-10 rounded-xl border inline-flex items-center justify-center hover:bg-muted shrink-0">
              <Pencil className="size-4" />
            </button>
          </div>
        )}
        {u.whatsapp && !editWpp && <p className="text-[11px] text-muted-foreground pl-1">{u.whatsapp}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { if (confirm(`Gerar uma NOVA senha para ${u.email} e enviar por e-mail?`)) onResend(); }}
          className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1">
          <Send className="size-4" /> Reenviar acesso
        </button>
        <button
          onClick={onPassword}
          className="h-10 px-3 rounded-xl border text-sm font-semibold inline-flex items-center justify-center gap-1">
          <KeyRound className="size-4" /> Reset por link
        </button>
      </div>
    </div>
  );
}
