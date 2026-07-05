import { useState } from "react";
import { Delete, Lock } from "lucide-react";

const KEY = "app_unlocked";

export function isUnlocked() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(KEY) === "1";
}

export function lockApp() {
  if (typeof window !== "undefined") sessionStorage.removeItem(KEY);
}

export function PasswordLock({ pin, onUnlock }: { pin: string; onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const len = Math.max(pin.length, 4);

  function press(d: string) {
    setError(false);
    const next = (value + d).slice(0, len);
    setValue(next);
    if (next.length === pin.length) {
      if (next === pin) {
        sessionStorage.setItem(KEY, "1");
        onUnlock();
      } else {
        setError(true);
        setTimeout(() => setValue(""), 400);
      }
    }
  }

  function clear() {
    setError(false);
    setValue("");
  }

  function back() {
    setError(false);
    setValue((v) => v.slice(0, -1));
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Lock className="size-7" />
        </div>
        <h2 className="text-xl font-bold">Digite a senha</h2>
        <div className={`flex gap-3 ${error ? "animate-pulse" : ""}`}>
          {Array.from({ length: len }).map((_, i) => (
            <div
              key={i}
              className={`size-4 rounded-full border-2 ${
                value.length > i
                  ? error
                    ? "bg-destructive border-destructive"
                    : "bg-primary border-primary"
                  : "border-muted-foreground/40"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            className="h-16 rounded-2xl bg-card border text-2xl font-semibold hover:bg-muted active:scale-95 transition"
          >
            {k}
          </button>
        ))}
        <button
          onClick={clear}
          className="h-16 rounded-2xl bg-card border text-sm font-medium text-muted-foreground hover:bg-muted active:scale-95 transition"
        >
          Limpar
        </button>
        <button
          onClick={() => press("0")}
          className="h-16 rounded-2xl bg-card border text-2xl font-semibold hover:bg-muted active:scale-95 transition"
        >
          0
        </button>
        <button
          onClick={back}
          className="h-16 rounded-2xl bg-card border flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition"
        >
          <Delete className="size-5" />
        </button>
      </div>
    </div>
  );
}
