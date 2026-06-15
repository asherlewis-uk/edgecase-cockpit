import { AlertCircle, WifiOff } from "lucide-react";

export function StatusBar({
  isOnline,
  queueSize,
  ragError,
}: {
  isOnline: boolean;
  queueSize: number;
  ragError?: string | null;
}) {
  if (isOnline && queueSize === 0 && !ragError) return null;

  const showOffline = !isOnline || queueSize > 0;

  return (
    <div className="relative z-20 mx-3 mt-2 flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-100">
      {showOffline && (
        <>
          <WifiOff className="size-3.5" />
          <span>
            {isOnline ? "Back online" : "You're offline"}
            {queueSize > 0 && ` — ${queueSize} message${queueSize === 1 ? '' : 's'} queued`}
          </span>
        </>
      )}
      {ragError && (
        <span className={showOffline ? "border-l border-amber-400/30 pl-2" : ""}>
          <AlertCircle className="mr-1 inline size-3.5" />
          {ragError}
        </span>
      )}
    </div>
  );
}
