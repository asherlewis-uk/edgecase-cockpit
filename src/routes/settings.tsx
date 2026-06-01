import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Pin, PinOff, Wifi, WifiOff, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  useStore,
  store,
  PROVIDERS,
  resolveProvider,
  isProviderReady,
  refreshProviderKeyStatus,
  getProviderStats,
  subscribeProviderStats,
  resetProviderStats,
} from "@/lib/cockpit-store";
import { detectProvider, type ProviderDef, type Capability, type DetectResult } from "@/lib/providers";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Providers — Cockpit" },
      { name: "description", content: "Choose and configure AI providers." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const keyStatus = useStore((s) => s.providerKeyStatus);
  const active = resolveProvider(settings);
  const cloud = PROVIDERS.filter((p) => p.type === "cloud");
  const local = PROVIDERS.filter((p) => p.type === "local");
  const [detected, setDetected] = useState<Record<string, DetectResult>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, DetectResult> = {};
      await Promise.all(
        local
          .filter((p) => p.detectUrl)
          .map(async (p) => {
            out[p.id] = await detectProvider(p);
          }),
      );
      if (!cancelled) setDetected(out);
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <header className="flex items-center gap-3 px-4 pt-5">
        <Link
          to="/"
          className="grid size-10 place-items-center rounded-full bg-white/[0.06] hover:bg-white/[0.12]"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="flex-1 text-2xl font-light tracking-tight">Providers</h1>
      </header>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        <section>
          <div className="mb-3">
            <Label className="text-xs uppercase tracking-wider text-white/50">
              Display name
            </Label>
            <Input
              value={settings.userName}
              onChange={(e) => store.updateSettings({ userName: e.target.value })}
              placeholder="friend"
              className="mt-1.5 border-white/10 bg-white/5 text-white placeholder:text-white/30"
            />
          </div>
        </section>

        <Section title="Cloud providers">
          <div className="grid gap-3 sm:grid-cols-2">
            {cloud.map((p) => (
              <ProviderCard
                key={p.id}
                p={p}
                isActive={p.id === active.provider.id}
                hasServerKey={!!keyStatus[p.id]}
              />
            ))}
          </div>
        </Section>

        <Section title="Local / Self-hosted">
          <div className="grid gap-3 sm:grid-cols-2">
            {local.map((p) => (
              <ProviderCard
                key={p.id}
                p={p}
                isActive={p.id === active.provider.id}
                detected={detected[p.id]}
                hasServerKey={!!keyStatus[p.id]}
              />
            ))}
          </div>
        </Section>

        <UsageSection />

        <Section title="Danger">
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("Reset everything?")) store.clearAll();
            }}
            className="border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10"
          >
            Reset all
          </Button>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs uppercase tracking-wider text-white/50">{title}</h2>
      {children}
    </section>
  );
}

function UsageSection() {
  const [stats, setStats] = useState(() => getProviderStats());
  useEffect(() => subscribeProviderStats(() => setStats(getProviderStats())), []);
  const rows = PROVIDERS.map((p) => ({ p, s: stats[p.id] ?? { calls: 0, errors: 0 } }))
    .filter((r) => r.s.calls > 0 || r.s.errors > 0);
  return (
    <Section title="Usage">
      {rows.length === 0 ? (
        <p className="text-xs text-white/40">No provider calls yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-3 py-2 text-left font-normal">Provider</th>
                <th className="px-3 py-2 text-right font-normal">Calls</th>
                <th className="px-3 py-2 text-right font-normal">Errors</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, s }) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="px-3 py-2 text-white/80">{p.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-white">{s.calls}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${s.errors ? "text-amber-300" : "text-white/40"}`}>{s.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => resetProviderStats()}
          className="border-white/10 bg-transparent text-white/70 hover:bg-white/10"
        >
          Reset stats
        </Button>
      </div>
    </Section>
  );
}

const CAP_LABELS: Record<Capability, string> = {
  chat: "Chat",
  embeddings: "Embeddings",
  vision: "Vision",
  tools: "Tools",
};

function ProviderCard({
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

  const saveKey = async () => {
    if (!keyDraft.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/keys/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      await fetch("/api/keys/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: p.id }),
      });
      await refreshProviderKeyStatus();
    } finally {
      setSaving(false);
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
                  detected?.ok
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-white/10 text-white/50"
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
      </div>

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
                placeholder={hasServerKey ? "•••••••• (saved server-side)" : p.setupHint ?? "API key"}
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
          <Input
            value={cfg.baseUrl ?? ""}
            onChange={(e) => store.updateProviderConfig(p.id, { baseUrl: e.target.value })}
            placeholder={p.defaultBaseUrl}
            className="h-9 border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30"
          />
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
          {ready ? "Ready" : p.needsApiKey ? "Needs API key" : "Configure base URL"}
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