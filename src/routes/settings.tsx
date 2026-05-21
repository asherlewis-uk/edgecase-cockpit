import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Database, Trash2, Plus, Pin, PinOff } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import {
  useStore,
  store,
  clearCache,
  getEndpointStats,
  subscribeEndpointStats,
  resetEndpointStats,
  type EndpointLabel,
} from "@/lib/cockpit-store";
import { ProviderStatus } from "@/components/cockpit/ProviderStatus";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Cockpit" },
      { name: "description", content: "Provider configuration and endpoint labels." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const s = useStore((st) => st.settings);
  const [tab, setTab] = useState<"conn" | "endpoints">("conn");
  const [editing, setEditing] = useState<EndpointLabel | null>(null);
  useSyncExternalStore(
    subscribeEndpointStats,
    () => JSON.stringify(getEndpointStats()),
    () => "{}",
  );
  const stats = getEndpointStats();

  function newEndpoint() {
    setEditing({
      id: crypto.randomUUID(),
      label: "Custom",
      path: "/v1/chat/completions",
      method: "POST",
      cacheTtlSec: 0,
      bodyTemplate: JSON.stringify(
        { model: "{{model}}", messages: "{{messages}}" },
        null,
        2,
      ),
      responsePath: "choices.0.message.content",
    });
  }

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
        <ProviderStatus />
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 flex gap-1 rounded-full bg-white/5 p-1">
          {(["conn", "endpoints"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
                tab === t ? "bg-white/15 text-white" : "text-white/60"
              }`}
            >
              {t === "conn" ? "Connection" : "Endpoints"}
            </button>
          ))}
        </div>

        {tab === "conn" && (
          <div className="space-y-4">
            <Field label="Display name" value={s.userName}
              onChange={(v) => store.updateSettings({ userName: v })} placeholder="friend" />
            <Field label="Base URL" value={s.baseUrl}
              onChange={(v) => store.updateSettings({ baseUrl: v })} placeholder="https://api.openai.com" />
            <Field label="API key" value={s.apiKey} type="password"
              onChange={(v) => store.updateSettings({ apiKey: v })} placeholder="sk-…" />
            <Field label="Model" value={s.model}
              onChange={(v) => store.updateSettings({ model: v })} placeholder="gpt-4o-mini" />

            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">
                Default endpoint
              </Label>
              <select
                value={s.defaultEndpointId}
                onChange={(e) => store.updateSettings({ defaultEndpointId: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                {s.endpoints.map((e) => (
                  <option key={e.id} value={e.id}>{e.label} — {e.path}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={() => clearCache()}
                className="border-white/15 bg-transparent text-white hover:bg-white/10">
                <Database className="mr-2 size-4" /> Clear cache
              </Button>
              <Button variant="outline"
                onClick={() => { if (confirm("Reset everything?")) store.clearAll(); }}
                className="border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10">
                Reset all
              </Button>
            </div>
          </div>
        )}

        {tab === "endpoints" && !editing && (
          <div className="space-y-2">
            {s.endpoints.map((e) => (
              <div key={e.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">{e.label}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase text-white/70">{e.method}</span>
                    {e.cacheTtlSec > 0 && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase text-emerald-300">cache {e.cacheTtlSec}s</span>
                    )}
                    {(stats[e.id]?.hits || stats[e.id]?.misses) ? (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] tabular-nums text-white/70">
                        {stats[e.id]?.hits ?? 0}h / {stats[e.id]?.misses ?? 0}m
                      </span>
                    ) : null}
                    {s.defaultEndpointId === e.id && (
                      <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] uppercase text-indigo-300">default</span>
                    )}
                  </div>
                  <div className="truncate text-xs text-white/50">{e.path}</div>
                </div>
                <button onClick={() => store.upsertEndpoint({ ...e, pinned: !e.pinned })}
                  className="text-white/50 hover:text-amber-300" aria-label={e.pinned ? "Unpin" : "Pin"}>
                  {e.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                </button>
                <button onClick={() => store.updateSettings({ defaultEndpointId: e.id })}
                  className="text-xs text-white/60 hover:text-white">set default</button>
                <button onClick={() => setEditing(e)} className="text-xs text-white/60 hover:text-white">edit</button>
                <button onClick={() => store.removeEndpoint(e.id)} className="text-white/50 hover:text-red-400" aria-label="Delete">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <Button onClick={newEndpoint} className="w-full bg-white/10 text-white hover:bg-white/15">
              <Plus className="mr-2 size-4" /> New labeled endpoint
            </Button>
            <Button variant="outline" onClick={resetEndpointStats}
              className="w-full border-white/10 bg-transparent text-xs text-white/60 hover:bg-white/5">
              Reset hit/miss counters
            </Button>
          </div>
        )}

        {tab === "endpoints" && editing && (
          <EndpointEditor value={editing} onCancel={() => setEditing(null)}
            onSave={(v) => { store.upsertEndpoint(v); setEditing(null); }} />
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type}
        className="border-white/10 bg-white/5 text-white placeholder:text-white/30" />
    </div>
  );
}

function EndpointEditor({ value, onSave, onCancel }: {
  value: EndpointLabel; onSave: (v: EndpointLabel) => void; onCancel: () => void;
}) {
  const [v, setV] = useState(value);
  return (
    <div className="space-y-3">
      <Field label="Label" value={v.label} onChange={(x) => setV({ ...v, label: x })} />
      <Field label="Path" value={v.path} onChange={(x) => setV({ ...v, path: x })}
        placeholder="/v1/chat/completions" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">Method</Label>
          <select value={v.method}
            onChange={(e) => setV({ ...v, method: e.target.value as "GET" | "POST" })}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
            <option>POST</option><option>GET</option>
          </select>
        </div>
        <Field label="Cache TTL (s, 0=off)" value={String(v.cacheTtlSec)}
          onChange={(x) => setV({ ...v, cacheTtlSec: Number(x) || 0 })} />
      </div>
      <Field label="Response text path" value={v.responsePath || ""}
        onChange={(x) => setV({ ...v, responsePath: x })} placeholder="choices.0.message.content" />
      <div>
        <Label className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">
          Body template — {"{{model}} {{prompt}} {{messages}}"}
        </Label>
        <Textarea value={v.bodyTemplate || ""} onChange={(e) => setV({ ...v, bodyTemplate: e.target.value })}
          rows={6} className="border-white/10 bg-white/5 font-mono text-xs text-white" />
      </div>
      <div>
        <Label className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">Extra headers (JSON)</Label>
        <Textarea value={v.headers || ""} onChange={(e) => setV({ ...v, headers: e.target.value })}
          rows={3} placeholder='{"x-org":"team"}'
          className="border-white/10 bg-white/5 font-mono text-xs text-white" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}
          className="border-white/15 bg-transparent text-white hover:bg-white/10">Cancel</Button>
        <Button onClick={() => onSave(v)} className="bg-white text-black hover:bg-white/90">Save</Button>
      </div>
    </div>
  );
}