"use client";

import { useState, useEffect, useRef } from "react";
import { Icon, Spinner } from "@applicator/sdk/components";
import type { FormLayout } from "@applicator/sdk/components";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  hasIcon: boolean;
  bgColor: string;
  fgColor: string;
  formLayout?: FormLayout | null;
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
  entryTypeName: string;
  fieldName: string;
}

interface RecordLookup {
  id: string;
  customFieldId: string;
  record1: string;
  record2: string;
  aToB: string;
  bToA: string;
  record1Name: string;
  record2Name: string;
  record1TypeId: string;
  record2TypeId: string;
  record1HasIcon: boolean;
  record2HasIcon: boolean;
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
  relatedRecords: Record<string, any[]>; // keyed by section id
  attachments?: Attachment[];
}

interface PrintTypeData {
  entryType: EntryType;
  fields: EntryField[];
  sections: EntrySection[];
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
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Once data is loaded and the hidden div has been rendered into the DOM,
  // extract its HTML, write it to a new tab, then unmount.
  useEffect(() => {
    if (loading) return;
    const content = contentRef.current;
    if (!content) return;

    const title = getTitle();
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(buildPrintDocument(title, content.innerHTML));
      win.document.close();
    }
    onClose();
  }, [loading]);

  const getTitle = (): string => {
    if (scope === "record" && printData[0]?.records[0]) {
      return printData[0].records[0].name;
    }
    if (scope === "type" && printData[0]) {
      return aliasName || printData[0].entryType.pluralName;
    }
    return lorebookName || "Lorekeeper";
  };

  const buildPrintDocument = (title: string, bodyHTML: string): string => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title.replace(/</g, "&lt;")}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111;
      background: #fff;
      margin: 0 auto;
      padding: 32px 48px;
      max-width: 860px;
    }
    #lk-print-btn {
      position: fixed;
      top: 16px;
      right: 16px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    @media print {
      #lk-print-btn { display: none !important; }
      body { padding: 20px; max-width: none; }
    }
  </style>
</head>
<body>
  <button id="lk-print-btn" onclick="window.print()">&#x1F5A8; Print</button>
  ${bodyHTML}
