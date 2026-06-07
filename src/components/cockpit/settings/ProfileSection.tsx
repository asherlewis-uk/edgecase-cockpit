import { useRef } from "react";
import { Upload, RotateCcw } from "lucide-react";
import { useStore, store, deriveInitials } from "@/lib/cockpit-store";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/cockpit/settings/SharedFields";
import { Section } from "@/components/cockpit/settings/SharedFields";

export function ProfileSection() {
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
