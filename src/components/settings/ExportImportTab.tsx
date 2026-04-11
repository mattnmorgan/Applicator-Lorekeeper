"use client";

import { Button } from "@applicator/sdk/components";

interface Props {
  lorebookId: string;
  lorebookName: string;
  addToast: (message: string, type?: "success" | "error") => void;
  onImported: () => void;
}

export default function ExportImportTab({ lorebookId, lorebookName, addToast, onImported }: Props) {
  const handleExport = async () => {
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/metadata/export`);
    if (res.ok) {
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${lorebookName || "lorebook"}-metadata.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast("Metadata exported");
    } else {
      addToast("Export failed", "error");
    }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/metadata/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          addToast("Metadata imported successfully");
          onImported();
        } else {
          const err = await res.json().catch(() => ({}));
          addToast(err.error || "Import failed", "error");
        }
      } catch {
        addToast("Invalid JSON file", "error");
      }
    };
    input.click();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>Export Metadata</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
          Download the lorebook's entry types, aliases, sections, fields, and form layout as a JSON file.
          Records and attachments are not included.
        </div>
        <Button variant="secondary" onClick={handleExport}>Export metadata JSON</Button>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #1e293b" }} />

      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>Import Metadata</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
          Load entry types, sections, and fields from a previously exported JSON file.
          Existing metadata will be merged with the imported data.
        </div>
        <Button variant="secondary" onClick={handleImport}>Import metadata JSON</Button>
      </div>
    </div>
  );
}