</body>
</html>`;

  // ── Data fetching ─────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      if (scope === "record" && entryTypeId && recordId) {
        const data = await fetchSingleRecord(entryTypeId, recordId);
        if (data) setPrintData([data]);
      } else if (scope === "type" && entryTypeId) {
        const data = await fetchMultipleTypes([entryTypeId], aliasId);
        setPrintData(data);
      } else if (scope === "lorebook") {
        const activeTypeIds = entryTypes
          .filter((t) => !t.isGroup)
          .map((t) => t.id);
        const data = await fetchMultipleTypes(activeTypeIds);
        setPrintData(data);
      }
    } catch (e) {
      console.error("PrintModal fetch error:", e);
    }
    setLoading(false);
  };

  // ── Single-record fetch ───────────────────────────────────────────────────

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
    const allSections: EntrySection[] = secRes.ok
      ? (await secRes.json()).sections || []
      : [];

    const relatedSections = allSections.filter(
      (s) => s.sectionType === "related_list",
    );

    // Bulk-fetch records for all related types
    const relatedTypeIds = [
      ...new Set(
        relatedSections
          .flatMap((s) => (s.relatedItems || []).map((item) => item.entryTypeId))
          .filter(Boolean),
      ),
    ] as string[];

    let recordsByType: Record<string, any[]> = {};
    if (relatedTypeIds.length > 0) {
      const bulkRes = await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/records?typeIds=${relatedTypeIds.join(",")}`,
      );
      recordsByType = bulkRes.ok
        ? (await bulkRes.json()).recordsByTypeId || {}
        : {};
    }

    const relatedRecords = computeRelatedRecords(
      rId,
      relatedSections,
      lookups,
      recordsByType,
    );

    const et = entryTypes.find((t) => t.id === typeId);
    if (!et) return null;

    return {
      entryType: et,
      fields,
      sections: allSections,
      records: [{ ...record, lookups, relatedRecords, attachments }],
    };
  };

  // ── Multi-type fetch ──────────────────────────────────────────────────────

  const fetchMultipleTypes = async (
    typeIds: string[],
    filterAliasId?: string,
  ): Promise<PrintTypeData[]> => {
    if (typeIds.length === 0) return [];

    // Fetch fields and sections for all types in parallel
    const [fieldsMap, sectionsMap] = await Promise.all([
      Promise.all(
        typeIds.map(async (typeId) => {
          const res = await fetch(
            `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/fields`,
          );
          return [typeId, res.ok ? (await res.json()).fields || [] : []] as [
            string,
            EntryField[],
          ];
        }),
      ).then(Object.fromEntries),

      Promise.all(
        typeIds.map(async (typeId) => {
          const res = await fetch(
            `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/sections?includeRelated=true`,
          );
          return [typeId, res.ok ? (await res.json()).sections || [] : []] as [
            string,
            EntrySection[],
          ];
        }),
      ).then(Object.fromEntries),
    ]);

    // Fetch primary records
    let primaryRecordsByTypeId: Record<string, any[]> = {};
    if (typeIds.length === 1 && filterAliasId) {
      const res = await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeIds[0]}/records?aliasId=${filterAliasId}`,
      );
      if (res.ok) {
        const { records } = await res.json();
        primaryRecordsByTypeId[typeIds[0]] = records || [];
      }
    } else {
      const res = await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/records?typeIds=${typeIds.join(",")}`,
      );
      if (res.ok) {
        primaryRecordsByTypeId = (await res.json()).recordsByTypeId || {};
      }
    }

    // Identify all extra type IDs referenced in related_list sections
    const extraTypeIds = [
      ...new Set(
        typeIds
          .flatMap((typeId) => sectionsMap[typeId] || [])
          .filter((s: EntrySection) => s.sectionType === "related_list")
          .flatMap((s: EntrySection) =>
            (s.relatedItems || []).map((item) => item.entryTypeId),
          )
          .filter((id: string) => id && !typeIds.includes(id)),
      ),
    ] as string[];

    // Fetch records for any related types not already in the primary set
    let extraRecordsByTypeId: Record<string, any[]> = {};
    if (extraTypeIds.length > 0) {
      const res = await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/records?typeIds=${extraTypeIds.join(",")}`,
      );
      if (res.ok) {
        extraRecordsByTypeId = (await res.json()).recordsByTypeId || {};
      }
    }

    const allRecordsByTypeId: Record<string, any[]> = {
      ...primaryRecordsByTypeId,
      ...extraRecordsByTypeId,
    };

    // Fetch lookups for every primary record in parallel
    const allRecordEntries: Array<{ typeId: string; rId: string }> = typeIds.flatMap(
      (typeId) =>
        (primaryRecordsByTypeId[typeId] || []).map((r: any) => ({
          typeId,
          rId: r.id,
        })),
    );

    const lookupsByRecordId: Record<string, RecordLookup[]> = {};
    await Promise.all(
      allRecordEntries.map(async ({ typeId, rId }) => {
        const res = await fetch(
          `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/records/${rId}/lookups`,
        );
        lookupsByRecordId[rId] = res.ok ? (await res.json()).lookups || [] : [];
      }),
    );

    // Assemble PrintTypeData
    return typeIds
      .filter((typeId) => {
        const et = entryTypes.find((t) => t.id === typeId);
        return et && !et.isGroup;
      })
      .map((typeId) => {
        const et = entryTypes.find((t) => t.id === typeId)!;
        const allSections: EntrySection[] = sectionsMap[typeId] || [];
        const relatedSections = allSections.filter(
          (s) => s.sectionType === "related_list",
        );

        const records: PrintRecord[] = (
          primaryRecordsByTypeId[typeId] || []
        ).map((r: any) => {
          const lookups = lookupsByRecordId[r.id] || [];
          const relatedRecords = computeRelatedRecords(
            r.id,
            relatedSections,
            lookups,
            allRecordsByTypeId,
          );
          return { ...r, lookups, relatedRecords };
        });

        return {
          entryType: et,
          fields: fieldsMap[typeId] || [],
          sections: allSections,
          records,
        };
      });
  };

  // ── Related records helper ────────────────────────────────────────────────

  const computeRelatedRecords = (
    rId: string,
    relatedSections: EntrySection[],
    lookups: RecordLookup[],
    allRecordsByTypeId: Record<string, any[]>,
  ): Record<string, any[]> => {
    const result: Record<string, any[]> = {};
    for (const sec of relatedSections) {
      const items: RelatedListItem[] = sec.relatedItems || [];
      const secRecs: any[] = [];
      for (const item of items) {
        const typeRecs = allRecordsByTypeId[item.entryTypeId] || [];
        // Related sections show records that reference THIS record (record2 === rId)
        const fieldLookups = lookups.filter(
          (lk) => lk.customFieldId === item.fieldId && lk.record2 === rId,
        );
        for (const lk of fieldLookups) {
          const other = typeRecs.find((r: any) => r.id === lk.record1);
          if (other) {
            secRecs.push({
              ...other,
              entryTypeId: item.entryTypeId,
              bToA: lk.bToA,
            });
          }
        }
      }
      result[sec.id] = secRecs;
    }
    return result;
  };

  // ── Field value rendering (mirrors EntryRecordView.renderFieldValue) ──────

  const renderFieldValue = (
    field: EntryField,
    value: any,
    record: PrintRecord,
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
      return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 32,
              height: 18,
              borderRadius: 9,
              background: value ? "#3b82f6" : "#ccc",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 2,
                left: value ? 14 : 2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "#fff",
              }}
            />
          </div>
        </div>
      );
    }

    if (field.fieldType === "lookup") {
      const fieldLookups = record.lookups.filter(
        (lk) => lk.customFieldId === field.id && lk.record1 === record.id,
      );
      if (fieldLookups.length === 0) return empty;
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {fieldLookups.map((lk) => {
            const isRecord1 = lk.record1 === record.id;
            const otherName = isRecord1 ? lk.record2Name : lk.record1Name;
            const otherTypeId = isRecord1 ? lk.record2TypeId : lk.record1TypeId;
            const et = entryTypes.find((t) => t.id === otherTypeId);
            return (
              <span
                key={lk.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  borderRadius: 4,
                  padding: "2px 6px",
                  fontSize: 12,
                  color: "#111",
                }}
              >
                {et && (
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      background: et.bgColor || "#cbd5e1",
                      flexShrink: 0,
                      display: "inline-block",
                    }}
                  />
                )}
                {otherName}
              </span>
            );
          })}
        </div>
      );
    }

    if (field.fieldType === "picklist") {
      if (field.config?.multiselect) {
        const vals = Array.isArray(value) ? value : value ? [value] : [];
        if (vals.length === 0) return empty;
        const sortedVals = [...vals].sort((a: string, b: string) => {
          const la = field.config?.options?.find((o: any) => o.value === a)?.label || a;
          const lb = field.config?.options?.find((o: any) => o.value === b)?.label || b;
          return la.localeCompare(lb);
        });
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {sortedVals.map((v: string) => {
              const opt = field.config?.options?.find((o: any) => o.value === v);
              return (
                <span
                  key={v}
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #e2e8f0",
                    borderRadius: 4,
                    padding: "1px 6px",
                    fontSize: 12,
                    color: "#111",
                  }}
                >
                  {opt?.label || v}
                </span>
              );
            })}
          </div>
        );
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

    if (field.fieldType === "date" || field.fieldType === "datetime") {
      if (!value) return empty;
      return <span style={{ color: "#111" }}>{String(value)}</span>;
    }

    if (field.fieldType === "color") {
      if (!value) return empty;
      return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 2,
              background: value,
              border: "1px solid #e2e8f0",
              flexShrink: 0,
              display: "inline-block",
            }}
          />
          <span style={{ color: "#111" }}>{value}</span>
        </div>
      );
    }

    if (field.fieldType === "range") {
      if (value === null || value === undefined || value === "") return empty;
      const min = field.config?.min ?? 0;
      const max = field.config?.max ?? 100;
      const pct = Math.max(0, Math.min(100, ((Number(value) - min) / (max - min)) * 100));
      return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#111" }}>{String(value)}</span>
          <div
            style={{
              display: "inline-block",
              width: 60,
              height: 4,
              background: "#e2e8f0",
              borderRadius: 2,
              overflow: "hidden",
              verticalAlign: "middle",
              flexShrink: 0,
            }}
          >
            <div style={{ height: "100%", background: "#3b82f6", width: `${pct}%` }} />
          </div>
        </div>
      );
    }

    if (!value && value !== 0 && value !== false) return empty;
    return <span style={{ color: "#111" }}>{String(value)}</span>;
  };

  // ── Fields rendering ──────────────────────────────────────────────────────

  // Mirrors EntryRecordView: uses formLayout if present, else flat list.
  // Shows ALL alias-visible fields (including empty), exactly as the entry page does.
  const renderFields = (
    record: PrintRecord,
    fields: EntryField[],
    entryType: EntryType,
  ) => {
    const activeAliasId = record.aliasId || "";
    const formLayout = entryType.formLayout;
    const hasFormLayout =
      formLayout && formLayout.sections && formLayout.sections.length > 0;

    if (hasFormLayout) {
      return renderFormLayout(record, fields, formLayout!, activeAliasId);
    }
    return renderFlatFields(record, fields, activeAliasId);
  };

  const renderFormLayout = (
    record: PrintRecord,
    fields: EntryField[],
    formLayout: FormLayout,
    activeAliasId: string,
  ) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {formLayout.sections.map((sec) => {
          // Section alias visibility: empty aliasIds = show for all aliases
          if (
            sec.aliasIds &&
            sec.aliasIds.length > 0 &&
            (!activeAliasId || !sec.aliasIds.includes(activeAliasId))
          ) {
            return null;
          }

          // Check if any columns in this section have visible fields
          const hasVisibleFields = sec.rows.some((row) =>
            row.columns.some((col) => {
              if (!col.fieldId) return false;
              const field = fields.find((f) => f.id === col.fieldId);
              if (!field) return false;
              if (
                field.aliasIds &&
                field.aliasIds.length > 0 &&
                (!activeAliasId || !field.aliasIds.includes(activeAliasId))
              ) {
                return false;
              }
              return true;
            }),
          );
          if (!hasVisibleFields) return null;

          return (
            <div key={sec.id}>
              {sec.name && (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#666",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    marginBottom: 10,
                    paddingBottom: 4,
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {sec.name}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sec.rows.map((row) => {
                  const visibleCols = row.columns.filter((col) => {
                    if (!col.fieldId) return false;
                    const field = fields.find((f) => f.id === col.fieldId);
                    if (!field) return false;
                    if (
                      field.aliasIds &&
                      field.aliasIds.length > 0 &&
                      (!activeAliasId || !field.aliasIds.includes(activeAliasId))
                    ) {
                      return false;
                    }
                    return true;
                  });
                  if (visibleCols.length === 0) return null;

                  return (
                    <div
                      key={row.id}
                      style={{ display: "flex", gap: 16, alignItems: "flex-start" }}
                    >
                      {visibleCols.map((col) => {
                        const field = fields.find((f) => f.id === col.fieldId)!;
                        // Use the column's proportional width among visible cols
                        return (
                          <div key={col.id} style={{ flex: col.width, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#666",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                marginBottom: 3,
                              }}
                            >
                              {field.name}
                            </div>
                            <div style={{ fontSize: 13, color: "#111" }}>
                              {renderFieldValue(field, record.fieldData?.[field.id], record)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderFlatFields = (
    record: PrintRecord,
    fields: EntryField[],
    activeAliasId: string,
  ) => {
    const visibleFields = fields.filter((f) => {
      if (!f.aliasIds || f.aliasIds.length === 0) return true;
      return activeAliasId ? f.aliasIds.includes(activeAliasId) : false;
    });
    if (visibleFields.length === 0) return null;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {visibleFields.map((field) => (
          <div key={field.id}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 3,
              }}
            >
              {field.name}
            </div>
            <div style={{ fontSize: 13, color: "#111" }}>
              {renderFieldValue(field, record.fieldData?.[field.id], record)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Related sections rendering ────────────────────────────────────────────

  const renderRelatedSections = (
    record: PrintRecord,
    sections: EntrySection[],
  ) => {
    const relatedSections = sections.filter(
      (s) => s.sectionType === "related_list",
    );
    const nonEmptySections = relatedSections.filter(
      (s) => (record.relatedRecords[s.id] || []).length > 0,
    );
    if (nonEmptySections.length === 0) return null;

    return (
      <div style={{ marginTop: 20, borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#111",
            marginBottom: 12,
          }}
        >
          Related
        </div>
        {[...nonEmptySections]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((sec) => {
            const recs = (record.relatedRecords[sec.id] || []).sort(
              (a: any, b: any) => a.name.localeCompare(b.name),
            );

            // Group by bToA label (mirrors EntryRecordView)
            const groups: Record<string, any[]> = {};
            for (const r of recs) {
              const label = r.bToA || "";
              if (!groups[label]) groups[label] = [];
              groups[label].push(r);
            }
            const groupLabels = Object.keys(groups).sort((a, b) => {
              if (a === "" && b !== "") return 1;
              if (b === "" && a !== "") return -1;
              return a.localeCompare(b);
            });
            const hasNamedGroups = groupLabels.some((l) => l !== "");

            return (
              <div key={sec.id} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#555",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 6,
                  }}
                >
                  {sec.name}
                </div>
                {hasNamedGroups ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {groupLabels.map((label) => (
                      <div key={label}>
                        {label && (
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#888",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              marginBottom: 3,
                            }}
                          >
                            {label}
                          </div>
                        )}
                        {groups[label]
                          .sort((a: any, b: any) => a.name.localeCompare(b.name))
                          .map((r: any) => renderRelatedRecord(r))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    {recs.map((r: any) => renderRelatedRecord(r))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    );
  };

  const renderRelatedRecord = (r: any) => {
    const relType = entryTypes.find((t) => t.id === r.entryTypeId);
    const relAlias = r.aliasId
      ? (aliasesByTypeId[r.entryTypeId] || []).find((a) => a.id === r.aliasId)
      : undefined;
    const badgeName = relAlias?.singularName || relType?.singularName;
    const badgeBg = relAlias?.bgColor || relType?.bgColor || "#e2e8f0";
    const badgeFg = relAlias?.fgColor || relType?.fgColor || "#555";

    return (
      <div
        key={r.id + (r.bToA || "")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 0",
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            overflow: "hidden",
            flexShrink: 0,
            background: "#f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {r.hasIcon ? (
            <img
              src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${r.entryTypeId}/records/${r.id}/icon`}
              style={{ width: 20, height: 20, objectFit: "cover" }}
              alt=""
            />
          ) : relType ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#888" }}>
              {relType.singularName[0]}
            </span>
          ) : null}
        </div>
        <span style={{ flex: 1, fontSize: 13, color: "#111" }}>{r.name}</span>
        {r.blurb && (
          <span
            style={{
              fontSize: 11,
              color: "#666",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 180,
            }}
          >
            {r.blurb}
          </span>
        )}
        {badgeName && (
          <span
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 4,
              background: badgeBg,
              color: badgeFg,
              flexShrink: 0,
            }}
          >
            {badgeName}
          </span>
        )}
      </div>
    );
  };

  // ── Attachments rendering ─────────────────────────────────────────────────

  const renderAttachments = (record: PrintRecord) => {
    if (!record.attachments || record.attachments.length === 0) return null;
    return (
      <div style={{ marginTop: 20, borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#111",
            marginBottom: 8,
          }}
        >
          Attachments
        </div>
        {record.attachments.map((att) => (
          <div
            key={att.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "3px 0",
              fontSize: 13,
              color: "#111",
            }}
          >
            <Icon name="file" size={13} />
            {att.filename}
            <span style={{ fontSize: 11, color: "#888" }}>
              {(att.size / 1024).toFixed(1)} KB
            </span>
          </div>
        ))}
      </div>
    );
  };

  // ── Record rendering ──────────────────────────────────────────────────────

  const renderRecord = (
    record: PrintRecord,
    fields: EntryField[],
    sections: EntrySection[],
    entryType: EntryType,
    isSingleRecord: boolean,
    isLast: boolean,
  ) => {
    const alias = record.aliasId
      ? (aliasesByTypeId[record.entryTypeId] || []).find(
          (a) => a.id === record.aliasId,
        )
      : undefined;
    const iconSize = isSingleRecord ? 64 : 32;

    return (
      <div
        key={record.id}
        style={{
          paddingBottom: 24,
          marginBottom: isLast ? 0 : 24,
          borderBottom: isLast ? "none" : "1px solid #e2e8f0",
          pageBreakInside: "avoid",
          breakInside: "avoid",
          pageBreakAfter: isLast ? "auto" : "always",
          breakAfter: isLast ? "auto" : "page",
        }}
      >
        {/* Entry heading */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: isSingleRecord ? 10 : 6,
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
            ) : (
              <span style={{ color: "#999" }}>
                <Icon
                  name={(entryType.icon as any) || "file"}
                  size={isSingleRecord ? 28 : 14}
                />
              </span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: isSingleRecord ? 22 : 15,
                fontWeight: 700,
                color: "#111",
              }}
            >
              {record.name}
            </div>
            {record.blurb && (
              <div style={{ fontSize: 13, color: "#555", marginTop: 3 }}>
                {record.blurb}
              </div>
            )}
            {alias && (
              <span
                style={{
                  display: "inline-block",
                  marginTop: 5,
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: alias.bgColor || "#f1f5f9",
                  color: alias.fgColor || "#555",
                  border: "1px solid #e2e8f0",
                }}
              >
                {alias.singularName}
              </span>
            )}
          </div>
        </div>

        <hr
          style={{
            border: "none",
            borderTop: "1px solid #e2e8f0",
            margin: "0 0 16px",
          }}
        />

        {/* Fields (respects formLayout exactly as the entry page does) */}
        {renderFields(record, fields, entryType)}

        {/* Related sections */}
        {renderRelatedSections(record, sections)}

        {/* Attachments (single record scope only) */}
        {isSingleRecord && renderAttachments(record)}
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
          <div style={{ marginBottom: 36 }}>
            <h1
              style={{ fontSize: 28, fontWeight: 800, color: "#111", margin: "0 0 10px" }}
            >
              {lorebookName}
            </h1>
            <div style={{ borderBottom: "2px solid #111" }} />
          </div>
        )}

        {printData.map((typeData, typeIdx) => {
          const { entryType, fields, sections, records } = typeData;
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
                <div>
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
                        <span style={{ color: "#999" }}>
                          <Icon
                            name={(entryType.icon as any) || "file"}
                            size={14}
                          />
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
                          color: "#888",
                        }}
                      >
                        ({records.length})
                      </span>
                    </h2>
                  </div>
                  <div style={{ borderBottom: "1px solid #cbd5e1", marginBottom: 24 }} />
                </div>
              )}

              <div>
                {records.map((record, recordIdx) =>
                  renderRecord(
                    record,
                    fields,
                    sections,
                    entryType,
                    isSingleRecord,
                    recordIdx === records.length - 1 &&
                      typeIdx === printData.length - 1,
                  ),
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
    <>
      {/* Loading overlay — visible while data is being fetched */}
      {loading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#1e293b",
              borderRadius: 10,
              padding: "20px 28px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <Spinner />
            <span style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 500 }}>
              Preparing print preview…
            </span>
          </div>
        </div>
      )}

      {/* Off-screen hidden container — rendered after data loads so innerHTML
          can be extracted and written into the new tab. */}
      {!loading && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: -9999,
            top: 0,
            width: 860,
            visibility: "hidden",
            pointerEvents: "none",
            zIndex: -1,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            color: "#111",
            background: "#fff",
          }}
        >
          <div ref={contentRef}>{renderContent()}</div>
        </div>
      )}
    </>
  );
}
