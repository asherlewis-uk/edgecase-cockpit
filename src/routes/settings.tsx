import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Pin,
  PinOff,
  Wifi,
  WifiOff,
  KeyRound,
  Trash2,
  Upload,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  deriveInitials,
} from "@/lib/cockpit-store";
import {
  detectProvider,
  type ProviderDef,
  type Capability,
  type DetectResult,
} from "@/lib/providers";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PersonalizationSection as ExtractedPersonalizationSection } from "@/components/cockpit/settings/PersonalizationSection";
import { ProfileSection as ExtractedProfileSection } from "@/components/cockpit/settings/ProfileSection";
import { ProviderCard as ExtractedProviderCard } from "@/components/cockpit/settings/ProviderCard";
import { UsageSection as ExtractedUsageSection } from "@/components/cockpit/settings/UsageSection";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Cockpit" },
      { name: "description", content: "Personalize Cockpit and configure AI providers." },
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
        <h1 className="flex-1 text-2xl font-light tracking-tight">Settings</h1>
      </header>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        <ExtractedProfileSection />

        <ExtractedPersonalizationSection />

        <Section title="Cloud providers">
          <div className="grid gap-3 sm:grid-cols-2">
            {cloud.map((p) => (
              <ExtractedProviderCard
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
              <ExtractedProviderCard
                key={p.id}
                p={p}
                isActive={p.id === active.provider.id}
                detected={detected[p.id]}
                hasServerKey={!!keyStatus[p.id]}
              />
            ))}
          </div>
        </Section>

        <ExtractedUsageSection />

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

