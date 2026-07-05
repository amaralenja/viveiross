import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Lock, Unlock, Save } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  LOCKABLE_SECTIONS,
  loadPwConfig,
  savePwConfig,
} from "@/lib/password-config";
import { lockApp } from "@/components/PasswordLock";

export const Route = createFileRoute("/_authenticated/senhas")({
  head: () => ({ meta: [{ title: "Senhas" }] }),
  component: SenhasPage,
});

function SenhasPage() {
  const { user } = useAuth();
  const initial = loadPwConfig(user?.id);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [pin, setPin] = useState(initial.pin);
  const [sections, setSections] = useState<string[]>(initial.sections);

  function toggleSection(path: string) {
    setSections((s) =>
      s.includes(path) ? s.filter((x) => x !== path) : [...s, path],
    );
  }

  function save() {
    if (enabled) {
      if (!/^\d{4,8}$/.test(pin)) {
        toast.error("A senha deve ter de 4 a 8 dígitos numéricos.");
        return;
      }
      if (sections.length === 0) {
        toast.error("Escolha ao menos uma aba para proteger.");
        return;
      }
    }
    savePwConfig(user?.id, { enabled, pin, sections });
    lockApp(); // força re-digitar após mudar a config
    toast.success("Configurações salvas");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <KeyRound className="size-7 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Senhas</h1>
          <p className="text-muted-foreground text-sm">
            Escolha sua senha e onde ela protege.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <label className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {enabled ? (
              <Lock className="size-5 text-primary" />
            ) : (
              <Unlock className="size-5 text-muted-foreground" />
            )}
            <div>
              <div className="font-semibold">Proteção por senha</div>
              <div className="text-xs text-muted-foreground">
                Desativada por padrão.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-6 accent-primary"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium block mb-1.5">
            Sua senha (4 a 8 dígitos)
          </span>
          <input
            inputMode="numeric"
            pattern="\d*"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            disabled={!enabled}
            className="app-input tracking-widest text-lg disabled:opacity-50"
            placeholder="••••"
          />
        </label>
      </div>

      <div className="rounded-2xl border bg-card p-5 space-y-3">
        <div>
          <h2 className="font-bold">Onde exigir senha</h2>
          <p className="text-xs text-muted-foreground">
            Marque só as abas que você quer proteger.
          </p>
        </div>
        <div className="grid gap-2">
          {LOCKABLE_SECTIONS.map((s) => {
            const on = sections.includes(s.path);
            return (
              <button
                key={s.path}
                type="button"
                disabled={!enabled}
                onClick={() => toggleSection(s.path)}
                className={`flex items-center justify-between rounded-xl border-2 p-4 text-left transition ${
                  on
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent"
                } disabled:opacity-50`}
              >
                <span className="font-medium">{s.label}</span>
                <span
                  className={`size-6 rounded-md border-2 flex items-center justify-center ${
                    on
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={save}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2"
      >
        <Save className="size-5" /> Salvar
      </button>
    </div>
  );
}
