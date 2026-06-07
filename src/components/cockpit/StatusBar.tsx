import { WifiOff } from "lucide-react";

export function StatusBar({ isOnline, queueSize }: { isOnline: boolean; queueSize: number }) {
  if (isOnline && queueSize === 0) return null;

  return (
    <div className="relative z-20 mx-3 mt-2 flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-100">
      <WifiOff className="size-3.5" />
      <span>
        {isOnline ? "Back online" : "You're offline"}
        {queueSize > 0 && ` — ${queueSize} queued`}
      </span>
    </div>
  );
}
