"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ButtonIcon, Icon, Button, Modal, ConfirmModal, Spinner,
  RichTextEditor, RichTextViewer, FilePreview, isPreviewSupported,
  FormViewer,
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
  const [lookupModalField, setLookupModalField] = useState<EntryField | null>(null);
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
    if (field.fieldType === "toggle") return <span style={{ color: value ? "#4ade80" : "#ef4444" }}>{value ? "Yes" : "No"}</span>;
    if (field.fieldType === "lookup") {
      const fieldLookups = lookups.filter((lk) => lk.customFieldId === field.id);
      if (fieldLookups.length === 0) return <span style={{ color: "#64748b" }}>—</span>;
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {fieldLookups.map((lk) => {
            const otherId = lk.record1 === recordId ? lk.record2 : lk.record1;
            const otherName = lk.record1 === recordId ? lk.record2Name : lk.record1Name;
            const label = lk.record1 === recordId ? lk.aToB : lk.bToA;
            return (
              <div key={lk.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", borderRadius: 6, padding: "3px 8px", fontSize: 12, cursor: "pointer" }}
                onClick={() => {
                  const targetType = entryTypes.find((t) => {
                    // We look up the type from the other record — approximation via lookups
                    return true;
                  });
                }}>
                <span style={{ color: "#94a3b8" }}>{label && `${label}: `}</span>
                <span style={{ color: "#e2e8f0" }}>{otherName}</span>
                {canEdit && editing && (
                  <ButtonIcon name="close" label="Remove" size="sm" onClick={() => {
                    fetch(`${baseUrl}/lookups/${lk.id}`, { method: "DELETE" }).then(() => setLookups((l) => l.filter((x) => x.id !== lk.id)));
                  }} />
                )}
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
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {vals.map((v: string) => {
              const opt = field.config?.options?.find((o: any) => o.value === v);
              return <span key={v} style={{ background: "#334155", borderRadius: 4, padding: "2px 6px", fontSize: 12, color: "#e2e8f0" }}>{opt?.label || v}</span>;
            })}
          </div>
        );
      }
      const opt = field.config?.options?.find((o: any) => o.value === value);
      return <span>{opt?.label || value || <span style={{ color: "#64748b" }}>—</span>}</span>;
    }
    if (!value && value !== 0 && value !== false) return <span style={{ color: "#64748b" }}>—</span>;
    return <span>{String(value)}</span>;
  };

  const renderFieldEditor = (field: EntryField) => {
    const value = editValues.fieldData?.[field.id];
    const cfg = field.config || {};

    if (field.fieldType === "text") {
      return (
        <textarea value={value || ""} onChange={(e) => setFieldValue(field.id, e.target.value)}
          style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#f1f5f9", fontSize: 13, resize: "vertical", minHeight: 60, outline: "none", boxSizing: "border-box" }} />
      );
    }
    if (field.fieldType === "rich_text") {
      return <RichTextEditor value={value || ""} onChange={(v) => setFieldValue(field.id, v)} minHeight={100} />;
    }
    if (field.fieldType === "toggle") {
      return (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={!!value} onChange={(e) => setFieldValue(field.id, e.target.checked)} />
          <span style={{ fontSize: 13, color: "#94a3b8" }}>{value ? "Yes" : "No"}</span>
        </label>
      );
    }
    if (field.fieldType === "number") {
      return (
        <input type="number" value={value ?? ""} min={cfg.min} max={cfg.max}
          step={cfg.decimals ? Math.pow(10, -cfg.decimals) : 1}
          onChange={(e) => setFieldValue(field.id, e.target.value === "" ? null : Number(e.target.value))}
          style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#f1f5f9", fontSize: 13, outline: "none" }} />
      );
    }
    if (field.fieldType === "picklist") {
      const opts: Array<{ value: string; label: string }> = cfg.options || [];
      if (cfg.multiselect) {
        const selected: string[] = Array.isArray(value) ? value : (value ? [value] : []);
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {opts.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <span key={opt.value} onClick={() => setFieldValue(field.id, isSelected ? selected.filter((v) => v !== opt.value) : [...selected, opt.value])}
                  style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer", background: isSelected ? "#3b82f6" : "#1e293b", color: isSelected ? "#fff" : "#94a3b8", border: `1px solid ${isSelected ? "#3b82f6" : "#334155"}` }}>
                  {opt.label}
                </span>
              );
            })}
            {cfg.allowCustom && (
              <input placeholder="Custom value…" onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) { setFieldValue(field.id, [...selected, e.currentTarget.value.trim()]); e.currentTarget.value = ""; } }}
                style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 4, padding: "3px 8px", color: "#f1f5f9", fontSize: 12, outline: "none" }} />
            )}
          </div>
        );
      }
      return (
        <select value={value || ""} onChange={(e) => setFieldValue(field.id, e.target.value)}
          style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#f1f5f9", fontSize: 13, outline: "none" }}>
          <option value="">— Select —</option>
          {opts.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      );
    }
    if (field.fieldType === "lookup") {
      const fieldLookups = lookups.filter((lk) => lk.customFieldId === field.id);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {fieldLookups.map((lk) => {
            const otherName = lk.record1 === recordId ? lk.record2Name : lk.record1Name;
            const label = lk.record1 === recordId ? lk.aToB : lk.bToA;
            return (
              <div key={lk.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{label && `${label}: `}</span>
                <span style={{ fontSize: 13, color: "#e2e8f0" }}>{otherName}</span>
                <ButtonIcon name="close" label="Remove" size="sm" onClick={() => {
                  fetch(`${baseUrl}/lookups/${lk.id}`, { method: "DELETE" }).then(() => setLookups((l) => l.filter((x) => x.id !== lk.id)));
                }} />
              </div>
            );
          })}
          <Button variant="ghost" onClick={() => { setLookupModalField(field); }}>+ Add lookup</Button>
        </div>
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
    id: f.id, name: f.name, fieldType: f.fieldType, aliasIds: f.aliasIds,
  }));

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
              ? <img src={`${baseUrl}/icon`} style={{ width: 28, height: 28, objectFit: "cover" }} alt="" />
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
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
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
            renderView={(f) => {
              const field = fields.find((x) => x.id === f.id);
              if (!field) return null;
              return renderFieldValue(field, record.fieldData?.[field.id]);
            }}
            renderEditor={(f) => {
              const field = fields.find((x) => x.id === f.id);
              if (!field) return null;
              return renderFieldEditor(field);
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
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{field.name}</div>
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

      {/* Lookup modal */}
      {lookupModalField && (
        <LookupModal
          field={lookupModalField}
          lorebookId={lorebookId}
          recordId={recordId}
          entryTypes={entryTypes}
          baseUrl={baseUrl}
          onClose={() => setLookupModalField(null)}
          onAdded={(lk) => { setLookups((l) => [...l, lk]); setLookupModalField(null); }}
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

// ─── LookupModal ──────────────────────────────────────────────────────────────

function LookupModal({ field, lorebookId, recordId, entryTypes, baseUrl, onClose, onAdded }: {
  field: EntryField;
  lorebookId: string;
  recordId: string;
  entryTypes: EntryType[];
  baseUrl: string;
  onClose: () => void;
  onAdded: (lk: any) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [aToB, setAToB] = useState(field.config?.aToB || "");
  const [bToA, setBToA] = useState(field.config?.bToA || "");
  const targetIds: string[] = field.config?.targetEntryTypeIds || [];

  useEffect(() => {
    const fetch_ = async () => {
      const all: any[] = [];
      for (const typeId of targetIds) {
        const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/records?search=${encodeURIComponent(search)}`);
        if (res.ok) {
          const data = await res.json();
          const et = entryTypes.find((t) => t.id === typeId);
          data.records.forEach((r: any) => all.push({ ...r, entryTypeId: typeId, entryTypeName: et?.singularName }));
        }
      }
      setResults(all.sort((a, b) => a.name.localeCompare(b.name)));
    };
    const t = setTimeout(fetch_, 200);
    return () => clearTimeout(t);
  }, [search, lorebookId, targetIds.join(",")]);

  const handleAdd = async (targetRecord: any) => {
    const res = await fetch(`${baseUrl}/lookups`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customFieldId: field.id, record2: targetRecord.id, aToB, bToA }),
    });
    if (res.ok) {
      const lk = await res.json();
      onAdded({ ...lk, record1Name: "", record2Name: targetRecord.name });
    }
  };

  return (
    <Modal
      header={<div style={{ padding: "12px 16px", fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>Add Lookup — {field.name}</div>}
      closeable onClose={onClose} maxWidth={480}
    >
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {(field.config?.aToB !== undefined || field.config?.bToA !== undefined) && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Relationship (A→B)</div>
              <input value={aToB} onChange={(e) => setAToB(e.target.value)} placeholder="e.g. father"
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "5px 8px", color: "#f1f5f9", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Relationship (B→A)</div>
              <input value={bToA} onChange={(e) => setBToA(e.target.value)} placeholder="e.g. son"
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "5px 8px", color: "#f1f5f9", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
        )}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entries…" autoFocus
          style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "7px 10px", color: "#f1f5f9", fontSize: 13, outline: "none" }} />
        <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {results.map((r) => {
            const et = entryTypes.find((t) => t.id === r.entryTypeId);
            return (
              <div key={r.id}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: "transparent" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1e293b")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => handleAdd(r)}
              >
                <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0" }}>{r.name}</span>
                {et && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: et.bgColor || "#334155", color: et.fgColor || "#f1f5f9" }}>{et.singularName}</span>}
              </div>
            );
          })}
          {results.length === 0 && <div style={{ color: "#64748b", fontSize: 13, padding: "8px 0" }}>No results</div>}
        </div>
      </div>
    </Modal>
  );
}
