"use client";

import { useState } from "react";
import { Button, ButtonIcon, DynamicInput } from "@applicator/sdk/components";

export interface NewAliasValues {
  singularName: string;
  pluralName: string;
  blurb: string;
  bgColor: string;
  fgColor: string;
  visible: boolean;
}

interface Props {
  defaultBgColor: string;
  defaultFgColor: string;
  onSave: (values: NewAliasValues) => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function NewAliasForm({
  defaultBgColor,
  defaultFgColor,
  onSave,
  onCancel,
  saving,
}: Props) {
  const [values, setValues] = useState<NewAliasValues>({
    singularName: "",
    pluralName: "",
    blurb: "",
    bgColor: defaultBgColor,
    fgColor: defaultFgColor,
    visible: true,
  });

  const set = (patch: Partial<NewAliasValues>) =>
    setValues((p) => ({ ...p, ...patch }));

  const canSave = values.singularName.trim() && values.pluralName.trim();

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        New alias
      </div>

      {/* Names row */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>
            Singular name <span style={{ color: "#ef4444" }}>*</span>
          </div>
          <input
            autoFocus
            value={values.singularName}
            onChange={(e) => set({ singularName: e.target.value })}
            placeholder="e.g. Hero"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 6,
              padding: "5px 8px",
              color: "#f1f5f9",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>
            Plural name <span style={{ color: "#ef4444" }}>*</span>
          </div>
          <input
            value={values.pluralName}
            onChange={(e) => set({ pluralName: e.target.value })}
            placeholder="e.g. Heroes"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 6,
              padding: "5px 8px",
              color: "#f1f5f9",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Summary */}
      <div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>Summary</div>
        <input
          value={values.blurb}
          onChange={(e) => set({ blurb: e.target.value })}
          placeholder="Brief description…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 6,
            padding: "5px 8px",
            color: "#f1f5f9",
            fontSize: 13,
            outline: "none",
          }}
        />
      </div>

      {/* Badge colors + preview + visible */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>Bg</div>
          <input
            type="color"
            value={values.bgColor}
            onChange={(e) => set({ bgColor: e.target.value })}
            title="Badge background color"
            style={{
              width: 32,
              height: 28,
              border: "1px solid #334155",
              borderRadius: 4,
              cursor: "pointer",
              background: "transparent",
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>Fg</div>
          <input
            type="color"
            value={values.fgColor}
            onChange={(e) => set({ fgColor: e.target.value })}
            title="Badge foreground color"
            style={{
              width: 32,
              height: 28,
              border: "1px solid #334155",
              borderRadius: 4,
              cursor: "pointer",
              background: "transparent",
            }}
          />
        </div>
        <div style={{ alignSelf: "flex-end", paddingBottom: 2 }}>
          <ButtonIcon
            name="refresh"
            label="Reset to entry type colors"
            size="sm"
            onClick={() => set({ bgColor: defaultBgColor, fgColor: defaultFgColor })}
          />
        </div>
        {/* Badge preview */}
        <div style={{ flex: 1, alignSelf: "flex-end", paddingBottom: 4 }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 10px",
              borderRadius: 4,
              fontSize: 12,
              background: values.bgColor,
              color: values.fgColor,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {values.singularName || "Preview"}
          </span>
        </div>
        {/* Visible toggle */}
        <div style={{ alignSelf: "flex-end", paddingBottom: 2 }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3, textAlign: "center" }}>Nav</div>
          <DynamicInput
            input={{ id: "visible", label: "", type: "toggle" }}
            value={values.visible}
            onChange={(_, v) => set({ visible: v as boolean })}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => canSave && onSave(values)}
          disabled={!canSave || saving}
        >
          {saving ? "Saving…" : "Save alias"}
        </Button>
      </div>
    </div>
  );
}
