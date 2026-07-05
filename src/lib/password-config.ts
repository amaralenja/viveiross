import { useEffect, useState } from "react";

export type PwConfig = {
  enabled: boolean;
  pin: string;
  sections: string[]; // route paths that require lock, e.g. "/caixa"
};

export const LOCKABLE_SECTIONS: { path: string; label: string }[] = [
  { path: "/viveiros", label: "Viveiros" },
  { path: "/produtos", label: "Produtos" },
  { path: "/biometrias", label: "Biometria" },
  { path: "/caixa", label: "Caixa" },
  { path: "/relatorios", label: "Relatórios" },
  { path: "/vales", label: "Vales" },
  { path: "/caixa-simples", label: "Caixa Simples" },
];

const DEFAULT: PwConfig = { enabled: false, pin: "", sections: [] };

function key(userId: string | null | undefined) {
  return `pwcfg:${userId ?? "anon"}`;
}

export function loadPwConfig(userId: string | null | undefined): PwConfig {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<PwConfig>;
    return {
      enabled: !!parsed.enabled,
      pin: typeof parsed.pin === "string" ? parsed.pin : "",
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    };
  } catch {
    return DEFAULT;
  }
}

export function savePwConfig(userId: string | null | undefined, cfg: PwConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(userId), JSON.stringify(cfg));
  window.dispatchEvent(new CustomEvent("pwcfg:changed"));
}

export function usePwConfig(userId: string | null | undefined) {
  const [cfg, setCfg] = useState<PwConfig>(() => loadPwConfig(userId));
  useEffect(() => {
    setCfg(loadPwConfig(userId));
    const handler = () => setCfg(loadPwConfig(userId));
    window.addEventListener("pwcfg:changed", handler);
    return () => window.removeEventListener("pwcfg:changed", handler);
  }, [userId]);
  return cfg;
}

export function sectionRequiresLock(cfg: PwConfig, pathname: string) {
  if (!cfg.enabled || !cfg.pin || cfg.sections.length === 0) return false;
  return cfg.sections.some((s) => pathname.startsWith(s));
}
