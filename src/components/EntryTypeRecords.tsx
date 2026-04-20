"use client";

import React, { useState, useEffect } from "react";
import { ButtonIcon, Icon, ConfirmModal, Spinner } from "@applicator/sdk/components";
import CreateEntryModal from "./CreateEntryModal";
import PrintModal from "./PrintModal";

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  hasIcon: boolean;
  bgColor: string;
  fgColor: string;
  blurb?: string;
  allowAliasCreation?: boolean;
  isGroup?: boolean;
  secondaryFieldId?: string;
  groupByFieldId?: string;
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

interface EntryField {
  id: string;
  name: string;
  fieldType: string;
  config: any;
}

interface LookupEntry {
  id: string;
  name: string;
  hasIcon: boolean;
  entryTypeId: string;
}

interface EntryRecord {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  entryTypeId: string;
  aliasId?: string;
  fieldData?: Record<string, any>;
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
  initialSearch?: string;
  onSelectRecord: (recordId: string) => void;
  onAliasCreated?: (typeId: string, alias: EntryTypeAlias) => void;
  addToast: (message: string, type?: "success" | "error") => void;
}

/** Resolve a picklist or multipicklist value to display label(s). */
function resolvePicklistLabel(field: EntryField, value: any): string {
  if (!value && value !== 0) return "";
  const options: Array<{ value: string; label: string }> = field.config?.options || [];
  const lookup = (v: string) => options.find((o) => o.value === v)?.label || v;
  if (Array.isArray(value)) return value.map(lookup).filter(Boolean).join(", ");
  return lookup(String(value));
}

/** Get the display values for a record's secondary field. Returns an array (multi-value aware). */
function getSecondaryValues(
  record: EntryRecord,
  field: EntryField,
  lookupData: Record<string, LookupEntry[]>,
): string[] {
  if (field.fieldType === "lookup") {
    return (lookupData[record.id] || []).map((e) => e.name);
  }
  if (field.fieldType === "picklist") {
    const label = resolvePicklistLabel(field, record.fieldData?.[field.id]);
    return label ? [label] : [];
  }
  // text
  const v = record.fieldData?.[field.id];
  return v ? [String(v)] : [];
}

