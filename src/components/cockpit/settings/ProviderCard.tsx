import { useState } from "react";
import { apiFetch, isNativeContext } from "@/lib/api-base";
import {
  Check,
  Pin,
  PinOff,
  Wifi,
  WifiOff,
  KeyRound,
  Trash2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import {
  useStore,
  store,
  refreshProviderKeyStatus,
  isProviderReady,
  csrfHeaders,
  getProviderValidationStatus,
  setProviderValidationStatus,
} from "@/lib/cockpit-store";
import { type ProviderDef, type Capability, type DetectResult } from "@/lib/providers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const CAP_LABELS: Record<Capability, string> = {
  chat: "Chat",
  embeddings: "Embeddings",
  vision: "Vision",
  tools: "Tools",
  streamingTools: "Streaming Tools",
};

export function ProviderCard({
  p,
  isActive,
  detected,
  hasServerKey,
}: {
  p: ProviderDef;
  isActive: boolean;
  detected?: DetectResult;
  hasServerKey?: boolean;
}) {
  const settings = useStore((s) => s.settings);
  const cfg = settings.providers[p.id] ?? { apiKey: "" };
  const ready = isProviderReady(settings, p.id);
  const pinned = settings.pinnedProviderIds.includes(p.id);
  const [keyDraft, setKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const validationStatus = useStore((s) => getProviderValidationStatus(p.id));

  const saveKey = async () => {
    if (!keyDraft.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/api/keys/set", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({
          providerId: p.id,
          apiKey: keyDraft.trim(),
          baseUrl: cfg.baseUrl,
          model: cfg.model,
        }),
      });
      setKeyDraft("");
      await refreshProviderKeyStatus();
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/keys/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ providerId: p.id }),
      });
      await refreshProviderKeyStatus();
      clearValidationStatus();
    } finally {
      setSaving(false);
    }
  };

  const clearValidationStatus = () => {
    setProviderValidationStatus(p.id, { status: "idle" });
  };

  const validateKey = async () => {
    if (!hasServerKey) {
      setProviderValidationStatus(p.id, {
        status: "error",
        message: "No API key set to validate",
        errorType: "auth_failed",
      });
      return;
    }

    setValidating(true);
    setProviderValidationStatus(p.id, { status: "validating" });

    try {
      const res = await apiFetch("/api/keys/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ providerIds: [p.id] }),
      });

      if (res.ok) {
        const data = await res.json();
        const result = data.results[p.id];

        if (result?.valid) {
          setProviderValidationStatus(p.id, {
            status: "valid",
            message: "API key is valid",
          });
        } else {
          setProviderValidationStatus(p.id, {
            status: "invalid",
            message: result?.userMessage ?? "Invalid API key",
            errorType: result?.errorType ?? "auth_failed",
          });
        }
      } else {
        setProviderValidationStatus(p.id, {
          status: "error",
          message: "Failed to validate key",
          errorType: "unknown",
        });
      }
    } catch (error) {
      setProviderValidationStatus(p.id, {
        status: "error",
        message: "Network error during validation",
        errorType: "network_error",
      });
    } finally {
      setValidating(false);
    }
  };

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 transition ${
        isActive ? "border-white/30 bg-white/[0.06]" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-xs font-semibold text-black ${p.accent}`}
        >
          {p.badge}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-medium text-white">{p.name}</span>
            {p.type === "local" && p.detectUrl && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                  detected?.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/50"
                }`}
                title={
                  detected?.ok
                    ? `Reachable from server (status ${detected.status ?? "ok"})`
                    : detected
                      ? `Unreachable from server: ${detected.error ?? `status ${detected.status}`}. Local daemons on your machine aren't reachable from the hosted server — keys/URL still work when this app runs on the same host.`
                      : "Checking…"
                }
              >
                {detected?.ok ? <Wifi className="size-2.5" /> : <WifiOff className="size-2.5" />}
                {detected?.ok ? "live" : detected ? "unreachable" : "checking"}
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-white/55">{p.description}</p>
        </div>
        <button
          onClick={() => store.togglePinned(p.id)}
          className="text-white/40 hover:text-amber-300"
          aria-label={pinned ? "Unpin" : "Pin"}
          title={pinned ? "Unpin" : "Pin"}
        >
          {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(Object.keys(CAP_LABELS) as Capability[])
          .filter((k) => p.supports[k])
          .map((k) => (
            <span
              key={k}
              className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70"
            >
              {CAP_LABELS[k]}
            </span>
          ))}
        {p.mediaCapabilities?.image === "generate" && (
          <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan-200">
            Image gen
          </span>
        )}
        {p.mediaCapabilities?.video === "generate" && (
          <span className="rounded-full bg-fuchsia-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-fuchsia-200">
            Video gen
          </span>
        )}
      </div>

      {/* Validation Status */}
      {p.needsApiKey && hasServerKey && (
        <div className="flex items-center gap-2">
          {validationStatus.status === "validating" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs text-blue-300">
              <Loader2 className="size-3 animate-spin" />
              Validating...
            </span>
          )}
          {validationStatus.status === "valid" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              <ShieldCheck className="size-3" />
              {validationStatus.message ?? "Valid"}
            </span>
          )}
          {validationStatus.status === "invalid" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs text-red-300">
              <ShieldX className="size-3" />
              {validationStatus.message ?? "Invalid key"}
            </span>
          )}
          {validationStatus.status === "error" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
              <ShieldAlert className="size-3" />
              {validationStatus.message ?? "Validation error"}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-2">
        {p.needsApiKey && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveKey();
                }}
                placeholder={
                  hasServerKey ? "•••••••• (saved server-side)" : (p.setupHint ?? "API key")
                }
                autoComplete="off"
                className="h-9 flex-1 border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30"
              />
              <Button
                size="sm"
                onClick={saveKey}
                disabled={saving || !keyDraft.trim()}
                className="h-9 bg-white/10 text-white hover:bg-white/20"
              >
                Save
              </Button>
              {hasServerKey && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={validateKey}
                    disabled={saving || validating}
                    className="h-9 border-white/10 bg-transparent text-white/70 hover:bg-white/10"
                    aria-label="Validate API key"
                  >
                    {validating ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearKey}
                    disabled={saving}
                    className="h-9 border-white/10 bg-transparent text-white/70 hover:bg-white/10"
                    aria-label="Clear stored key"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] text-white/50">
              <KeyRound className="size-3" />
              {hasServerKey
                ? "Key stored in encrypted server session — never sent to the browser."
                : "Keys are stored server-side only."}
            </span>
          </div>
        )}
        {p.baseUrlEditable && (
          <div className="flex flex-col gap-1.5">
            <Input
              value={cfg.baseUrl ?? ""}
              onChange={(e) => store.updateProviderConfig(p.id, { baseUrl: e.target.value })}
              placeholder={p.defaultBaseUrl}
              className="h-9 border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30"
            />
            {isNativeContext() && (cfg.baseUrl ?? "").match(/localhost|127\.0\.0\.1/) && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
                <AlertCircle className="size-3" />
                On mobile devices, you must use your computer's local network IP (e.g., 192.168.1.x)
                instead of localhost.
              </span>
            )}
          </div>
        )}
        <Input
          value={cfg.model ?? ""}
          onChange={(e) => store.updateProviderConfig(p.id, { model: e.target.value })}
          placeholder={`Model · default ${p.defaultModel}`}
          className="h-9 border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] ${ready ? "text-emerald-300" : "text-amber-300"}`}>
          {ready
            ? validationStatus.status === "valid"
              ? "✅ Ready to chat"
              : "Ready"
            : p.needsApiKey
              ? hasServerKey
                ? "⚠️ Needs validation"
                : "🔑 Needs API key"
              : "🔧 Configure base URL"}
        </span>
        <Button
          size="sm"
          onClick={() => store.setActiveProvider(p.id)}
          className={
            isActive
              ? "bg-white text-black hover:bg-white/90"
              : "bg-white/10 text-white hover:bg-white/15"
          }
        >
          {isActive ? (
            <>
              <Check className="mr-1 size-3.5" /> Active
            </>
          ) : (
            "Use"
          )}
        </Button>
      </div>
    </div>
  );
}
