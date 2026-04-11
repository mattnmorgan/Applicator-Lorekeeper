"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ButtonIcon, Icon, ConfirmModal, Spinner,
  RichTextEditor, RichTextViewer, FilePreview, isPreviewSupported,
  FormViewer, DynamicInput,
} from "@applicator/sdk/components";
import type { FormLayout, FormViewerField } from "@applicator/sdk/components";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  bgColor: string;
  fgColor: string;
  formLayout?: FormLayout | null;
}

interface EntryRecord {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  entryTypeId: string;
  aliasId?: string;
  fieldData: Record<string, any>;
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
  required?: boolean;
  tooltip?: string;
  sortOrder: number;
}

interface EntrySection {
  id: string;
  name: string;
  sectionType: "fields" | "related_list";
  sortOrder: number;
  config?: { aliasIds?: string[] };
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
  mimeType: string;
  size: number;
  hasThumb: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  lorebookId: string;
  entryTypeId: string;
  recordId: string;
  entryTypes: EntryType[];
  aliases?: EntryTypeAlias[];
  canEdit: boolean;
  onBack: () => void;
  onNavigateRecord: (typeId: string, recordId: string) => void;
  addToast: (message: string, type?: "success" | "error") => void;
}

// ─── EntryRecordView ──────────────────────────────────────────────────────────

