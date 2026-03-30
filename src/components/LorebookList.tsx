"use client";

import { useState, useEffect } from "react";
import {
  Button,
  ButtonIcon,
  Icon,
  Modal,
  ConfirmModal,
  DynamicInput,
  Spinner,
  ToastStack,
} from "@applicator/sdk/components";
import type { AppView } from "../apps/Lorekeeper";

interface LorebookEntry {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  ownerId: string;
  ownerName: string;
  role: string;
}

interface Props {
  navigate: (v: AppView) => void;
}

export default function LorebookList({ navigate }: Props) {
  const [owned, setOwned] = useState<LorebookEntry[]>([]);
  const [shared, setShared] = useState<LorebookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createValues, setCreateValues] = useState<Record<string, any>>({ name: "", blurb: "", iconData: "" });
  const [creating, setCreating] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<LorebookEntry | null>(null);
  const [toasts, setToasts] = useState<any[]>([]);

  const addToast = (message: string, type: "success" | "error" = "success") => {
    setToasts((t) => [...t, { message, type }]);
  };
  const removeToast = (index: number) => setToasts((t) => t.filter((_, i) => i !== index));

  const fetchLorebooks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lorekeeper/lorebooks");
      if (res.ok) {
        const data = await res.json();
        setOwned(data.owned || []);
        setShared(data.shared || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchLorebooks();
    fetch("/api/lorekeeper/lorebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    }).then((r) => setCanCreate(r.status !== 403));
  }, []);

  const handleCreate = async () => {
    if (!createValues.name?.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/lorekeeper/lorebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createValues.name.trim(), blurb: createValues.blurb || "" }),
      });
      if (!res.ok) {
        const err = await res.json();
        addToast(err.error || "Failed to create lorebook", "error");
        return;
      }
      const book = await res.json();

      if (createValues.iconData) {
        await fetch(`/api/lorekeeper/lorebooks/${book.id}/icon`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ iconData: createValues.iconData }),
        });
      }

      setShowCreate(false);
      setCreateValues({ name: "", blurb: "", iconData: "" });
      addToast("Lorebook created");
      navigate({ type: "lorebook", lorebookId: book.id });
    } catch {
      addToast("Failed to create lorebook", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeSelf = async (book: LorebookEntry) => {
    try {
      const res = await fetch(`/api/lorekeeper/lorebooks/${book.id}/members`);
      if (!res.ok) { addToast("Failed to revoke access", "error"); return; }
      const data = await res.json();
      const me = data.members?.find((m: any) => m.userId === book.ownerId);
      if (me) {
        const del = await fetch(`/api/lorekeeper/lorebooks/${book.id}/members/${me.userId}`, { method: "DELETE" });
        if (del.ok) { addToast("Access revoked"); fetchLorebooks(); return; }
      }
      addToast("To revoke access, ask the owner or use Settings → Membership", "error");
    } catch {
      addToast("Failed to revoke access", "error");
    }
  };

  const BookRow = ({ book, isOwned }: { book: LorebookEntry; isOwned: boolean }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        cursor: "pointer",
        border: "1px solid #1e293b",
        background: "#0f172a",
        marginBottom: 6,
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#111827";
        e.currentTarget.style.borderColor = "#334155";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#0f172a";
        e.currentTarget.style.borderColor = "#1e293b";
      }}
      onClick={() => navigate({ type: "lorebook", lorebookId: book.id })}
    >
      <div style={{
        width: 40, height: 40, overflow: "hidden", flexShrink: 0,
        background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {book.hasIcon ? (
          <img src={`/api/lorekeeper/lorebooks/${book.id}/icon`} style={{ width: 40, height: 40, objectFit: "cover" }} alt="" />
        ) : (
          <span style={{ color: "#64748b" }}><Icon name="library" size={20} /></span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "#f1f5f9", fontSize: 14 }}>{book.name}</div>
        {book.blurb && (
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {book.blurb}
          </div>
        )}
        {!isOwned && (
          <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
            by {book.ownerName} · {book.role}
          </div>
        )}
      </div>

      {!isOwned && (
        <div onClick={(e) => e.stopPropagation()}>
          <ButtonIcon name="trash" label="Revoke access" onClick={() => setRevokeTarget(book)} subvariant="danger" />
        </div>
      )}
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0f172a" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: "1px solid #1e293b",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#818cf8" }}><Icon name="library" size={16} /></span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Lorekeeper</span>
        </div>
        {canCreate && (
          <ButtonIcon name="plus" label="New Lorebook" onClick={() => setShowCreate(true)} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 0" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner /></div>
        ) : (
          <>
            {owned.length > 0 && (
              <div>
                <div style={{ padding: "0 0 6px", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  My Lorebooks
                </div>
                {owned.map((b) => <BookRow key={b.id} book={b} isOwned />)}
              </div>
            )}
            {shared.length > 0 && (
              <div style={{ marginTop: owned.length > 0 ? 8 : 0 }}>
                <div style={{ padding: "0 0 6px", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Shared With Me
                </div>
                {shared.map((b) => <BookRow key={b.id} book={b} isOwned={false} />)}
              </div>
            )}
            {owned.length === 0 && shared.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 60, gap: 12, color: "#64748b" }}>
                <Icon name="library" size={40} />
                <div style={{ fontSize: 15 }}>No lorebooks yet</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <Modal
          header={<span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>New Lorebook</span>}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} disabled={creating || !createValues.name?.trim()}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </>
          }
          closeable
          onClose={() => setShowCreate(false)}
          maxWidth={480}
        >
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <DynamicInput
              input={{ id: "name", label: "Name", type: "text", required: true, placeholder: "My Lorebook" }}
              value={createValues.name ?? ""}
              onChange={(id, v) => setCreateValues((p) => ({ ...p, [id]: v }))}
            />
            <DynamicInput
              input={{ id: "blurb", label: "Summary", type: "text", placeholder: "A brief description…", lines: 2 }}
              value={createValues.blurb ?? ""}
              onChange={(id, v) => setCreateValues((p) => ({ ...p, [id]: v }))}
            />
            <DynamicInput
              input={{ id: "iconData", label: "Icon (optional)", type: "file" }}
              value={createValues.iconData ?? ""}
              onChange={(id, v) => setCreateValues((p) => ({ ...p, [id]: v }))}
            />
          </div>
        </Modal>
      )}

      {revokeTarget && (
        <ConfirmModal
          title="Revoke Access"
          message={`Remove yourself from "${revokeTarget.name}"? You will no longer have access.`}
          confirmText="Revoke"
          danger
          onConfirm={async () => {
            await handleRevokeSelf(revokeTarget);
            setRevokeTarget(null);
          }}
          onCancel={() => setRevokeTarget(null)}
        />
      )}

      <ToastStack toasts={toasts} onClose={removeToast} />
    </div>
  );
}
