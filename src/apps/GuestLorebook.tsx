"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon, Spinner } from "@applicator/sdk/components";
import type { UiContext } from "@applicator/sdk/context";

interface GuestContextData {
  lorebookId: string;
  hasPassword: boolean;
}

interface Props {
  context?: UiContext<GuestContextData>;
}

interface Lorebook {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
}

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  hasIcon: boolean;
  blurb: string;
  parentTypeId: string;
  isGroup: boolean;
  bgColor: string;
  fgColor: string;
  sortOrder: number;
}

interface EntryRecord {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  entryTypeId: string;
  aliasId: string;
  fieldData: Record<string, any>;
}

interface Field {
  id: string;
  name: string;
  fieldType: string;
  config: any;
  aliasIds: string[];
  sortOrder: number;
}

type View = "loading" | "error" | "forbidden" | "types" | "records" | "record";

function formatFieldValue(value: any, fieldType: string, config: any): string {
  if (value === null || value === undefined || value === "") return "—";
  if (fieldType === "toggle") return value ? "Yes" : "No";
  if (fieldType === "picklist") {
    if (Array.isArray(value)) {
      const labels = value.map((v: string) => config?.options?.[v] || v);
      return labels.join(", ") || "—";
    }
    return config?.options?.[value] || value;
  }
  if (fieldType === "date" && typeof value === "string") return value;
  if (fieldType === "range" && typeof value === "object" && value !== null) {
    const min = config?.min ?? 0;
    const max = config?.max ?? 100;
    return `${value.value ?? "—"} / ${max}`;
  }
  if (fieldType === "color" && typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function GuestLorebook({ context }: Props) {
  const appId = context?.appId || "lorekeeper";
  const contextId = context?.guest?.id;
  const contextData = context?.guest?.data;
  const guestPassword = context?.guest?.password;
  const lorebookId = contextData?.lorebookId;

  const [view, setView] = useState<View>("loading");
  const [lorebook, setLorebook] = useState<Lorebook | null>(null);
  const [entryTypes, setEntryTypes] = useState<EntryType[]>([]);
  const [selectedType, setSelectedType] = useState<EntryType | null>(null);
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<EntryRecord | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);

  const guestHeaders: Record<string, string> = { "X-Guest-Context": contextId! };
  if (guestPassword) guestHeaders["X-Guest-Password"] = guestPassword;

  const gFetch = useCallback(
    (path: string) => fetch(`/api/${appId}/${path}`, { headers: guestHeaders }),
    [appId, contextId, guestPassword]
  );

  useEffect(() => {
    if (!lorebookId || !contextId) {
      setView("error");
      return;
    }

    Promise.all([
      gFetch(`lorebooks/${lorebookId}`),
      gFetch(`lorebooks/${lorebookId}/entry-types`),
    ]).then(async ([lbRes, etRes]) => {
      if (lbRes.status === 403) { setView("forbidden"); return; }
      if (!lbRes.ok || !etRes.ok) { setView("error"); return; }

      const [lbData, etData] = await Promise.all([lbRes.json(), etRes.json()]);
      setLorebook(lbData);
      const types = (etData.entryTypes || []).filter((t: EntryType) => !t.isGroup);
      setEntryTypes(types);
      setView("types");
    }).catch(() => setView("error"));
  }, [lorebookId, contextId]);

  const selectType = async (type: EntryType) => {
    setSelectedType(type);
    setSelectedRecord(null);
    setFields([]);
    setView("records");
    setLoadingRecords(true);
    try {
      const res = await gFetch(`lorebooks/${lorebookId}/entry-types/${type.id}/records`);
      if (res.ok) {
        const d = await res.json();
        setRecords((d.records || []).sort((a: EntryRecord, b: EntryRecord) => a.name.localeCompare(b.name)));
      }
    } finally {
      setLoadingRecords(false);
    }
  };

  const selectRecord = async (record: EntryRecord) => {
    setSelectedRecord(record);
    setView("record");
    setLoadingFields(true);
    try {
      const res = await gFetch(`lorebooks/${lorebookId}/entry-types/${record.entryTypeId}/fields`);
      if (res.ok) {
        const d = await res.json();
        setFields((d.fields || []).filter((f: Field) => f.fieldType !== "lookup"));
      }
    } finally {
      setLoadingFields(false);
    }
  };

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#0f172a",
    color: "#f1f5f9",
    fontFamily: "system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
  };

  const headerStyle: React.CSSProperties = {
    background: "#0c1a2e",
    borderBottom: "1px solid #1e293b",
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    padding: 24,
    maxWidth: 900,
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  };

  if (view === "loading") {
    return (
      <div style={{ ...containerStyle, alignItems: "center", justifyContent: "center" }}>
        <Spinner />
      </div>
    );
  }

  if (view === "forbidden") {
    return (
      <div style={{ ...containerStyle, alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 480, padding: 32 }}>
          <span style={{ color: "#64748b", display: "block", marginBottom: 16 }}>
            <Icon name="lock" size={40} />
          </span>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
            Lorebook Not Accessible
          </div>
          <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>
            This lorebook has not been shared publicly. Please contact the lorebook owner to request access.
          </div>
        </div>
      </div>
    );
  }

  if (view === "error") {
    return (
      <div style={{ ...containerStyle, alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 480, padding: 32 }}>
          <span style={{ color: "#64748b", display: "block", marginBottom: 16 }}>
            <Icon name="warning" size={40} />
          </span>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
            Something Went Wrong
          </div>
          <div style={{ fontSize: 14, color: "#94a3b8" }}>
            This link may be invalid or expired.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        {lorebook?.hasIcon ? (
          <img
            src={`/api/${appId}/lorebooks/${lorebookId}/icon`}
            style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
            alt=""
          />
        ) : (
          <span style={{ color: "#64748b", flexShrink: 0 }}><Icon name="library" size={24} /></span>
        )}
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{lorebook?.name}</div>
          {lorebook?.blurb && (
            <div style={{ fontSize: 12, color: "#64748b" }}>{lorebook.blurb}</div>
          )}
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#475569", padding: "2px 8px", border: "1px solid #1e293b", borderRadius: 4 }}>
          Shared Lorebook
        </div>
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {/* Breadcrumb */}
        {view !== "types" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 13, color: "#64748b" }}>
            <span
              style={{ cursor: "pointer", color: "#3b82f6" }}
              onClick={() => { setView("types"); setSelectedType(null); setSelectedRecord(null); }}
            >
              Entry Types
            </span>
            {selectedType && (
              <>
                <span><Icon name="chevron-right" size={12} /></span>
                <span
                  style={{ cursor: view === "record" ? "pointer" : "default", color: view === "record" ? "#3b82f6" : "#94a3b8" }}
                  onClick={() => view === "record" && setView("records")}
                >
                  {selectedType.pluralName}
                </span>
              </>
            )}
            {selectedRecord && (
              <>
                <span><Icon name="chevron-right" size={12} /></span>
                <span style={{ color: "#94a3b8" }}>{selectedRecord.name}</span>
              </>
            )}
          </div>
        )}

        {/* Entry types grid */}
        {view === "types" && (
          <div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              {entryTypes.length} entry {entryTypes.length === 1 ? "type" : "types"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {entryTypes.map((type) => (
                <div
                  key={type.id}
                  onClick={() => selectType(type)}
                  style={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    padding: "16px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#334155")}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 4, overflow: "hidden", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {type.hasIcon ? (
                      <img src={`/api/${appId}/lorebooks/${lorebookId}/entry-types/${type.id}/icon`} style={{ width: 32, height: 32, objectFit: "cover" }} alt="" />
                    ) : (
                      <span style={{ color: "#64748b" }}><Icon name={(type.icon as any) || "file"} size={16} /></span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{type.pluralName}</div>
                    {type.blurb && (
                      <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{type.blurb}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {entryTypes.length === 0 && (
              <div style={{ color: "#64748b", fontSize: 14 }}>No entry types in this lorebook.</div>
            )}
          </div>
        )}

        {/* Records list */}
        {view === "records" && selectedType && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 16 }}>
              {selectedType.pluralName}
            </div>
            {loadingRecords ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spinner /></div>
            ) : records.length === 0 ? (
              <div style={{ color: "#64748b", fontSize: 14 }}>No entries yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {records.map((record) => (
                  <div
                    key={record.id}
                    onClick={() => selectRecord(record)}
                    style={{
                      background: "#1e293b",
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                      borderRadius: 4,
                      border: "1px solid transparent",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#334155")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 4, overflow: "hidden", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {record.hasIcon ? (
                        <img src={`/api/${appId}/lorebooks/${lorebookId}/entry-types/${record.entryTypeId}/records/${record.id}/icon`} style={{ width: 28, height: 28, objectFit: "cover" }} alt="" />
                      ) : (
                        <span style={{ color: "#475569" }}><Icon name="file" size={14} /></span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#f1f5f9" }}>{record.name}</div>
                      {record.blurb && (
                        <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{record.blurb}</div>
                      )}
                    </div>
                    <span style={{ color: "#475569" }}><Icon name="chevron-right" size={14} /></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Record detail */}
        {view === "record" && selectedRecord && (
          <div style={{ maxWidth: 680 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
              {selectedRecord.hasIcon && (
                <img
                  src={`/api/${appId}/lorebooks/${lorebookId}/entry-types/${selectedRecord.entryTypeId}/records/${selectedRecord.id}/icon`}
                  style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                  alt=""
                />
              )}
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>{selectedRecord.name}</div>
                {selectedRecord.blurb && (
                  <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 4 }}>{selectedRecord.blurb}</div>
                )}
              </div>
            </div>

            {loadingFields ? (
              <Spinner />
            ) : fields.length > 0 && selectedRecord.fieldData && Object.keys(selectedRecord.fieldData).length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {fields
                  .filter((f) => {
                    const val = selectedRecord.fieldData?.[f.id];
                    return val !== undefined && val !== null && val !== "" && !(Array.isArray(val) && val.length === 0);
                  })
                  .map((field) => (
                    <div key={field.id} style={{ display: "flex", gap: 16, padding: "8px 0", borderBottom: "1px solid #1e293b" }}>
                      <div style={{ width: 180, flexShrink: 0, fontSize: 12, color: "#64748b", fontWeight: 500, paddingTop: 1 }}>{field.name}</div>
                      <div style={{ flex: 1, fontSize: 13, color: "#e2e8f0" }}>
                        {field.fieldType === "rich_text" ? (
                          <div
                            style={{ lineHeight: 1.6 }}
                            dangerouslySetInnerHTML={{ __html: selectedRecord.fieldData[field.id] || "" }}
                          />
                        ) : field.fieldType === "color" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 14, height: 14, borderRadius: 2, background: selectedRecord.fieldData[field.id], border: "1px solid #334155", display: "inline-block" }} />
                            {selectedRecord.fieldData[field.id]}
                          </span>
                        ) : (
                          formatFieldValue(selectedRecord.fieldData[field.id], field.fieldType, field.config)
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
