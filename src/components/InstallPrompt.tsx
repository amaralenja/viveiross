

import { useEffect, useState } from "react";
import { Fish, X, Share, Plus } from "lucide-react";

const SESSION_KEY = "viveiros_install_prompt_dismissed";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isIOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    const iosDevice = isIOS();
    setIos(iosDevice);

    if (iosDevice) {
      // iOS doesn't fire beforeinstallprompt — show instructions directly
      setShow(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, "1");
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pointer-events-none">
      <div className="mx-auto max-w-md rounded-2xl border bg-card shadow-2xl p-4 pointer-events-auto relative">
        <button
          onClick={dismiss}
          aria-label="Fechar"
          className="absolute top-2 right-2 p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="size-12 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Fish className="size-6" />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="font-bold text-base">Instale o Viveiros</h3>
            {ios ? (
              <p className="text-sm text-muted-foreground mt-1">
                Toque em <Share className="inline size-4 mx-0.5" /> e depois em{" "}
                <span className="inline-flex items-center gap-0.5 font-medium">
                  <Plus className="inline size-3.5" /> Adicionar à Tela de Início
                </span>
                .
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                Tenha acesso rápido como um aplicativo no seu celular.
              </p>
            )}
            {!ios && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={install}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
                >
                  Instalar
                </button>
                <button
                  onClick={dismiss}
                  className="h-10 px-4 rounded-xl border text-sm font-medium"
                >
                  Agora não
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
