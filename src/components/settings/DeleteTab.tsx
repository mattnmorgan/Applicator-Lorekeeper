"use client";

import { useState } from "react";
import { Button, ConfirmModal, Spinner } from "@applicator/sdk/components";

interface Props {
  lorebookId: string;
  lorebookName: string;
  onDeleted: () => void;
  addToast: (message: string, type?: "success" | "error") => void;
}

export default function DeleteTab({ lorebookId, lorebookName, onDeleted, addToast }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setShowConfirm(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted();
      } else {
        addToast("Failed to delete lorebook", "error");
      }
    } catch {
      addToast("Failed to delete lorebook", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Delete Lorebook</div>
      <div style={{ background: "#3b1a1a", border: "1px solid #7f1d1d", borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fca5a5", marginBottom: 8 }}>Warning</div>
        <div style={{ fontSize: 13, color: "#fca5a5", lineHeight: 1.6 }}>
          Deleting <strong>"{lorebookName}"</strong> is permanent and cannot be undone. All entry types,
          records, attachments, and member access will be destroyed.
        </div>
      </div>
      <Button variant="danger" onClick={() => setShowConfirm(true)} disabled={deleting}>
        {deleting ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Spinner size={16} color="#fca5a5" label="Deleting lorebook" />
            Deleting…
          </span>
        ) : (
          "Delete Lorebook"
        )}
      </Button>
      {showConfirm && (
        <ConfirmModal
          title="Delete Lorebook"
          message={`Are you absolutely sure you want to delete "${lorebookName}" and all of its contents? This cannot be undone.`}
          confirmText="Delete Forever"
          danger
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