function ProfileSection() {
  const settings = useStore((s) => s.settings);
  const profile = settings.profile;
  const personalization = settings.personalization;
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const initials = profile.initials || deriveInitials(profile.displayName);

  const handleDisplayNameChange = (value: string) => {
    const currentInitials = profile.initials ?? "";
    const shouldAutoUpdateInitials =
      !currentInitials ||
      currentInitials === deriveInitials(profile.displayName) ||
      (profile.displayName === "friend" && currentInitials === "AI");

    store.updateProfile({
      displayName: value,
      initials: shouldAutoUpdateInitials ? deriveInitials(value) : currentInitials,
    });
  };

  const handleAvatarUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      store.updateProfile({ avatarDataUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Section title="Profile">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-4">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-white/[0.08] text-lg font-medium text-white">
            {profile.avatarDataUrl ? (
              <img src={profile.avatarDataUrl} alt="" className="size-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                handleAvatarUpload(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => avatarInputRef.current?.click()}
              className="bg-white/10 text-white hover:bg-white/15"
            >
              <Upload className="mr-2 size-3.5" />
              Upload avatar
            </Button>
            {profile.avatarDataUrl && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => store.updateProfile({ avatarDataUrl: undefined })}
                className="border-white/10 bg-transparent text-white/70 hover:bg-white/10"
              >
                Clear avatar
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextField
            id="display-name"
            label="Display name"
            value={profile.displayName}
            onChange={handleDisplayNameChange}
            placeholder="friend"
          />
          <TextField
            id="assistant-name"
            label="Assistant name"
            value={personalization.assistantName}
            onChange={(value) => store.updatePersonalization({ assistantName: value })}
            placeholder="Cockpit"
          />
          <TextField
            id="handle"
            label="Handle"
            value={profile.handle ?? ""}
            onChange={(value) => store.updateProfile({ handle: value })}
            placeholder="@friend"
          />
          <TextField
            id="role-label"
            label="Role label"
            value={profile.roleLabel ?? ""}
            onChange={(value) => store.updateProfile({ roleLabel: value })}
            placeholder="Builder"
          />
          <TextField
            id="pronouns"
            label="Pronouns"
            value={profile.pronouns ?? ""}
            onChange={(value) => store.updateProfile({ pronouns: value })}
            placeholder="Optional"
          />
          <TextField
            id="initials"
            label="Initials"
            value={initials}
            onChange={(value) =>
              store.updateProfile({
                initials: value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 3),
              })
            }
            placeholder={deriveInitials(profile.displayName)}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => store.resetProfile()}
            className="border-white/10 bg-transparent text-white/60 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="mr-2 size-3.5" />
            Reset profile
          </Button>
        </div>
      </div>
    </Section>
  );
}

function PersonalizationSection() {
  const personalization = useStore((s) => s.settings.personalization);

  return (
    <Section title="Personalization">
      <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
        <SelectField
          id="preferred-tone"
          label="Preferred tone"
          value={personalization.preferredTone}
          options={[
            { value: "direct", label: "Direct" },
            { value: "warm", label: "Warm" },
            { value: "technical", label: "Technical" },
            { value: "minimal", label: "Minimal" },
          ]}
          onChange={(preferredTone) => store.updatePersonalization({ preferredTone })}
        />
        <SelectField
          id="visual-mode"
          label="Visual mode"
          value={personalization.visualMode}
          options={[
            { value: "dark", label: "Dark" },
            { value: "glass", label: "Glass" },
            { value: "solid", label: "Solid" },
          ]}
          onChange={(visualMode) => store.updatePersonalization({ visualMode })}
        />
        <SelectField
          id="ambient-intensity"
          label="Ambient intensity"
          value={personalization.ambientIntensity}
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ]}
          onChange={(ambientIntensity) => store.updatePersonalization({ ambientIntensity })}
        />
        <TextField
          id="prompt-placeholder"
          label="Default prompt placeholder"
          value={personalization.defaultPromptPlaceholder}
          onChange={(value) => store.updatePersonalization({ defaultPromptPlaceholder: value })}
          placeholder="Message"
        />
        <div className="space-y-3 sm:col-span-2">
          <SwitchRow
            id="reduce-motion"
            label="Reduce motion"
            checked={personalization.reduceMotion}
            onChange={(reduceMotion) => store.updatePersonalization({ reduceMotion })}
          />
          <SwitchRow
            id="show-provider"
            label="Show provider in greeting"
            checked={personalization.showProviderInGreeting}
            onChange={(showProviderInGreeting) =>
              store.updatePersonalization({ showProviderInGreeting })
            }
          />
          <SwitchRow
            id="show-model"
            label="Show model in greeting"
            checked={personalization.showModelInGreeting}
            onChange={(showModelInGreeting) => store.updatePersonalization({ showModelInGreeting })}
          />
          <SwitchRow
            id="remember-provider"
            label="Remember last provider"
            checked={personalization.rememberLastProvider}
            onChange={(rememberLastProvider) =>
              store.updatePersonalization({ rememberLastProvider })
            }
          />
        </div>
        <div className="flex justify-end sm:col-span-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => store.resetPersonalization()}
            className="border-white/10 bg-transparent text-white/60 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="mr-2 size-3.5" />
            Reset personalization
          </Button>
        </div>
      </div>
    </Section>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs uppercase tracking-wider text-white/50">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 border-white/10 bg-white/5 text-white placeholder:text-white/30"
      />
    </div>
  );
}

type SelectOption<T extends string> = {
  value: T;
  label: string;
};

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs uppercase tracking-wider text-white/50">
        {label}
      </Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} className="mt-1.5 border-white/10 bg-white/5 text-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-white/10 bg-zinc-950 text-white">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="focus:bg-white/10">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SwitchRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <Label htmlFor={id} className="text-sm text-white/80">
        {label}
      </Label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-emerald-400 data-[state=unchecked]:bg-white/15"
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs uppercase tracking-wider text-white/50">{title}</h2>
      {children}
    </section>
  );
}

function UsageSection() {
  const [stats, setStats] = useState(() => getProviderStats());
  useEffect(() => {
    const unsub = subscribeProviderStats(() => setStats(getProviderStats()));
    return () => {
      unsub();
    };
  }, []);
  const rows = PROVIDERS.map((p) => ({ p, s: stats[p.id] ?? { calls: 0, errors: 0 } })).filter(
    (r) => r.s.calls > 0 || r.s.errors > 0,
  );
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
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${s.errors ? "text-amber-300" : "text-white/40"}`}
                  >
                    {s.errors}
                  </td>
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