/** Get the group keys for a record given a group-by field. */
function getGroupKeys(
  record: EntryRecord,
  field: EntryField,
  lookupData: Record<string, LookupEntry[]>,
): string[] {
  if (field.fieldType === "lookup") {
    const entries = lookupData[record.id] || [];
    return entries.length > 0 ? entries.map((e) => e.name) : ["(None)"];
  }
  if (field.fieldType === "picklist") {
    const raw = record.fieldData?.[field.id];
    if (!raw && raw !== 0) return ["(None)"];
    if (Array.isArray(raw)) {
      const labels = raw.map((v: string) => {
        const opt = (field.config?.options || []).find((o: any) => o.value === v);
        return opt ? opt.label : v;
      }).filter(Boolean);
      return labels.length > 0 ? labels : ["(None)"];
    }
    const label = resolvePicklistLabel(field, raw);
    return label ? [label] : ["(None)"];
  }
  // text
  const v = record.fieldData?.[field.id];
  return v ? [String(v)] : ["(None)"];
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
  initialSearch,
  onSelectRecord,
  onAliasCreated,
  addToast,
}: Props) {
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch || "");
  const [deleteTarget, setDeleteTarget] = useState<EntryRecord | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [fields, setFields] = useState<EntryField[]>([]);
  const [lookupData, setLookupData] = useState<Record<string, LookupEntry[]>>({});
  const [secondaryLookupData, setSecondaryLookupData] = useState<Record<string, LookupEntry[]>>({});

  const entryType = entryTypes.find((t) => t.id === entryTypeId);
  const aliases = aliasesByTypeId[entryTypeId] || [];

  const secondaryFieldId = entryType?.secondaryFieldId || "";
  const groupByFieldId = entryType?.groupByFieldId || "";

  // Fetch fields for the current entry type so we can resolve secondary/group-by values
  useEffect(() => {
    fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/fields`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setFields(data?.fields || []))
      .catch(() => setFields([]));
  }, [lorebookId, entryTypeId]);

  const fetchRecords = async (currentSearch: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (currentSearch) qs.set("search", currentSearch);
      if (aliasId) qs.set("aliasId", aliasId);
      // Pass the secondary field ID so the server can include its values in the
      // search filter. "alias" is a sentinel (not a real field ID) so skip it.
      if (secondaryFieldId && secondaryFieldId !== "alias") qs.set("secondaryFieldId", secondaryFieldId);
      // lookupFieldId resolves names for groupBy; secondaryLookupFieldId resolves names for secondary display.
      if (groupByFieldId && groupByFieldId !== "alias") qs.set("lookupFieldId", groupByFieldId);
      else if (secondaryFieldId && secondaryFieldId !== "alias") qs.set("lookupFieldId", secondaryFieldId);
      if (secondaryFieldId && secondaryFieldId !== "alias") qs.set("secondaryLookupFieldId", secondaryFieldId);

      const params = qs.toString() ? `?${qs.toString()}` : "";
      const res = await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/records${params}`
      );
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setLookupData(data.lookupData || {});
        setSecondaryLookupData(data.secondaryLookupData || data.lookupData || {});
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    setSearch("");
    fetchRecords("");
  }, [entryTypeId, aliasId]);

  useEffect(() => {
    const timer = setTimeout(() => fetchRecords(search), 200);
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

  // Build grouped structure when a group-by field is configured
  const groupByAlias = groupByFieldId === "alias";
  const groupByField = (!groupByAlias && groupByFieldId) ? fields.find((f) => f.id === groupByFieldId) ?? null : null;
  const secondaryField = secondaryFieldId ? fields.find((f) => f.id === secondaryFieldId) ?? null : null;

  const filtered = records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    if (r.name?.toLowerCase().includes(q) || r.blurb?.toLowerCase().includes(q)) return true;
    if (secondaryField) {
      const values = getSecondaryValues(r, secondaryField, secondaryLookupData);
      if (values.some((v) => v.toLowerCase().includes(q))) return true;
    }
    return false;
  });

  type GroupMap = Map<string, EntryRecord[]>;

  const buildGroups = (items: EntryRecord[]): GroupMap => {
    const map: GroupMap = new Map();
    for (const record of items) {
      let keys: string[];
      if (groupByAlias) {
        const alias = record.aliasId ? aliases.find((a) => a.id === record.aliasId) : undefined;
        keys = alias ? [alias.singularName] : ["(None)"];
      } else if (groupByField) {
        keys = getGroupKeys(record, groupByField, lookupData);
      } else {
        keys = ["__all__"];
      }
      for (const key of keys) {
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(record);
      }
    }
    // Sort records within each group alphabetically
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  };

  const renderRecord = (record: EntryRecord) => {
    const recordAlias = record.aliasId ? aliases.find((a) => a.id === record.aliasId) : undefined;

    // Secondary display: field value if configured, otherwise alias badge
    let secondaryContent: React.ReactNode = null;
    if (secondaryField) {
      if (secondaryField.fieldType === "lookup") {
        const entries = secondaryLookupData[record.id] || [];
        if (entries.length > 0) {
          secondaryContent = (
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, maxWidth: 160, overflow: "hidden" }}>
              {entries.map((entry) => (
                <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0, overflow: "hidden" }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 3, overflow: "hidden", flexShrink: 0,
                    background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {entry.hasIcon ? (
                      <img
                        src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entry.entryTypeId}/records/${entry.id}/icon`}
                        style={{ width: 16, height: 16, objectFit: "cover" }}
                        alt=""
                      />
                    ) : (
                      <span style={{ color: "#475569" }}>
                        <Icon name={(entryTypes.find((t) => t.id === entry.entryTypeId)?.icon as any) || "file"} size={10} />
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {entry.name}
                  </span>
                </div>
              ))}
            </div>
          );
        }
      } else {
        const values = getSecondaryValues(record, secondaryField, secondaryLookupData);
        if (values.length > 0) {
          secondaryContent = (
            <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {values.join(", ")}
            </span>
          );
        }
      }
    } else if (recordAlias) {
      secondaryContent = (
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
      );
    }

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
        {secondaryContent}
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
  };

  const renderList = () => {
    if (filtered.length === 0) {
      return (
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
      );
    }

    if (!groupByField && !groupByAlias) {
      return filtered.map((record) => renderRecord(record));
    }

    // Grouped rendering
    const groups = buildGroups(filtered);
    const sortedKeys = [...groups.keys()].sort((a, b) => {
      if (a === "(None)") return 1;
      if (b === "(None)") return -1;
      return a.localeCompare(b);
    });

    // Build name → LookupEntry map for group header icons when grouping by a lookup field
    const lookupNameMap = (groupByField?.fieldType === "lookup")
      ? (() => {
          const map = new Map<string, LookupEntry>();
          for (const entries of Object.values(lookupData)) {
            for (const entry of entries) {
              if (!map.has(entry.name)) map.set(entry.name, entry);
            }
          }
          return map;
        })()
      : null;

    return sortedKeys.map((key) => {
      const lookupEntry = lookupNameMap?.get(key);
      return (
        <div key={key}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 16px",
            fontSize: 11,
            fontWeight: 700,
            color: "#64748b",
            background: "#0c1a2e",
            borderBottom: "1px solid #1e293b",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            position: "sticky",
            top: 0,
            zIndex: 1,
          }}>
            {lookupEntry && (
              <div style={{
                width: 16, height: 16, borderRadius: 3, overflow: "hidden", flexShrink: 0,
                background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {lookupEntry.hasIcon ? (
                  <img
                    src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${lookupEntry.entryTypeId}/records/${lookupEntry.id}/icon`}
                    style={{ width: 16, height: 16, objectFit: "cover" }}
                    alt=""
                  />
                ) : (
                  <span style={{ color: "#475569" }}>
                    <Icon name={(entryTypes.find((t) => t.id === lookupEntry.entryTypeId)?.icon as any) || "file"} size={10} />
                  </span>
                )}
              </div>
            )}
            {key}
            <span style={{ marginLeft: 2, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              ({groups.get(key)!.length})
            </span>
          </div>
          {groups.get(key)!.map((record) => renderRecord(record))}
        </div>
      );
    });
  };

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
        <div style={{ display: "flex", gap: 4 }}>
          <ButtonIcon
            name="print"
            label={`Print ${aliasName || entryType?.pluralName || "entries"}`}
            onClick={() => setShowPrint(true)}
          />
          {canEdit && (
            <ButtonIcon
              name="plus"
              label={`Create new ${aliasName || entryType?.singularName || "entry"}`}
              onClick={() => setShowCreate(true)}
            />
          )}
        </div>
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
        ) : (
          renderList()
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
          onAliasCreated={onAliasCreated}
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

      {showPrint && (
        <PrintModal
          lorebookId={lorebookId}
          scope="type"
          entryTypeId={entryTypeId}
          aliasId={aliasId}
          aliasName={aliasName}
          entryTypes={entryTypes}
          aliasesByTypeId={aliasesByTypeId}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  );
}
