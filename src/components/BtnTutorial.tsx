import { HelpCircle } from "lucide-react";
import { useTutorial } from "@/hooks/use-tutorial";

export function BtnTutorial({ videoId, label }: { videoId: string; label?: string }) {
  const { openTutorial } = useTutorial();
  return (
    <button onClick={() => openTutorial(videoId, label || "Tutorial")}
      className="h-9 px-3 rounded-xl bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/20 text-xs font-bold flex items-center gap-1.5 transition">
      <HelpCircle className="size-3.5"/> {label ? `Ver ${label}` : "Como funciona"}
    </button>
  );
}
