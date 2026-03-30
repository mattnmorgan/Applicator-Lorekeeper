"use client";

import { useState, useEffect, useRef } from "react";
import { ButtonIcon, Icon, ConfirmModal, Spinner } from "@applicator/sdk/components";

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  bgColor: string;
  fgColor: string;
}

interface EntryRecord {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  entryTypeId: string;
}

interface Props {
  lorebookId: string;
  entryTypeId: string;
  entryTypes: EntryType[];
  canEdit: boolean;
  onSelectRecord: (recordId: string) => void;
  addToast: (message: string, type?: "success" | "error") => void;
}

export default function EntryTypeRecords({
  lorebookId,
  entryTypeId,
  entryTypes,
  canEdit,
  onSelectRecord,
  addToast,
}: Props) {
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EntryRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const entryType = entryTypes.find((t) => t.id === entryTypeId);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/records${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    setSearch("");
    fetchRecords();
  }, [entryTypeId]);

  useEffect(() => {
    const timer = setTimeout(() => fetchRecords(), 200);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (showCreate) inputRef.current?.focus();
  }, [showCreate]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const record = await res.json();
        setNewName("");
        setShowCreate(false);
        addToast(`${entryType?.singularName || "Entry"} created`);
        onSelectRecord(record.id);
      } else {
        addToast("Failed to create entry", "error");
      }
    } catch {
      addToast("Failed to create entry", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (record: EntryRecord) => {
    try {
      const res = await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/records/${record.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        addToast(`${entryType?.singularName || "Entry"} deleted`);
        setDeleteTarget(null);
        setRecords((r) => r.filter((x) => x.id !== record.id));
      } else {
        addToast("Failed to delete entry", "error");
      }
    } catch {
      addToast("Failed to delete entry", "error");
    }
  };

  const filtered = records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name?.toLowerCase().includes(q) || r.blurb?.toLowerCase().includes(q);
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: "1px solid #1e293b",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {entryType && (
            <span style={{ color: "#94a3b8" }}>
              <Icon name={(entryType.icon as any) || "file"} size={18} />
            </span>
          )}
          <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>
            {entryType?.pluralName || "Entries"}
          </span>
          <span style={{ fontSize: 12, color: "#64748b" }}>({filtered.length})</span>
        </div>
        {canEdit && (
          <ButtonIcon
            name="plus"
            label={`Create new ${entryType?.singularName || "entry"}`}
            onClick={() => setShowCreate(true)}
          />
        )}
      </div>

      {/* Search */}
      <div style={{ padding: "8px 16px", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#64748b" }}>
            <Icon name="search" size={14} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Filter ${entryType?.pluralName?.toLowerCase() || "entries"}…`}
            style={{
              width: "100%",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 6,
              padding: "6px 8px 6px 28px",
              color: "#f1f5f9",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Create inline input */}
      {showCreate && (
        <div style={{ padding: "4px 16px 8px", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") { setShowCreate(false); setNewName(""); }
              }}
              placeholder={`${entryType?.singularName || "Entry"} name…`}
              style={{
                flex: 1,
                background: "#1e293b",
                border: "1px solid #3b82f6",
                borderRadius: 6,
                padding: "6px 10px",
                color: "#f1f5f9",
                fontSize: 13,
                outline: "none",
              }}
            />
            <ButtonIcon name="check" label="Create" onClick={handleCreate} disabled={!newName.trim() || creating} />
            <ButtonIcon name="close" label="Cancel" onClick={() => { setShowCreate(false); setNewName(""); }} />
          </div>
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 40, gap: 8, color: "#64748b" }}>
            <Icon name={(entryType?.icon as any) || "file"} size={32} />
            <div style={{ fontSize: 13 }}>
              {search ? "No matching entries" : `No ${entryType?.pluralName?.toLowerCase() || "entries"} yet`}
            </div>
          </div>
        ) : (
          filtered.map((record) => (
            <div
              key={record.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                borderBottom: "1px solid #1e293b",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#0f1e36")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onClick={() => onSelectRecord(record.id)}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 6, overflow: "hidden", flexShrink: 0,
                background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {record.hasIcon ? (
                  <img
                    src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/records/${record.id}/icon`}
                    style={{ width: 32, height: 32, objectFit: "cover" }}
                    alt=""
                  />
                ) : (
                  <span style={{ color: "#64748b" }}>
                    <Icon name={(entryType?.icon as any) || "file"} size={14} />
                  </span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{record.name}</div>
                {record.blurb && (
                  <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {record.blurb}
                  </div>
                )}
              </div>
              {canEdit && (
                <div onClick={(e) => e.stopPropagation()}>
                  <ButtonIcon
                    name="trash"
                    label="Delete entry"
                    subvariant="danger"
                    size="sm"
                    onClick={() => setDeleteTarget(record)}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${entryType?.singularName || "Entry"}`}
          message={`Delete "${deleteTarget.name}"? This will clear all related lookups and cannot be undone.`}
          confirmText="Delete"
          danger
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
