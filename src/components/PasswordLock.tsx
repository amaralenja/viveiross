import { useState } from "react";
import { Delete, Lock } from "lucide-react";

const UNLOCKED_SECTIONS_KEY = "app_unlocked_sections";

export function isSectionUnlocked(sectionPath?: string) {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(UNLOCKED_SECTIONS_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return false;
    if (!sectionPath) return list.length > 0;
    return list.some((s) => sectionPath === s || sectionPath.startsWith(s + "/"));
  } catch {
    return false;
  }
}

export function isUnlocked() {
  return isSectionUnlocked();
}

export function unlockSection(sectionPath: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(UNLOCKED_SECTIONS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(sectionPath)) {
      list.push(sectionPath);
      localStorage.setItem(UNLOCKED_SECTIONS_KEY, JSON.stringify(list));
    }
  } catch {
    localStorage.setItem(UNLOCKED_SECTIONS_KEY, JSON.stringify([sectionPath]));
  }
}

export function lockApp() {
  if (typeof window !== "undefined") {
    // Clear unlocked sections but keep other config; this prevents forced re‑login on every save.
    localStorage.removeItem(UNLOCKED_SECTIONS_KEY);
    // Optionally clear a flag that indicates the app is currently unlocked.
    localStorage.removeItem("app_unlocked");
    window.dispatchEvent(new CustomEvent("pwcfg:changed"));
  }
}

export function PasswordLock({
  pin,
  sectionPath,
  onUnlock,
}: {
  pin: string;
  sectionPath?: string;
  onUnlock: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const len = Math.max(pin.length, 4);

  function press(d: string) {
    setError(false);
    const next = (value + d).slice(0, len);
    setValue(next);
    if (next.length === pin.length) {
      if (next === pin) {
        if (sectionPath) unlockSection(sectionPath);
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
