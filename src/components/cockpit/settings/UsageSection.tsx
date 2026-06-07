import { useEffect, useState } from "react";
import {
  PROVIDERS,
  getProviderStats,
  subscribeProviderStats,
  resetProviderStats,
} from "@/lib/cockpit-store";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/cockpit/settings/SharedFields";
import { estimateCost, formatCost, formatTokens } from "@/lib/tokens";

export function UsageSection() {
  const [stats, setStats] = useState(() => getProviderStats());
  useEffect(() => {
    const unsub = subscribeProviderStats(() => setStats(getProviderStats()));
    return () => {
      unsub();
    };
  }, []);

  const rows = PROVIDERS.map((p) => {
    const s = stats[p.id] ?? { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0 };
    return { p, s };
  }).filter((r) => r.s.calls > 0 || r.s.errors > 0);

  const totalCalls = rows.reduce((sum, r) => sum + r.s.calls, 0);
  const totalInputTokens = rows.reduce((sum, r) => sum + (r.s.inputTokens ?? 0), 0);
  const totalOutputTokens = rows.reduce((sum, r) => sum + (r.s.outputTokens ?? 0), 0);
  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalCost = rows.reduce(
    (sum, r) => sum + estimateCost(r.p.id, r.s.inputTokens ?? 0, r.s.outputTokens ?? 0),
    0,
  );
  return (
    <Section title="Usage">
      {rows.length === 0 ? (
        <p className="text-xs text-white/40">No provider calls yet.</p>
      ) : (
        <>
          {/* Summary row */}
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-white/60">
            <span>
              {totalCalls} call{totalCalls !== 1 ? "s" : ""}
            </span>
            <span>{formatTokens(totalTokens)} tokens</span>
            <span className="text-white/80">{formatCost(totalCost)}</span>
          </div>

          {/* Per-provider breakdown */}
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-white/50">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Provider</th>
                  <th className="px-3 py-2 text-right font-normal">Calls</th>
                  <th className="px-3 py-2 text-right font-normal">Errors</th>
                  <th className="px-3 py-2 text-right font-normal">Tokens</th>
                  <th className="px-3 py-2 text-right font-normal">Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, s }) => {
                  const providerTokens = (s.inputTokens ?? 0) + (s.outputTokens ?? 0);
                  const providerCost = estimateCost(p.id, s.inputTokens ?? 0, s.outputTokens ?? 0);
                  return (
                    <tr key={p.id} className="border-t border-white/5">
                      <td className="px-3 py-2 text-white/80">{p.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-white">{s.calls}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${s.errors ? "text-amber-300" : "text-white/40"}`}
                      >
                        {s.errors}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white/60">
                        {providerTokens > 0 ? formatTokens(providerTokens) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white/60">
                        {providerCost > 0 ? formatCost(providerCost) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
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
