"use client";

import { useState, useEffect } from "react";
import { ButtonIcon, Icon, Spinner } from "@applicator/sdk/components";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  hasIcon: boolean;
  bgColor: string;
  fgColor: string;
  formLayout?: any;
  isGroup?: boolean;
}

interface EntryTypeAlias {
  id: string;
  entryTypeId: string;
  singularName: string;
  pluralName: string;
  bgColor?: string;
  fgColor?: string;
}

interface EntryField {
  id: string;
  sectionId: string;
  name: string;
  fieldType: string;
  config: any;
  aliasIds?: string[];
  sortOrder: number;
}

interface EntrySection {
  id: string;
  name: string;
  sectionType: "fields" | "related_list";
  sortOrder: number;
  relatedItems?: RelatedListItem[];
}

interface RelatedListItem {
  id: string;
  sectionId: string;
  entryTypeId: string;
  fieldId: string;
}

interface RecordLookup {
  id: string;
  customFieldId: string;
  record1: string;
  record2: string;
  record1Name: string;
  record2Name: string;
  record1TypeId: string;
  record2TypeId: string;
}

interface Attachment {
  id: string;
  filename: string;
  size: number;
}

interface PrintRecord {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  entryTypeId: string;
  aliasId?: string;
  fieldData: Record<string, any>;
  lookups: RecordLookup[];
  relatedSections?: EntrySection[];
  relatedRecords?: Record<string, any[]>;
  attachments?: Attachment[];
}

interface PrintTypeData {
  entryType: EntryType;
  fields: EntryField[];
  records: PrintRecord[];
}

interface Props {
  lorebookId: string;
  lorebookName?: string;
  scope: "record" | "type" | "lorebook";
  entryTypeId?: string;
  recordId?: string;
  aliasId?: string;
  aliasName?: string;
  entryTypes: EntryType[];
  aliasesByTypeId: Record<string, EntryTypeAlias[]>;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PrintModal({
  lorebookId,
  lorebookName,
  scope,
  entryTypeId,
  recordId,
  aliasId,
  aliasName,
  entryTypes,
  aliasesByTypeId,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [printData, setPrintData] = useState<PrintTypeData[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      if (scope === "record" && entryTypeId && recordId) {
        const data = await fetchSingleRecord(entryTypeId, recordId);
        if (data) setPrintData([data]);
      } else if (scope === "type" && entryTypeId) {
        const data = await fetchTypeRecords([entryTypeId], aliasId);
        setPrintData(data);
      } else if (scope === "lorebook") {
        const activeTypeIds = entryTypes
          .filter((t) => !t.isGroup)
          .map((t) => t.id);
        const data = await fetchTypeRecords(activeTypeIds);
        setPrintData(data);
      }
    } catch (e) {
      console.error("PrintModal fetch error:", e);
    }
    setLoading(false);
  };

  const fetchSingleRecord = async (
    typeId: string,
    rId: string,
  ): Promise<PrintTypeData | null> => {
    const baseUrl = `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/records/${rId}`;
    const [recRes, fieldRes, secRes, lookRes, attRes] = await Promise.all([
      fetch(baseUrl),
      fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/fields`),
      fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/sections?includeRelated=true`,
      ),
      fetch(`${baseUrl}/lookups`),
      fetch(`${baseUrl}/attachments`),
    ]);

    if (!recRes.ok) return null;

    const record = await recRes.json();
    const fields: EntryField[] = fieldRes.ok
      ? (await fieldRes.json()).fields || []
      : [];
    const lookups: RecordLookup[] = lookRes.ok
      ? (await lookRes.json()).lookups || []
      : [];
    const attachments: Attachment[] = attRes.ok
      ? (await attRes.json()).attachments || []
      : [];

    let relatedSections: EntrySection[] = [];
    let relatedRecords: Record<string, any[]> = {};

    if (secRes.ok) {
      const { sections: secs } = await secRes.json();
      relatedSections = (secs || []).filter(
        (s: EntrySection) => s.sectionType === "related_list",
      );

      const relatedTypeIds = [
        ...new Set(
          relatedSections
            .flatMap((s) => (s.relatedItems || []).map((item) => item.entryTypeId))
        ),
      ] as string[];

      if (relatedTypeIds.length > 0) {
        const bulkRes = await fetch(
          `/api/lorekeeper/lorebooks/${lorebookId}/records?typeIds=${relatedTypeIds.join(",")}`,
        );
        const recordsByType = bulkRes.ok
          ? (await bulkRes.json()).recordsByTypeId || {}
          : {};

        for (const sec of relatedSections) {
          const items: RelatedListItem[] = sec.relatedItems || [];
          const secRecs: any[] = [];
          for (const item of items) {
            const typeRecs = recordsByType[item.entryTypeId] || [];
            const fieldLookups = lookups.filter(
              (lk) => lk.customFieldId === item.fieldId && lk.record2 === rId,
            );
            for (const lk of fieldLookups) {
              const other = typeRecs.find((r: any) => r.id === lk.record1);
              if (other) {
                secRecs.push({
                  ...other,
                  entryTypeId: item.entryTypeId,
                  bToA: (lk as any).bToA,
                });
              }
            }
          }
          relatedRecords[sec.id] = secRecs;
        }
      }
    }

    const et = entryTypes.find((t) => t.id === typeId);
    if (!et) return null;

    return {
      entryType: et,
      fields,
      records: [{ ...record, lookups, relatedSections, relatedRecords, attachments }],
    };
  };