export default function EntryRecordView({
  lorebookId,
  entryTypeId,
  recordId,
  entryTypes,
  aliases = [],
  canEdit,
  onBack,
  onNavigateRecord,
  addToast,
}: Props) {
  const [record, setRecord] = useState<EntryRecord | null>(null);
  const [fields, setFields] = useState<EntryField[]>([]);
  const [relatedSections, setRelatedSections] = useState<EntrySection[]>([]);
  const [relatedBySec, setRelatedBySec] = useState<Record<string, RelatedListItem[]>>({});
  const [lookups, setLookups] = useState<RecordLookup[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [relatedRecords, setRelatedRecords] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [previewFile, setPreviewFile] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [iconVersion, setIconVersion] = useState(0);

  const entryType = entryTypes.find((t) => t.id === entryTypeId);
  const baseUrl = `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/records/${recordId}`;

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, fieldRes, secRes, attRes, lookRes] = await Promise.all([
        fetch(baseUrl),
        fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/fields`),
        fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/sections`),
        fetch(`${baseUrl}/attachments`),
        fetch(`${baseUrl}/lookups`),
      ]);

      if (recRes.ok) {
        const d = await recRes.json();
        setRecord(d);
        setEditValues({ name: d.name, blurb: d.blurb, aliasId: d.aliasId || "", fieldData: { ...(d.fieldData || {}) } });
      }
      if (fieldRes.ok) setFields((await fieldRes.json()).fields || []);
      if (attRes.ok) setAttachments((await attRes.json()).attachments || []);
      if (lookRes.ok) setLookups((await lookRes.json()).lookups || []);

      if (secRes.ok) {
        const { sections: secs } = await secRes.json();
        const relSecs = (secs || []).filter((s: EntrySection) => s.sectionType === "related_list");
        setRelatedSections(relSecs);
        const relMap: Record<string, RelatedListItem[]> = {};
        await Promise.all(relSecs.map(async (sec: EntrySection) => {
          const r = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/sections/${sec.id}/related`);
          if (r.ok) relMap[sec.id] = (await r.json()).items || [];
        }));
        setRelatedBySec(relMap);
      }
    } catch {}
    setLoading(false);
  }, [baseUrl, lorebookId, entryTypeId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Fetch related list data
  useEffect(() => {
    const fetchRelated = async () => {
      const result: Record<string, any[]> = {};
      for (const [secId, items] of Object.entries(relatedBySec)) {
        const recordsForSec: any[] = [];
        for (const item of items) {
          try {
            const allRes = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${item.entryTypeId}/records?search=`);
            const myLookupRes = await fetch(`${baseUrl}/lookups?fieldId=${item.fieldId}`);
            if (allRes.ok && myLookupRes.ok) {
              const allData = await allRes.json();
              const myLookups = (await myLookupRes.json()).lookups || [];
              for (const lk of myLookups) {
                const otherId = lk.record1 === recordId ? lk.record2 : lk.record1;
                const otherRecord = allData.records.find((r: any) => r.id === otherId);
                if (otherRecord) recordsForSec.push({ ...otherRecord, entryTypeId: item.entryTypeId, entryTypeName: item.entryTypeName, lookupId: lk.id });
              }
            }
          } catch {}
        }
        result[secId] = recordsForSec;
      }
      setRelatedRecords(result);
    };
    if (Object.keys(relatedBySec).length > 0) fetchRelated();
  }, [relatedBySec, recordId]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!record) return;
    // Validate required fields
    const missingRequired = fields.filter((f) => {
      if (!f.required) return false;
      const val = editValues.fieldData?.[f.id];
      if (val === undefined || val === null || val === "") return true;
      if (Array.isArray(val) && val.length === 0) return true;
      return false;
    });
    if (missingRequired.length > 0) {
      addToast(`Required fields missing: ${missingRequired.map((f) => f.name).join(", ")}`, "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(baseUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editValues.name, blurb: editValues.blurb, fieldData: editValues.fieldData, aliasId: editValues.aliasId ?? "" }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRecord(updated);
        setEditing(false);
        addToast("Saved");
      } else addToast("Failed to save", "error");
    } catch { addToast("Failed to save", "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(baseUrl, { method: "DELETE" });
      if (res.ok) { addToast(`${entryType?.singularName || "Entry"} deleted`); onBack(); }
      else addToast("Failed to delete", "error");
    } catch { addToast("Failed to delete", "error"); }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${baseUrl}/attachments`, { method: "POST", body: formData });
      if (res.ok) { const att = await res.json(); setAttachments((a) => [...a, att]); addToast("File attached"); }
      else addToast("Upload failed", "error");
    } catch { addToast("Upload failed", "error"); }
    finally { setUploading(false); }
  };

  const handleDeleteAttachment = async (att: Attachment) => {
    try {
      await fetch(`${baseUrl}/attachments/${att.id}`, { method: "DELETE" });
      setAttachments((a) => a.filter((x) => x.id !== att.id));
      addToast("Attachment deleted");
    } catch { addToast("Failed to delete attachment", "error"); }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length > 0) { files.forEach(handleUpload); e.preventDefault(); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const setFieldValue = (fieldId: string, value: any) => {
    setEditValues((prev) => ({ ...prev, fieldData: { ...prev.fieldData, [fieldId]: value } }));
  };

  // ── Field rendering ───────────────────────────────────────────────────────

  const renderFieldValue = (field: EntryField, value: any) => {
    if (field.fieldType === "rich_text") return <RichTextViewer html={value || ""} />;
    if (field.fieldType === "toggle") return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 32, height: 18, borderRadius: 9, background: value ? "#3b82f6" : "#334155", position: "relative", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 2, left: value ? 14 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
        </div>
      </div>
    );
    if (field.fieldType === "lookup") {
      const fieldLookups = lookups.filter((lk) => lk.customFieldId === field.id);
      if (fieldLookups.length === 0) return <span style={{ color: "#64748b" }}>—</span>;
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {fieldLookups.map((lk) => {
            const isRecord1 = lk.record1 === recordId;
            const otherId = isRecord1 ? lk.record2 : lk.record1;
            const otherName = isRecord1 ? lk.record2Name : lk.record1Name;
            const otherTypeId = isRecord1 ? lk.record2TypeId : lk.record1TypeId;
            const otherHasIcon = isRecord1 ? lk.record2HasIcon : lk.record1HasIcon;
            const label = isRecord1 ? lk.aToB : lk.bToA;
            const et = entryTypes.find((t) => t.id === otherTypeId);
            return (
              <div key={lk.id}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", borderRadius: 6, padding: "3px 8px", fontSize: 12, cursor: otherTypeId ? "pointer" : "default" }}
                onClick={() => { if (otherTypeId) onNavigateRecord(otherTypeId, otherId); }}
              >
                {otherHasIcon && otherTypeId ? (
                  <img src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${otherTypeId}/records/${otherId}/icon`} style={{ width: 16, height: 16, borderRadius: 2, objectFit: "cover", flexShrink: 0 }} alt="" />
                ) : et ? (
                  <span style={{ width: 16, height: 16, borderRadius: 2, background: et.bgColor || "#334155", color: et.fgColor || "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 600 }}>{et.singularName[0]}</span>
                ) : null}
                {label && <span style={{ color: "#64748b" }}>{label}:</span>}
                <span style={{ color: "#e2e8f0" }}>{otherName}</span>
              </div>
            );
          })}
        </div>
      );
    }
    if (field.fieldType === "picklist") {
      if (field.config?.multiselect) {
        const vals = Array.isArray(value) ? value : (value ? [value] : []);
        if (vals.length === 0) return <span style={{ color: "#64748b" }}>—</span>;
        const sortedVals = [...vals].sort((a: string, b: string) => {
          const la = field.config?.options?.find((o: any) => o.value === a)?.label || a;
          const lb = field.config?.options?.find((o: any) => o.value === b)?.label || b;
          return la.localeCompare(lb);
        });
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {sortedVals.map((v: string) => {
              const opt = field.config?.options?.find((o: any) => o.value === v);
              return <span key={v} style={{ background: "#334155", borderRadius: 4, padding: "2px 6px", fontSize: 12, color: "#e2e8f0" }}>{opt?.label || v}</span>;
            })}
          </div>
        );
      }
      const opt = field.config?.options?.find((o: any) => o.value === value);
      return <span>{opt?.label || value || <span style={{ color: "#64748b" }}>—</span>}</span>;
    }
    if (field.fieldType === "number" && field.config?.unit) {
      if (value === null || value === undefined || value === "") return <span style={{ color: "#64748b" }}>—</span>;
      const unit = field.config.unit as string;
      const pos = (field.config.unitPosition as string) || "suffix";
      return <span>{pos === "prefix" ? `${unit} ${value}` : `${value} ${unit}`}</span>;
    }
    if (!value && value !== 0 && value !== false) return <span style={{ color: "#64748b" }}>—</span>;
    return <span>{String(value)}</span>;
  };

  const renderFieldEditor = (field: EntryField) => {
    const value = editValues.fieldData?.[field.id];
    const cfg = field.config || {};

    if (field.fieldType === "text") {
      return (
        <DynamicInput
          input={{ id: field.id, label: "", type: "text", placeholder: "Enter value…" }}
          value={value || ""}
          onChange={(_, v) => setFieldValue(field.id, v)}
        />
      );
    }
    if (field.fieldType === "rich_text") {
      return <RichTextEditor value={value || ""} onChange={(v) => setFieldValue(field.id, v)} minHeight={100} />;
    }
    if (field.fieldType === "toggle") {
      return (
        <DynamicInput
          input={{ id: field.id, label: "", type: "toggle" }}
          value={!!value}
          onChange={(_, v) => setFieldValue(field.id, v)}
        />
      );
    }
    if (field.fieldType === "number") {
      return (
        <DynamicInput
          input={{ id: field.id, label: "", type: "number", min: cfg.min != null ? String(cfg.min) : undefined, max: cfg.max != null ? String(cfg.max) : undefined, step: cfg.decimals ? String(Math.pow(10, -cfg.decimals)) : "1", decimalPlaces: cfg.decimals ?? 0 }}
          value={value ?? ""}
          onChange={(_, v) => setFieldValue(field.id, v === "" ? null : Number(v))}
        />
      );
    }
    if (field.fieldType === "picklist") {
      const opts: Array<{ value: string; label: string }> = [...(cfg.options || [])].sort((a: any, b: any) => a.label.localeCompare(b.label));
      if (cfg.multiselect) {
        return (
          <DynamicInput
            input={{
              id: field.id,
              label: "",
              type: "badge-multiselect",
              options: opts,
            }}
            value={Array.isArray(value) ? value : (value ? [value] : [])}
            onChange={(_, v) => setFieldValue(field.id, v)}
          />
        );
      }
      return (
        <DynamicInput
          input={{
            id: field.id,
            label: "",
            type: "select",
            options: opts,
          }}
          value={value || ""}
          onChange={(_, v) => setFieldValue(field.id, v)}
        />
      );
    }
    if (field.fieldType === "lookup") {
      return (
        <LookupFieldEditor
          field={field}
          lorebookId={lorebookId}
          recordId={recordId}
          entryTypes={entryTypes}
          baseUrl={baseUrl}
          lookups={lookups}
          onAdded={(lk) => setLookups((l) => [...l, lk])}
          onRemoved={(id) => setLookups((l) => l.filter((x) => x.id !== id))}
        />
      );
    }
    return null;
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  const activeAlias = aliases.find((a) => a.id === (editing ? editValues.aliasId : record?.aliasId));
  const activeAliasId = activeAlias?.id;

  const formLayout = entryType?.formLayout;
  const hasFormLayout = formLayout && formLayout.sections.length > 0;

  // FormViewerField list for FormViewer
  const viewerFields: FormViewerField[] = fields.map((f) => ({
    id: f.id, name: f.name, fieldType: f.fieldType, aliasIds: f.aliasIds, required: f.required,
  }));

  // Returns inputDef stored on the layout column for this field, if any.
  const getColInputDef = (fieldId: string) => {
    if (!formLayout) return undefined;
    for (const sec of formLayout.sections) {
      for (const row of sec.rows) {
        for (const col of row.columns) {
          if (col.fieldId === fieldId) return col.inputDef;
        }
      }
    }
    return undefined;
  };

  const previewableAttachments = attachments.filter((a) => isPreviewSupported(a.filename));
  const previewIndex = previewFile ? previewableAttachments.findIndex((a) => a.id === previewFile.id) : -1;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner /></div>;
  if (!record) return <div style={{ padding: 20, color: "#64748b" }}>Entry not found.</div>;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid #1e293b", background: "#0f172a", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <ButtonIcon name="chevron-left" label={`Back to ${entryType?.pluralName || "entries"}`} onClick={onBack} />
          <div style={{ width: 28, height: 28, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {record.hasIcon
              ? <img src={`${baseUrl}/icon${iconVersion > 0 ? `?v=${iconVersion}` : ""}`} style={{ width: 28, height: 28, objectFit: "cover" }} alt="" />
              : <span style={{ color: "#64748b" }}><Icon name={(entryType?.icon as any) || "file"} size={14} /></span>
            }
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{record.name}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {canEdit && !editing && <ButtonIcon name="edit" label="Edit entry" onClick={() => setEditing(true)} />}
          {editing && (
            <>
              <ButtonIcon name="check" label="Save" onClick={handleSave} disabled={saving} />
              <ButtonIcon name="close" label="Cancel" onClick={() => {
                setEditing(false);
                setEditValues({ name: record.name, blurb: record.blurb, aliasId: record.aliasId || "", fieldData: { ...(record.fieldData || {}) } });
              }} />
            </>
          )}
          {canEdit && <ButtonIcon name="trash" label="Delete entry" subvariant="danger" onClick={() => setShowDelete(true)} />}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "20px 24px" }}>
        {/* Entry heading */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
          {/* Icon */}
          <div
            style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", cursor: canEdit ? "pointer" : "default", position: "relative" }}
            onClick={() => {
              if (!canEdit) return;
              const inp = document.createElement("input");
              inp.type = "file"; inp.accept = "image/*";
              inp.onchange = async () => {
                const file = inp.files?.[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const dataUrl = ev.target?.result as string;
                  const res = await fetch(`${baseUrl}/icon`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ iconData: dataUrl }) });
                  if (res.ok) { setRecord((r) => r ? { ...r, hasIcon: true } : r); setIconVersion((v) => v + 1); }
                };
                reader.readAsDataURL(file);
              };
              inp.click();
            }}
          >
            {record.hasIcon
              ? <img src={`${baseUrl}/icon${iconVersion > 0 ? `?v=${iconVersion}` : ""}`} style={{ width: 64, height: 64, objectFit: "cover" }} alt="" />
              : <span style={{ color: "#64748b" }}><Icon name={(entryType?.icon as any) || "file"} size={28} /></span>
            }
            {canEdit && editing && record.hasIcon && (
              <div style={{ position: "absolute", top: 2, right: 2 }}>
                <ButtonIcon name="close" label="Clear icon" size="sm" subvariant="danger" onClick={async (e) => {
                  (e as any).stopPropagation?.();
                  const res = await fetch(`${baseUrl}/icon`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ iconData: null }) });
                  if (res.ok) { setRecord((r) => r ? { ...r, hasIcon: false } : r); setIconVersion((v) => v + 1); }
                }} />
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}>
            {editing ? (
              <>
                <input value={editValues.name || ""} onChange={(e) => setEditValues((p) => ({ ...p, name: e.target.value }))}
                  style={{ fontSize: 20, fontWeight: 700, background: "#1e293b", border: "1px solid #3b82f6", borderRadius: 6, padding: "4px 10px", color: "#f1f5f9", outline: "none", width: "100%", boxSizing: "border-box", marginBottom: 8 }} />
                <input value={editValues.blurb || ""} onChange={(e) => setEditValues((p) => ({ ...p, blurb: e.target.value }))}
                  placeholder="Summary blurb…"
                  style={{ fontSize: 13, background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "4px 10px", color: "#94a3b8", outline: "none", width: "100%", boxSizing: "border-box", marginBottom: 8 }} />
                {aliases.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Subtype</div>
                    <select value={editValues.aliasId || ""} onChange={(e) => setEditValues((p) => ({ ...p, aliasId: e.target.value }))}
                      style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "4px 8px", color: "#f1f5f9", fontSize: 12, outline: "none" }}>
                      <option value="">None</option>
                      {aliases.map((a) => <option key={a.id} value={a.id}>{a.singularName}</option>)}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>{record.name}</div>
                {record.blurb && <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{record.blurb}</div>}
                {activeAlias && (
                  <span style={{ display: "inline-block", marginTop: 6, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: activeAlias.bgColor || "#1e293b", color: activeAlias.fgColor || "#94a3b8" }}>
                    {activeAlias.singularName}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #1e293b", margin: "0 0 20px" }} />

        {/* Fields — FormViewer if layout exists, else fallback linear list */}
        {hasFormLayout ? (
          <FormViewer
            layout={formLayout!}
            fields={viewerFields}
            activeAliasId={activeAliasId}
            editing={editing}
            values={editing ? editValues.fieldData : record.fieldData}
            onChange={setFieldValue}
            resolveInputDef={(f) => {
              const field = fields.find((x) => x.id === f.id);
              // Inject current picklist options from the field config at render time
              if (field?.fieldType === "picklist") {
                const opts = [...(field.config?.options || [])].sort((a: any, b: any) => a.label.localeCompare(b.label));
                const overrides: Record<string, any> = { options: opts };
                if (field.config?.multiselect) overrides.type = "badge-multiselect";
                return overrides;
              }
              return {};
            }}
            renderView={(f) => {
              const field = fields.find((x) => x.id === f.id);
              if (!field) return null;
              // Lookup needs custom rendering; richtext needs RichTextViewer in view mode
              if (field.fieldType === "lookup") return renderFieldValue(field, record.fieldData?.[field.id]);
              if (field.fieldType === "rich_text") return <RichTextViewer html={record.fieldData?.[field.id] || ""} />;
              // If no inputDef is configured yet, fall back to manual rendering for all types
              if (!getColInputDef(f.id)) return renderFieldValue(field, record.fieldData?.[field.id]);
              return null; // defer to FormViewer's built-in DynamicInput view rendering
            }}
            renderEditor={(f) => {
              const field = fields.find((x) => x.id === f.id);
              if (!field) return null;
              // Lookup always needs custom editing UI (not expressible via DynamicInput)
              if (field.fieldType === "lookup") return renderFieldEditor(field);
              // If no inputDef is configured yet, fall back to manual rendering
              if (!getColInputDef(f.id)) return renderFieldEditor(field);
              return null; // defer to FormViewer's built-in DynamicInput editing
            }}
          />
        ) : (
          /* Fallback: flat field list filtered by alias */
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {fields
              .filter((field) => {
                if (!field.aliasIds || field.aliasIds.length === 0) return true;
                return activeAliasId ? field.aliasIds.includes(activeAliasId) : false;
              })
              .map((field) => {
                const value = record.fieldData?.[field.id];
                const hasValue = value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0);
                if (!hasValue && !editing) return null;
                return (
                  <div key={field.id}>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{field.name}{field.required && editing && <span style={{ color: "#f87171", marginLeft: 3 }}>*</span>}</div>
                    <div style={{ fontSize: 13, color: "#e2e8f0" }}>
                      {editing ? renderFieldEditor(field) : renderFieldValue(field, value)}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Related sections */}
        {relatedSections.length > 0 && (
          <>
            <hr style={{ border: "none", borderTop: "1px solid #1e293b", margin: "20px 0" }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 16 }}>Related</div>
            {relatedSections.map((sec) => {
              const records = relatedRecords[sec.id] || [];
              return (
                <div key={sec.id} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>{sec.name}</div>
                  {records.length === 0 ? (
                    <div style={{ color: "#64748b", fontSize: 13 }}>No related entries</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {records.sort((a: any, b: any) => a.name.localeCompare(b.name)).map((r: any) => {
                        const relType = entryTypes.find((t) => t.id === r.entryTypeId);
                        return (
                          <div key={r.id + r.lookupId}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6, cursor: "pointer", background: "transparent", transition: "background 0.12s" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#0f1e36")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            onClick={() => onNavigateRecord(r.entryTypeId, r.id)}
                          >
                            <div style={{ width: 24, height: 24, borderRadius: 4, overflow: "hidden", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {r.hasIcon
                                ? <img src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${r.entryTypeId}/records/${r.id}/icon`} style={{ width: 24, height: 24, objectFit: "cover" }} alt="" />
                                : <span style={{ color: "#64748b" }}><Icon name={(relType?.icon as any) || "file"} size={12} /></span>
                              }
                            </div>
                            <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0" }}>{r.name}</span>
                            {r.blurb && <span style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{r.blurb}</span>}
                            {relType && (
                              <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: relType.bgColor || "#334155", color: relType.fgColor || "#f1f5f9", flexShrink: 0 }}>{relType.singularName}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Attachments */}
        <hr style={{ border: "none", borderTop: "1px solid #1e293b", margin: "20px 0" }} />
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>Attachments</div>
            {canEdit && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>CTRL+V to paste</span>
                <ButtonIcon name="upload" label="Upload file" onClick={() => {
                  const inp = document.createElement("input");
                  inp.type = "file"; inp.multiple = true;
                  inp.onchange = () => Array.from(inp.files || []).forEach(handleUpload);
                  inp.click();
                }} />
              </div>
            )}
          </div>
          {uploading && <div style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>Uploading…</div>}
          {attachments.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 13 }}>No attachments</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
              {attachments.map((att) => (
                <div key={att.id} style={{ background: "#1e293b", borderRadius: 8, overflow: "hidden", position: "relative" }}>
                  <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", cursor: isPreviewSupported(att.filename) ? "pointer" : "default", background: "#0f172a" }}
                    onClick={() => isPreviewSupported(att.filename) && setPreviewFile(att)}>
                    {att.hasThumb
                      ? <img src={`${baseUrl}/attachments/${att.id}/thumb`} style={{ width: "100%", height: 80, objectFit: "cover" }} alt="" loading="lazy" />
                      : <span style={{ color: "#64748b" }}><Icon name="file" size={28} /></span>
                    }
                  </div>
                  <div style={{ padding: "6px 8px" }}>
                    <div style={{ fontSize: 11, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.filename}</div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{(att.size / 1024).toFixed(1)} KB</div>
                  </div>
                  {canEdit && (
                    <div style={{ position: "absolute", top: 4, right: 4 }}>
                      <ButtonIcon name="trash" label="Delete" subvariant="danger" size="sm" onClick={() => handleDeleteAttachment(att)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* File preview */}
      {previewFile && (
        <FilePreview
          fileName={previewFile.filename}
          filePath={previewFile.id}
          getPreviewUrl={async (id) => { const res = await fetch(`${baseUrl}/attachments/${id}`); return URL.createObjectURL(await res.blob()); }}
          fetchTextContent={async (id) => { const res = await fetch(`${baseUrl}/attachments/${id}`); return res.text(); }}
          onClose={() => setPreviewFile(null)}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex < previewableAttachments.length - 1}
          onPrev={() => setPreviewFile(previewableAttachments[previewIndex - 1])}
          onNext={() => setPreviewFile(previewableAttachments[previewIndex + 1])}
          actions={[{ label: "Download", icon: <Icon name="download" size={16} />, onClick: () => { const a = document.createElement("a"); a.href = `${baseUrl}/attachments/${previewFile.id}`; a.download = previewFile.filename; a.click(); } }]}
        />
      )}


      {showDelete && (
        <ConfirmModal
          title={`Delete ${entryType?.singularName || "Entry"}`}
          message={`Delete "${record.name}"? This cannot be undone.`}
          confirmText="Delete" danger
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

// ─── LookupFieldEditor ────────────────────────────────────────────────────────

function LookupFieldEditor({ field, lorebookId, recordId, entryTypes, baseUrl, lookups, onAdded, onRemoved }: {
  field: EntryField;
  lorebookId: string;
  recordId: string;
  entryTypes: EntryType[];
  baseUrl: string;
  lookups: RecordLookup[];
  onAdded: (lk: RecordLookup) => void;
  onRemoved: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const targetIds: string[] = field.config?.targetEntryTypeIds || [];
  const fieldLookups = lookups.filter((lk) => lk.customFieldId === field.id);
  const existingIds = new Set(fieldLookups.map((lk) => lk.record1 === recordId ? lk.record2 : lk.record1));
  const canAddMore = field.config?.multiselect !== false || fieldLookups.length === 0;

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      const all: any[] = [];
      for (const typeId of targetIds) {
        try {
          const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/records?search=${encodeURIComponent(search)}`, { signal: controller.signal });
          if (res.ok) {
            const data = await res.json();
            const et = entryTypes.find((t) => t.id === typeId);
            (data.records || []).forEach((r: any) => {
              if (!existingIds.has(r.id) && r.id !== recordId)
                all.push({ ...r, entryTypeId: typeId, entryType: et });
            });
          }
        } catch {}
      }
      setResults(all.sort((a: any, b: any) => a.name.localeCompare(b.name)));
    }, 200);
    return () => { clearTimeout(t); controller.abort(); };
  }, [search, lorebookId, fieldLookups.length]);

  const handleAdd = async (target: any) => {
    const res = await fetch(`${baseUrl}/lookups`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customFieldId: field.id, record2: target.id, aToB: field.config?.aToB || "", bToA: field.config?.bToA || "" }),
    });
    if (res.ok) {
      const lk = await res.json();
      onAdded({ ...lk, record1Name: "", record2Name: target.name, record1TypeId: "", record2TypeId: target.entryTypeId, record1HasIcon: false, record2HasIcon: !!target.hasIcon });
      setSearch(""); setResults([]); setOpen(false);
    }
  };

  const handleRemove = (lkId: string) => {
    fetch(`${baseUrl}/lookups/${lkId}`, { method: "DELETE" }).then(() => onRemoved(lkId));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {fieldLookups.map((lk) => {
        const isR1 = lk.record1 === recordId;
        const otherId = isR1 ? lk.record2 : lk.record1;
        const otherName = isR1 ? lk.record2Name : lk.record1Name;
        const otherTypeId = isR1 ? lk.record2TypeId : lk.record1TypeId;
        const otherHasIcon = isR1 ? lk.record2HasIcon : lk.record1HasIcon;
        const label = isR1 ? lk.aToB : lk.bToA;
        const et = entryTypes.find((t) => t.id === otherTypeId);
        return (
          <div key={lk.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", borderRadius: 6, padding: "4px 8px" }}>
            {otherHasIcon && otherTypeId ? (
              <img src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${otherTypeId}/records/${otherId}/icon`} style={{ width: 20, height: 20, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} alt="" />
            ) : et ? (
              <span style={{ width: 20, height: 20, borderRadius: 3, background: et.bgColor || "#334155", color: et.fgColor || "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 600 }}>{et.singularName[0]}</span>
            ) : null}
            {label && <span style={{ fontSize: 11, color: "#64748b" }}>{label}:</span>}
            <span style={{ fontSize: 13, color: "#e2e8f0", flex: 1 }}>{otherName}</span>
            <ButtonIcon name="close" label="Remove" size="sm" onClick={() => handleRemove(lk.id)} />
          </div>
        );
      })}
      {canAddMore && (
        <div style={{ position: "relative" }}>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search entries to link…"
            style={{ width: "100%", boxSizing: "border-box", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "5px 8px", color: "#f1f5f9", fontSize: 13, outline: "none" }}
          />
          {open && results.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: "#1e293b", border: "1px solid #334155", borderRadius: 6, maxHeight: 200, overflowY: "auto", marginTop: 2 }}>
              {results.map((r) => {
                const et = r.entryType as EntryType | undefined;
                return (
                  <div key={r.id} onMouseDown={() => handleAdd(r)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#0f172a")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {r.hasIcon ? (
                      <img src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${r.entryTypeId}/records/${r.id}/icon`} style={{ width: 20, height: 20, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} alt="" />
                    ) : et ? (
                      <span style={{ width: 20, height: 20, borderRadius: 3, background: et.bgColor || "#334155", color: et.fgColor || "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 600 }}>{et.singularName[0]}</span>
                    ) : null}
                    <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0" }}>{r.name}</span>
                    {et && <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: et.bgColor || "#334155", color: et.fgColor || "#fff" }}>{et.singularName}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
