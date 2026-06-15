import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  AlertCircle,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import {
  useStore,
  resolveProvider,
  isProviderReady,
  getProviderValidationStatus,
} from "@/lib/cockpit-store";

type Props = {
  variant?: "pill" | "bar";
  onOpenSettings?: () => void;
};

export function ProviderStatus({ variant = "pill", onOpenSettings }: Props) {
  const settings = useStore((s) => s.settings);
  const { provider, model } = resolveProvider(settings);
  const ok = isProviderReady(settings);
  const validationStatus = useStore((s) => getProviderValidationStatus(provider.id));

  // Determine icon and tone based on validation status
  let Icon = ok ? CheckCircle2 : AlertCircle;
  let tone = ok
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
    : "border-amber-400/30 bg-amber-400/10 text-amber-100";

  if (validationStatus.status === "valid") {
    Icon = ShieldCheck;
    tone = "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  } else if (validationStatus.status === "invalid") {
    Icon = ShieldX;
    tone = "border-red-400/30 bg-red-400/10 text-red-200";
  } else if (validationStatus.status === "error") {
    Icon = ShieldAlert;
    tone = "border-amber-400/30 bg-amber-400/10 text-amber-200";
  }

  const inner = (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${tone}`}
      title={`${provider.name} · ${model}`}
    >
      <Icon className="size-3.5" />
      <span className="font-medium">{provider.name}</span>
      <span className="text-white/50">·</span>
      <span className="truncate max-w-[18ch] text-white/80">
        {validationStatus.status === "validating"
          ? "validating..."
          : validationStatus.status === "valid"
            ? model
            : validationStatus.status === "invalid"
              ? "invalid key"
              : validationStatus.status === "error"
                ? (validationStatus.message ?? "error")
                : ok
                  ? model
                  : provider.needsApiKey
                    ? "set API key"
                    : "ready"}
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
