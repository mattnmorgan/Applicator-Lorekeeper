"use client";

import { useState, useEffect } from "react";
import { ButtonIcon, Icon, ConfirmModal, Spinner } from "@applicator/sdk/components";
import CreateEntryModal from "./CreateEntryModal";

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  hasIcon: boolean;
  bgColor: string;
  fgColor: string;
  blurb?: string;
}

interface EntryTypeAlias {
  id: string;
  entryTypeId: string;
  singularName: string;
  pluralName: string;
  bgColor?: string;
  fgColor?: string;
  blurb?: string;
}

interface EntryRecord {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  entryTypeId: string;
  aliasId?: string;
}

interface Props {
  lorebookId: string;
  entryTypeId: string;
  entryTypes: EntryType[];
  aliasesByTypeId: Record<string, EntryTypeAlias[]>;
  canEdit: boolean;
  aliasId?: string;
  aliasName?: string;
  aliasBlurb?: string;
  onSelectRecord: (recordId: string) => void;
  addToast: (message: string, type?: "success" | "error") => void;
}

export default function EntryTypeRecords({
  lorebookId,
  entryTypeId,
  entryTypes,
  aliasesByTypeId,
  canEdit,
  aliasId,
  aliasName,
  aliasBlurb,
  onSelectRecord,
  addToast,
}: Props) {
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EntryRecord | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const entryType = entryTypes.find((t) => t.id === entryTypeId);
  const aliases = aliasesByTypeId[entryTypeId] || [];

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (aliasId) qs.set("aliasId", aliasId);
      const params = qs.toString() ? `?${qs.toString()}` : "";
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
  }, [entryTypeId, aliasId]);

  useEffect(() => {
    const timer = setTimeout(() => fetchRecords(), 200);
    return () => clearTimeout(timer);
  }, [search]);


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
        padding: "12px 16px",
        borderBottom: "1px solid #1e293b",
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {entryType && (
            <span style={{ color: "#94a3b8", flexShrink: 0 }}>
              {entryType.hasIcon ? (
                <img
                  src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/icon`}
                  style={{ width: 18, height: 18, borderRadius: 4, objectFit: "cover", display: "block" }}
                  alt=""
                />
              ) : (
                <Icon name={(entryType.icon as any) || "file"} size={18} />
              )}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>
                {aliasName || entryType?.pluralName || "Entries"}
              </span>
              {aliasName && (
                <span style={{ fontSize: 12, color: "#64748b", background: "#1e293b", padding: "1px 6px", borderRadius: 4 }}>
                  {entryType?.pluralName}
                </span>
              )}
              <span style={{ fontSize: 12, color: "#64748b" }}>({filtered.length})</span>
            </div>
            {(aliasBlurb || (!aliasId && entryType?.blurb)) && (
              <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {aliasBlurb || entryType?.blurb}
              </div>
            )}
          </div>
        </div>
        {canEdit && (
          <ButtonIcon
            name="plus"
            label={`Create new ${aliasName || entryType?.singularName || "entry"}`}
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

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 40, gap: 8, color: "#64748b" }}>
            {entryType?.hasIcon ? (
              <img src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/icon`} style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} alt="" />
            ) : (
              <Icon name={(entryType?.icon as any) || "file"} size={32} />
            )}
            <div style={{ fontSize: 13 }}>
              {search ? "No matching entries" : `No ${entryType?.pluralName?.toLowerCase() || "entries"} yet`}
            </div>
          </div>
        ) : (
          filtered.map((record) => {
            const recordAlias = record.aliasId ? aliases.find((a) => a.id === record.aliasId) : undefined;
            return (
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
                {recordAlias && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: recordAlias.bgColor || "#1e293b",
                      color: recordAlias.fgColor || "#94a3b8",
                      flexShrink: 0,
                    }}
                  >
                    {recordAlias.singularName}
                  </span>
                )}
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
            );
          })
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateEntryModal
          lorebookId={lorebookId}
          entryTypeId={entryTypeId}
          entryTypes={entryTypes}
          fixedAliasId={aliasId}
          addToast={addToast}
          onCreated={(record) => {
            setShowCreate(false);
            addToast(`${entryType?.singularName || "Entry"} created`);
            onSelectRecord(record.id);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

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
