import { useState, useEffect, useCallback } from "react";
import { ChevronDown, Loader2, Check } from "lucide-react";
import { store, useStore, resolveProvider, PROVIDERS } from "@/lib/cockpit-store";
import type { ProviderDef } from "@/lib/providers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ModelInfo = { id: string; label?: string; name?: string };

async function fetchModels(): Promise<Record<string, ModelInfo[]>> {
  try {
    const res = await fetch("/api/proxy/models");
    if (!res.ok) return {};
    const json = (await res.json()) as { models: Record<string, ModelInfo[]> };
    return json.models ?? {};
  } catch {
    return {};
  }
}

export function ModelPicker({
  provider,
  visualButtonClass,
  displayMod,
}: {
  provider: ProviderDef;
  visualButtonClass: string;
  displayMod: string;
}) {
  const settings = useStore((s) => s.settings);
  const { model: currentModel } = resolveProvider(settings);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadModels = useCallback(async () => {
    if (!provider.modelsPath) return;
    setLoading(true);
    const allModels = await fetchModels();
    const result = allModels[provider.id] ?? [];
    setModels(result);
    setLoading(false);
  }, [provider.id, provider.modelsPath]);

  useEffect(() => {
    if (open) {
      loadModels();
    }
  }, [open, loadModels]);

  // Reset when provider changes
  useEffect(() => {
    setModels([]);
  }, [provider.id]);

  const handleSelect = (modelId: string) => {
    store.updateProviderConfig(provider.id, { model: modelId });
  };

  const displayModels = models.length > 0 ? models : [{ id: currentModel }];

  const shortModelName = currentModel.length > 20 ? currentModel.slice(0, 18) + "…" : currentModel;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[13px] transition ${visualButtonClass}`}
          title={`${displayMod}+K to open command palette`}
        >
          <span className="max-w-[120px] truncate text-white/80">{shortModelName}</span>
          <ChevronDown className="size-3.5 text-white/50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 border-white/10 bg-zinc-950 text-white">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-white/40">
          {provider.name} Models
          {loading && <Loader2 className="ml-2 inline-block size-3 animate-spin text-white/50" />}
        </DropdownMenuLabel>
        {displayModels.map((m) => {
          const active = m.id === currentModel;
          const label = m.label || m.name || m.id;
          return (
            <DropdownMenuItem
              key={m.id}
              onClick={() => handleSelect(m.id)}
              className="gap-2 focus:bg-white/10"
            >
              <span className="flex-1 truncate text-sm">{label}</span>
              {active && <Check className="size-3.5 shrink-0 text-emerald-300" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
