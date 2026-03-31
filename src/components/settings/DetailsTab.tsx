"use client";

import { useState } from "react";
import { Button, DynamicInput, ImageUpload } from "@applicator/sdk/components";

interface Lorebook {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  accessLevel: string;
}

interface Props {
  lorebook: Lorebook;
  lorebookId: string;
  onUpdated: (updated: Lorebook) => void;
  addToast: (message: string, type?: "success" | "error") => void;
}

export default function DetailsTab({ lorebook, lorebookId, onUpdated, addToast }: Props) {
  const [values, setValues] = useState({ name: lorebook.name, blurb: lorebook.blurb });
  // null = no pending change; string starting with "data:" = pending new icon upload
  const [pendingIcon, setPendingIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleChange = (id: string, value: any) => setValues((p) => ({ ...p, [id]: value }));

  // The preview shown in ImageUpload: pending upload takes precedence over server URL
  const iconPreview = pendingIcon ?? (lorebook.hasIcon ? `/api/lorekeeper/lorebooks/${lorebookId}/icon` : null);

  const handleIconChange = async (dataUrl: string | null) => {
    if (dataUrl === null) {
      // User clicked Remove — clear immediately
      await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/icon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconData: null }),
      });
      onUpdated({ ...lorebook, hasIcon: false });
      setPendingIcon(null);
      addToast("Icon removed");
    } else {
      setPendingIcon(dataUrl);
    }
  };

  const handleSave = async () => {
    if (!values.name?.trim()) { addToast("Name is required", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.name.trim(), blurb: values.blurb || "" }),
      });
      if (!res.ok) { addToast("Failed to save", "error"); return; }
      const updated = await res.json();

      if (pendingIcon) {
        await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/icon`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ iconData: pendingIcon }),
        });
        updated.hasIcon = true;
        setPendingIcon(null);
      }

      onUpdated(updated);
      addToast("Saved", "success");
    } catch {
      addToast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>Details</div>

      <DynamicInput input={{ id: "name", label: "Name", type: "text", required: true }} value={values.name} onChange={handleChange} />
      <DynamicInput input={{ id: "blurb", label: "Summary", type: "text", placeholder: "A brief description…", lines: 3 }} value={values.blurb} onChange={handleChange} />
      <ImageUpload
        label="Icon"
        value={iconPreview}
        onChange={handleIconChange}
      />

      <div>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
