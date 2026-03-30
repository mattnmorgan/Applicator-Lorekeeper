"use client";

import { useState } from "react";
import { Button, DynamicInput } from "@applicator/sdk/components";

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
  const [values, setValues] = useState({ name: lorebook.name, blurb: lorebook.blurb, iconData: "" });
  const [saving, setSaving] = useState(false);

  const handleChange = (id: string, value: any) => setValues((p) => ({ ...p, [id]: value }));

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

      if (values.iconData) {
        await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/icon`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ iconData: values.iconData }),
        });
        updated.hasIcon = true;
      }

      onUpdated(updated);
      setValues((v) => ({ ...v, iconData: "" }));
    } catch {
      addToast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveIcon = async () => {
    await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/icon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iconData: null }),
    });
    onUpdated({ ...lorebook, hasIcon: false });
    addToast("Icon removed");
  };

  return (
    <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>Details</div>

      {/* Current icon */}
      {lorebook.hasIcon && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src={`/api/lorekeeper/lorebooks/${lorebookId}/icon`}
            style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover" }}
            alt="Current icon"
          />
          <Button variant="ghost" onClick={handleRemoveIcon}>Remove icon</Button>
        </div>
      )}

      <DynamicInput input={{ id: "name", label: "Name", type: "text", required: true }} value={values.name} onChange={handleChange} />
      <DynamicInput input={{ id: "blurb", label: "Summary", type: "text", placeholder: "A brief description…", lines: 3 }} value={values.blurb} onChange={handleChange} />
      <DynamicInput input={{ id: "iconData", label: "Icon", type: "file" }} value={values.iconData} onChange={handleChange} />

      <div>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