  const fetchTypeRecords = async (
    typeIds: string[],
    filterAliasId?: string,
  ): Promise<PrintTypeData[]> => {
    if (typeIds.length === 0) return [];

    // Fetch fields for all types in parallel
    const fieldsMap: Record<string, EntryField[]> = {};
    await Promise.all(
      typeIds.map(async (typeId) => {
        const res = await fetch(
          `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/fields`,
        );
        fieldsMap[typeId] = res.ok ? (await res.json()).fields || [] : [];
      }),
    );

    // Fetch records
    let recordsByTypeId: Record<string, any[]> = {};
    if (typeIds.length === 1 && filterAliasId) {
      const res = await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeIds[0]}/records?aliasId=${filterAliasId}`,
      );
      if (res.ok) {
        const { records } = await res.json();
        recordsByTypeId[typeIds[0]] = records || [];
      }
    } else {
      const res = await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/records?typeIds=${typeIds.join(",")}`,
      );
      if (res.ok) {
        recordsByTypeId = (await res.json()).recordsByTypeId || {};
      }
    }

    // Fetch lookups for all records in parallel
    const allRecordEntries: Array<{ typeId: string; recordId: string }> = [];
    for (const typeId of typeIds) {
      for (const r of recordsByTypeId[typeId] || []) {
        allRecordEntries.push({ typeId, recordId: r.id });
      }
    }

    const lookupsByRecordId: Record<string, RecordLookup[]> = {};
    await Promise.all(
      allRecordEntries.map(async ({ typeId, recordId: rId }) => {
        const res = await fetch(
          `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/records/${rId}/lookups`,
        );
        lookupsByRecordId[rId] = res.ok ? (await res.json()).lookups || [] : [];
      }),
    );

    return typeIds
      .filter((typeId) => {
        const et = entryTypes.find((t) => t.id === typeId);
        return et && !et.isGroup;
      })
      .map((typeId) => {
        const et = entryTypes.find((t) => t.id === typeId)!;
        const records: PrintRecord[] = (recordsByTypeId[typeId] || []).map(
          (r: any) => ({
            ...r,
            lookups: lookupsByRecordId[r.id] || [],
          }),
        );
        return { entryType: et, fields: fieldsMap[typeId] || [], records };
      });
  };

  // ── Field value rendering ─────────────────────────────────────────────────

  const renderFieldValue = (
    field: EntryField,
    value: any,
    recordId: string,
    lookups: RecordLookup[],
  ) => {
    const empty = <span style={{ color: "#999" }}>—</span>;

    if (field.fieldType === "rich_text") {
      if (!value) return empty;
      return (
        <div
          dangerouslySetInnerHTML={{ __html: value }}
          style={{ fontSize: 13, lineHeight: 1.6, color: "#111" }}
        />
      );
    }

    if (field.fieldType === "toggle") {
      return <span style={{ color: "#111" }}>{value ? "Yes" : "No"}</span>;
    }

    if (field.fieldType === "lookup") {
      const fieldLookups = lookups.filter(
        (lk) => lk.customFieldId === field.id && lk.record1 === recordId,
      );
      if (fieldLookups.length === 0) return empty;
      return (
        <span style={{ color: "#111" }}>
          {fieldLookups.map((lk) => lk.record2Name).join(", ")}
        </span>
      );
    }

    if (field.fieldType === "picklist") {
      if (field.config?.multiselect) {
        const vals = Array.isArray(value) ? value : value ? [value] : [];
        if (vals.length === 0) return empty;
        const labels = vals.map((v: string) => {
          const opt = field.config?.options?.find((o: any) => o.value === v);
          return opt?.label || v;
        });
        return <span style={{ color: "#111" }}>{labels.join(", ")}</span>;
      }
      const opt = field.config?.options?.find((o: any) => o.value === value);
      if (!opt && !value) return empty;
      return <span style={{ color: "#111" }}>{opt?.label || value}</span>;
    }

    if (field.fieldType === "number" && field.config?.unit) {
      if (value === null || value === undefined || value === "") return empty;
      const unit = field.config.unit as string;
      const pos = (field.config.unitPosition as string) || "suffix";
      return (
        <span style={{ color: "#111" }}>
          {pos === "prefix" ? `${unit} ${value}` : `${value} ${unit}`}
        </span>
      );
    }

    if (!value && value !== 0 && value !== false) return empty;
    return <span style={{ color: "#111" }}>{String(value)}</span>;
  };

  // ── Record rendering ──────────────────────────────────────────────────────

  const renderRecordFields = (record: PrintRecord, fields: EntryField[]) => {
    const activeAliasId = record.aliasId || "";
    const visibleFields = fields.filter((f) => {
      if (!f.aliasIds || f.aliasIds.length === 0) return true;
      return activeAliasId ? f.aliasIds.includes(activeAliasId) : false;
    });
    const fieldsWithValues = visibleFields.filter((f) => {
      const v = record.fieldData?.[f.id];
      return (
        v !== undefined &&
        v !== null &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0)
      );
    });
    if (fieldsWithValues.length === 0) return null;

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "10px 20px",
          marginTop: 12,
        }}
      >
        {fieldsWithValues.map((field) => (
          <div key={field.id} style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 2,
              }}
            >
              {field.name}
            </div>
            <div style={{ fontSize: 13, color: "#111" }}>
              {renderFieldValue(
                field,
                record.fieldData?.[field.id],
                record.id,
                record.lookups,
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderRecordRelated = (record: PrintRecord) => {
    if (!record.relatedSections || record.relatedSections.length === 0)
      return null;
    const sections = record.relatedSections.filter(
      (s) => (record.relatedRecords?.[s.id] || []).length > 0,
    );
    if (sections.length === 0) return null;

    return (
      <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#444",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 10,
          }}
        >
          Related
        </div>
        {[...sections]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((sec) => {
            const recs = (record.relatedRecords?.[sec.id] || []).sort((a: any, b: any) =>
              a.name.localeCompare(b.name),
            );
            return (
              <div key={sec.id} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#666",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  {sec.name}
                </div>
                {recs.map((r: any) => {
                  const relType = entryTypes.find((t) => t.id === r.entryTypeId);
                  const relAlias = r.aliasId
                    ? (aliasesByTypeId[r.entryTypeId] || []).find(
                        (a) => a.id === r.aliasId,
                      )
                    : undefined;
                  const badge = relAlias?.singularName || relType?.singularName;
                  return (
                    <div
                      key={r.id + (r.bToA || "")}
                      style={{ fontSize: 13, color: "#111", marginBottom: 2 }}
                    >
                      {r.name}
                      {badge && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            color: "#666",
                            border: "1px solid #ccc",
                            borderRadius: 3,
                            padding: "0 4px",
                          }}
                        >
                          {badge}
                        </span>
                      )}
                      {r.bToA && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: "#999" }}>
                          ({r.bToA})
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
      </div>
    );
  };

  const renderRecordAttachments = (record: PrintRecord) => {
    if (!record.attachments || record.attachments.length === 0) return null;
    return (
      <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#444",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 8,
          }}
        >
          Attachments
        </div>
        {record.attachments.map((att) => (
          <div key={att.id} style={{ fontSize: 13, color: "#111", marginBottom: 2 }}>
            {att.filename}
            <span style={{ marginLeft: 8, fontSize: 11, color: "#666" }}>
              {(att.size / 1024).toFixed(1)} KB
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderRecord = (
    record: PrintRecord,
    fields: EntryField[],
    isSingleRecord: boolean,
  ) => {
    const alias = record.aliasId
      ? (aliasesByTypeId[record.entryTypeId] || []).find(
          (a) => a.id === record.aliasId,
        )
      : undefined;
    const et = entryTypes.find((t) => t.id === record.entryTypeId);
    const iconSize = isSingleRecord ? 56 : 32;
    const nameSize = isSingleRecord ? 20 : 15;

    return (
      <div
        key={record.id}
        style={{
          paddingBottom: 20,
          marginBottom: 20,
          borderBottom: "1px solid #e2e8f0",
          pageBreakInside: "avoid",
          breakInside: "avoid",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: isSingleRecord ? 8 : 4,
              overflow: "hidden",
              flexShrink: 0,
              background: "#f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {record.hasIcon ? (
              <img
                src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${record.entryTypeId}/records/${record.id}/icon`}
                style={{ width: iconSize, height: iconSize, objectFit: "cover" }}
                alt=""
              />
            ) : et ? (
              <span
                style={{
                  fontSize: isSingleRecord ? 20 : 12,
                  fontWeight: 700,
                  color: et.fgColor || "#888",
                }}
              >
                {et.singularName[0]}
              </span>
            ) : null}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: nameSize, fontWeight: 700, color: "#111" }}>
              {record.name}
            </div>
            {record.blurb && (
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                {record.blurb}
              </div>
            )}
            {alias && (
              <span
                style={{
                  display: "inline-block",
                  marginTop: 4,
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: 3,
                  border: "1px solid #ccc",
                  color: "#555",
                }}
              >
                {alias.singularName}
              </span>
            )}
          </div>
        </div>

        {renderRecordFields(record, fields)}
        {isSingleRecord && renderRecordRelated(record)}
        {isSingleRecord && renderRecordAttachments(record)}
      </div>
    );
  };

  // ── Print content ─────────────────────────────────────────────────────────

  const renderContent = () => {
    if (printData.length === 0) {
      return (
        <div style={{ color: "#666", textAlign: "center", padding: 40 }}>
          No data to print.
        </div>
      );
    }

    const isSingleRecord = scope === "record";

    return (
      <div>
        {scope === "lorebook" && lorebookName && (
          <div style={{ marginBottom: 32 }}>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#111",
                margin: "0 0 10px",
              }}
            >
              {lorebookName}
            </h1>
            <div style={{ borderBottom: "2px solid #111" }} />
          </div>
        )}

        {printData.map((typeData, typeIdx) => {
          const { entryType, fields, records } = typeData;
          if (records.length === 0 && !isSingleRecord) return null;

          return (
            <div
              key={entryType.id}
              style={
                typeIdx > 0
                  ? { pageBreakBefore: "always", breakBefore: "page", paddingTop: 24 }
                  : {}
              }
            >
              {!isSingleRecord && (
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        overflow: "hidden",
                        flexShrink: 0,
                        background: "#f1f5f9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {entryType.hasIcon ? (
                        <img
                          src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryType.id}/icon`}
                          style={{ width: 28, height: 28, objectFit: "cover" }}
                          alt=""
                        />
                      ) : (
                        <span style={{ color: "#888" }}>
                          <Icon name={(entryType.icon as any) || "file"} size={14} />
                        </span>
                      )}
                    </div>
                    <h2
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: "#111",
                        margin: 0,
                      }}
                    >
                      {aliasName || entryType.pluralName}
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 13,
                          fontWeight: 400,
                          color: "#666",
                        }}
                      >
                        ({records.length})
                      </span>
                    </h2>
                  </div>
                  <div style={{ borderBottom: "1px solid #cbd5e1", marginBottom: 20 }} />
                </div>
              )}

              <div>
                {records.map((record) =>
                  renderRecord(record, fields, isSingleRecord),
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="lk-print-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#fff",
        overflowY: "auto",
        color: "#111",
      }}
    >
      <style>{`
        @media print {
          .lk-print-toolbar { display: none !important; }
          .lk-print-overlay {
            position: static !important;
            overflow: visible !important;
            height: auto !important;
          }
        }
      `}</style>

      {/* Toolbar */}
      <div
        className="lk-print-toolbar"
        style={{
          position: "sticky",
          top: 0,
          background: "#0f172a",
          borderBottom: "1px solid #1e293b",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 1,
        }}
      >
        <span style={{ color: "#94a3b8", fontWeight: 600, fontSize: 13 }}>
          Print Preview
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => window.print()}
            style={{
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="print" size={14} />
            Print
          </button>
          <ButtonIcon name="close" label="Close preview" onClick={onClose} />
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          padding: "32px 48px",
          maxWidth: 860,
          margin: "0 auto",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <Spinner />
          </div>
        ) : (
          renderContent()
        )}
      </div>
    </div>
  );
}
