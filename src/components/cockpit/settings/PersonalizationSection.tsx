import { RotateCcw } from "lucide-react";
import { useStore, store } from "@/lib/cockpit-store";
import { Button } from "@/components/ui/button";
import {
  TextField,
  SelectField,
  SwitchRow,
  Section,
} from "@/components/cockpit/settings/SharedFields";

export function PersonalizationSection() {
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
