import { useEffect, useState } from "react";

export type PwConfig = {
  enabled: boolean;
  pin: string;
  sections: string[]; // route paths that require lock, e.g. "/caixa"
};

export const LOCKABLE_SECTIONS: { path: string; label: string }[] = [
  { path: "/dashboard", label: "Início" },
  { path: "/viveiros", label: "Viveiros" },
  { path: "/produtos", label: "Produtos" },
  { path: "/caixa", label: "Caixa" },
  { path: "/relatorios", label: "Relatórios" },
  { path: "/financeiro", label: "Financeiro" },
  { path: "/admin", label: "Administrador" },
];

const DEFAULT: PwConfig = { enabled: false, pin: "", sections: [] };

function keys(userId: string | null | undefined): string[] {
  const list = ["pwcfg:global", "pwcfg:anon"];
  if (userId) list.unshift(`pwcfg:${userId}`);
  return list;
}

export function loadPwConfig(userId: string | null | undefined): PwConfig {
  if (typeof window === "undefined") return DEFAULT;
  for (const k of keys(userId)) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<PwConfig>;
      if (typeof parsed.enabled === "boolean") {
        return {
          enabled: !!parsed.enabled,
          pin: typeof parsed.pin === "string" ? parsed.pin : "",
          sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        };
      }
    } catch {
      /* ignore */
    }
  }
  return DEFAULT;
}

export function savePwConfig(userId: string | null | undefined, cfg: PwConfig) {
  if (typeof window === "undefined") return;
  const json = JSON.stringify(cfg);
  localStorage.setItem("pwcfg:global", json);
  localStorage.setItem("pwcfg:anon", json);
  if (userId) localStorage.setItem(`pwcfg:${userId}`, json);
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
  return cfg.sections.some((s) => pathname === s || pathname.startsWith(s + "/"));
}
