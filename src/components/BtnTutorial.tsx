import { HelpCircle } from "lucide-react";
import { useTutorial } from "@/hooks/use-tutorial";

export function BtnTutorial({ videoId, label }: { videoId: string; label?: string }) {
  const { openTutorial } = useTutorial();
  return (
    <button onClick={() => openTutorial(videoId, label || "Tutorial")}
      className="h-9 px-3.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold flex items-center gap-1.5 transition-colors">
      <HelpCircle className="size-4"/> {label ? `Ver ${label}` : "Tutorial"}
    </button>
  );
}
