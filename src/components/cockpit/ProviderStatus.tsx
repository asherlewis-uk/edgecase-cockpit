import { Link } from "@tanstack/react-router";
import { CheckCircle2, AlertCircle, Settings as SettingsIcon } from "lucide-react";
import { useStore, resolveProvider, isProviderReady } from "@/lib/cockpit-store";

type Props = {
  variant?: "pill" | "bar";
  onOpenSettings?: () => void;
};

export function ProviderStatus({ variant = "pill", onOpenSettings }: Props) {
  const settings = useStore((s) => s.settings);
  const { provider, model } = resolveProvider(settings);
  const ok = isProviderReady(settings);
  const Icon = ok ? CheckCircle2 : AlertCircle;
  const tone = ok
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
    : "border-amber-400/30 bg-amber-400/10 text-amber-100";

  const inner = (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${tone}`}
      title={`${provider.name} · ${model}`}
    >
      <Icon className="size-3.5" />
      <span className="font-medium">{provider.name}</span>
      <span className="text-white/50">·</span>
      <span className="truncate max-w-[18ch] text-white/80">
        {ok ? model : provider.needsApiKey ? "set API key" : "ready"}
      </span>
    </span>
  );

  if (variant === "bar") {
    return (
      <div className="flex items-center gap-2">
        {inner}
        {onOpenSettings ? (
          <button
            onClick={onOpenSettings}
            className="grid size-8 place-items-center rounded-full bg-white/[0.06] text-white/80 hover:bg-white/[0.12]"
            aria-label="Open settings"
          >
            <SettingsIcon className="size-4" />
          </button>
        ) : (
          <Link
            to="/settings"
            className="grid size-8 place-items-center rounded-full bg-white/[0.06] text-white/80 hover:bg-white/[0.12]"
            aria-label="Open settings"
          >
            <SettingsIcon className="size-4" />
          </Link>
        )}
      </div>
    );
  }
  return onOpenSettings ? (
    <button onClick={onOpenSettings}>{inner}</button>
  ) : (
    <Link to="/settings">{inner}</Link>
  );
}