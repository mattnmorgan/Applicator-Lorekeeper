"use client";

import { useState, useEffect, useRef } from "react";
import { Button, ButtonIcon, Icon, Modal, ConfirmModal, DynamicInput, Spinner, ImageUpload } from "@applicator/sdk/components";

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  hasIcon: boolean;
  blurb: string;
  parentTypeId: string;
  bgColor: string;
  fgColor: string;
  sortOrder: number;
}

interface EntrySection {
  id: string;
  name: string;
  sectionType: "fields" | "related_list";
  sortOrder: number;
}

interface EntryField {
  id: string;
  sectionId: string;
  name: string;
  fieldType: string;
  config: any;
  sortOrder: number;
}

interface RelatedItem {
  id: string;
  sectionId: string;
  entryTypeId: string;
  fieldId: string;
  entryTypeName: string;
  fieldName: string;
}

const FIELD_TYPES = ["text", "rich_text", "picklist", "toggle", "number", "lookup"];
const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text", rich_text: "Rich Text", picklist: "Picklist", toggle: "Toggle", number: "Number", lookup: "Lookup",
};

interface Props {
  lorebookId: string;
  canEdit: boolean;
  addToast: (message: string, type?: "success" | "error") => void;
}

export default function MetadataTab({ lorebookId, canEdit, addToast }: Props) {
  const [entryTypes, setEntryTypes] = useState<EntryType[]>([]);
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);
  const [sections, setSections] = useState<EntrySection[]>([]);
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, EntryField[]>>({});
  const [relatedBySec, setRelatedBySec] = useState<Record<string, RelatedItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);

  // Create type modal
  const [showCreateType, setShowCreateType] = useState(false);
  const [typeValues, setTypeValues] = useState<Record<string, any>>({ singularName: "", pluralName: "", icon: "file", blurb: "", bgColor: "#334155", fgColor: "#f1f5f9", parentTypeId: "" });

  // Create section
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [newSecName, setNewSecName] = useState("");
  const [newSecType, setNewSecType] = useState<"fields" | "related_list">("fields");

  // Create field
  const [createFieldSectionId, setCreateFieldSectionId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({ name: "", fieldType: "text" });

  // Related list pairing
  const [relatedSecId, setRelatedSecId] = useState<string | null>(null);
  const [relatedTypeId, setRelatedTypeId] = useState("");
  const [relatedFieldId, setRelatedFieldId] = useState("");
  const [relatedTypeFields, setRelatedTypeFields] = useState<EntryField[]>([]);

  // Delete type
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<EntryType | null>(null);

  // DnD
  const dragSecId = useRef<string | null>(null);
  const dragFieldId = useRef<{ sectionId: string; fieldId: string } | null>(null);

  const fetchTypes = async () => {
    setLoading(true);
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types`);
    if (res.ok) {
      const d = await res.json();
      setEntryTypes(d.entryTypes || []);
      if (!activeTypeId && d.entryTypes?.length > 0) setActiveTypeId(d.entryTypes[0].id);
    }
    setLoading(false);
  };

  const fetchSections = async (typeId: string) => {
    setLoadingSections(true);
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/sections`);
    if (!res.ok) { setLoadingSections(false); return; }
    const { sections: secs } = await res.json();
    setSections(secs || []);

    const fMap: Record<string, EntryField[]> = {};
    const rMap: Record<string, RelatedItem[]> = {};
    await Promise.all((secs || []).map(async (sec: EntrySection) => {
      if (sec.sectionType === "fields") {
        const r = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/sections/${sec.id}/fields`);
        if (r.ok) fMap[sec.id] = (await r.json()).fields || [];
      } else {
        const r = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/sections/${sec.id}/related`);
        if (r.ok) rMap[sec.id] = (await r.json()).items || [];
      }
    }));
    setFieldsBySection(fMap);
    setRelatedBySec(rMap);
    setLoadingSections(false);
  };

  useEffect(() => { fetchTypes(); }, [lorebookId]);
  useEffect(() => { if (activeTypeId) fetchSections(activeTypeId); }, [activeTypeId]);

  const handleCreateType = async () => {
    if (!typeValues.singularName?.trim() || !typeValues.pluralName?.trim()) {
      addToast("Singular and plural names are required", "error"); return;
    }
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(typeValues),
    });
    if (res.ok) {
      const et = await res.json();
      addToast("Entry type created");
      setShowCreateType(false);
      setTypeValues({ singularName: "", pluralName: "", icon: "file", blurb: "", bgColor: "#334155", fgColor: "#f1f5f9", parentTypeId: "" });
      setEntryTypes((prev) => [...prev, et]);
      setActiveTypeId(et.id);
    } else addToast("Failed to create entry type", "error");
  };

  const handleUpdateType = async (field: keyof EntryType, value: any) => {
    if (!activeTypeId) return;
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEntryTypes((prev) => prev.map((t) => t.id === activeTypeId ? { ...t, ...updated } : t));
    } else addToast("Failed to save", "error");
  };

  const handleDeleteType = async () => {
    if (!deleteTypeTarget) return;
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${deleteTypeTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      addToast("Entry type deleted");
      setEntryTypes((prev) => prev.filter((t) => t.id !== deleteTypeTarget.id));
      if (activeTypeId === deleteTypeTarget.id) {
        const remaining = entryTypes.filter((t) => t.id !== deleteTypeTarget.id);
        setActiveTypeId(remaining.length > 0 ? remaining[0].id : null);
      }
      setDeleteTypeTarget(null);
    } else addToast("Failed to delete", "error");
  };

  const handleCreateSection = async () => {
    if (!activeTypeId || !newSecName.trim()) return;
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSecName.trim(), sectionType: newSecType }),
    });
    if (res.ok) {
      const sec = await res.json();
      setSections((prev) => [...prev, sec]);
      if (newSecType === "fields") setFieldsBySection((p) => ({ ...p, [sec.id]: [] }));
      else setRelatedBySec((p) => ({ ...p, [sec.id]: [] }));
      setNewSecName("");
      setShowCreateSection(false);
      addToast("Section created");
    } else addToast("Failed to create section", "error");
  };

  const handleRenameSection = async (sec: EntrySection, name: string) => {
    if (!activeTypeId) return;
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sec.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) setSections((prev) => prev.map((s) => s.id === sec.id ? { ...s, name } : s));
  };

  const handleDeleteSection = async (sec: EntrySection) => {
    if (!activeTypeId) return;
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sec.id}`, { method: "DELETE" });
    if (res.ok) {
      setSections((prev) => prev.filter((s) => s.id !== sec.id));
      setFieldsBySection((p) => { const n = { ...p }; delete n[sec.id]; return n; });
      setRelatedBySec((p) => { const n = { ...p }; delete n[sec.id]; return n; });
      addToast("Section deleted");
    } else addToast("Failed to delete section", "error");
  };

  const handleReorderSections = async (newOrder: EntrySection[]) => {
    if (!activeTypeId) return;
    setSections(newOrder);
    await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: newOrder.map((s) => s.id) }),
    });
  };

  const handleCreateField = async (sectionId: string) => {
    if (!activeTypeId || !fieldValues.name?.trim()) { addToast("Field name is required", "error"); return; }

    let config: any = {};
    if (fieldValues.fieldType === "picklist") {
      config = { options: [], multiselect: !!fieldValues.multiselect, allowCustom: !!fieldValues.allowCustom };
    } else if (fieldValues.fieldType === "number") {
      config = { decimals: fieldValues.decimals ?? 0, min: fieldValues.min, max: fieldValues.max };
    } else if (fieldValues.fieldType === "lookup") {
      config = {
        multiselect: !!fieldValues.lookupMultiselect,
        targetEntryTypeIds: fieldValues.targetTypeIds || [],
        aToB: fieldValues.aToB || "",
        bToA: fieldValues.bToA || "",
      };
    }

    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sectionId}/fields`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fieldValues.name.trim(), fieldType: fieldValues.fieldType, config }),
      }
    );
    if (res.ok) {
      const field = await res.json();
      setFieldsBySection((p) => ({ ...p, [sectionId]: [...(p[sectionId] || []), field] }));
      setFieldValues({ name: "", fieldType: "text" });
      setCreateFieldSectionId(null);
      addToast("Field created");
    } else addToast("Failed to create field", "error");
  };

  const handleDeleteField = async (sectionId: string, fieldId: string) => {
    if (!activeTypeId) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sectionId}/fields/${fieldId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setFieldsBySection((p) => ({ ...p, [sectionId]: (p[sectionId] || []).filter((f) => f.id !== fieldId) }));
      addToast("Field deleted");
    } else addToast("Failed to delete field", "error");
  };

  const handleReorderFields = async (sectionId: string, newOrder: EntryField[]) => {
    if (!activeTypeId) return;
    setFieldsBySection((p) => ({ ...p, [sectionId]: newOrder }));
    await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sectionId}/fields/reorder`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: newOrder.map((f) => f.id) }),
      }
    );
  };

  const handleAddRelated = async (sectionId: string) => {
    if (!activeTypeId || !relatedTypeId || !relatedFieldId) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sectionId}/related`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryTypeId: relatedTypeId, fieldId: relatedFieldId }),
      }
    );
    if (res.ok) {
      const item = await res.json();
      const et = entryTypes.find((t) => t.id === relatedTypeId);
      const field = relatedTypeFields.find((f) => f.id === relatedFieldId);
      setRelatedBySec((p) => ({
        ...p,
        [sectionId]: [...(p[sectionId] || []), { ...item, entryTypeName: et?.pluralName || "", fieldName: field?.name || "" }],
      }));
      setRelatedSecId(null);
      setRelatedTypeId("");
      setRelatedFieldId("");
      setRelatedTypeFields([]);
      addToast("Related list pairing added");
    } else addToast("Failed to add pairing", "error");
  };

  const handleRemoveRelated = async (sectionId: string, itemId: string) => {
    if (!activeTypeId) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sectionId}/related/${itemId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setRelatedBySec((p) => ({ ...p, [sectionId]: (p[sectionId] || []).filter((i) => i.id !== itemId) }));
    }
  };

  const activeType = entryTypes.find((t) => t.id === activeTypeId);

  const getDepth = (typeId: string, visited = new Set<string>()): number => {
    if (visited.has(typeId)) return 0;
    visited.add(typeId);
    const t = entryTypes.find((x) => x.id === typeId);
    if (!t?.parentTypeId) return 0;
    return 1 + getDepth(t.parentTypeId, visited);
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spinner /></div>;

  return (
    <div style={{ display: "flex", gap: 0, height: "100%", overflow: "hidden" }}>
      {/* Left: entry types list */}
      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto", borderRight: "1px solid #1e293b", paddingRight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 12px 8px 12px", flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Entry Types</span>
          {canEdit && <ButtonIcon name="plus" label="New entry type" size="sm" onClick={() => setShowCreateType(true)} />}
        </div>
        {entryTypes.length === 0 && <div style={{ color: "#64748b", fontSize: 12, padding: "0 12px" }}>No entry types yet</div>}
        {entryTypes.map((et) => {
          const depth = getDepth(et.id);
          const isActive = activeTypeId === et.id;
          return (
            <div
              key={et.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: `5px 10px 5px ${10 + depth * 16}px`,
                cursor: "pointer",
                background: isActive ? "#1e3a5f" : "transparent",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#1e293b"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              onClick={() => setActiveTypeId(et.id)}
            >
              {et.hasIcon ? (
                <img src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${et.id}/icon`} style={{ width: 14, height: 14, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} alt="" />
              ) : (
                <span style={{ color: "#64748b", flexShrink: 0 }}><Icon name={(et.icon as any) || "file"} size={12} /></span>
              )}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: et.bgColor || "#334155",
                  color: et.fgColor || "#f1f5f9",
                }}
              >
                {et.pluralName}
              </span>
              {canEdit && isActive && (
                <ButtonIcon name="trash" label="Delete entry type" subvariant="danger" size="sm" onClick={() => setDeleteTypeTarget(et)} />
              )}
            </div>
          );
        })}
      </div>

      {/* Right: active type detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px 24px" }}>
        {!activeType ? (
          <div style={{ color: "#64748b", fontSize: 13 }}>Select an entry type to edit</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Type header */}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                {activeType.hasIcon ? (
                  <img src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeType.id}/icon`} style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }} alt="" />
                ) : (
                  <span style={{ color: "#94a3b8" }}><Icon name={(activeType.icon as any) || "file"} size={16} /></span>
                )}
                {activeType.pluralName}
              </div>

              {canEdit && (
                <>
                  <hr style={{ border: "none", borderTop: "1px solid #1e293b", margin: "0 0 12px 0" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Icon + Parent Type */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <ImageUpload
                          label="Icon"
                          value={activeType.hasIcon ? `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeType.id}/icon` : null}
                          onChange={async (dataUrl) => {
                            const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeType.id}/icon`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ iconData: dataUrl }),
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setEntryTypes((prev) => prev.map((t) => t.id === activeType.id ? { ...t, hasIcon: data.hasIcon } : t));
                            }
                          }}
                          previewSize={48}
                          previewRadius={8}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Parent Type</div>
                        <select
                          value={activeType.parentTypeId || ""}
                          onChange={(e) => handleUpdateType("parentTypeId", e.target.value)}
                          style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "5px 8px", color: "#f1f5f9", fontSize: 12, outline: "none", width: "100%" }}
                        >
                          <option value="">None</option>
                          {entryTypes.filter((t) => t.id !== activeTypeId).map((t) => (
                            <option key={t.id} value={t.id}>{t.pluralName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {/* Singular + Plural Name */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <InlineEdit label="Singular Name" value={activeType.singularName} onSave={(v) => handleUpdateType("singularName", v)} />
                      <InlineEdit label="Plural Name" value={activeType.pluralName} onSave={(v) => handleUpdateType("pluralName", v)} />
                    </div>
                    {/* Summary */}
                    <InlineEdit label="Summary" value={activeType.blurb} onSave={(v) => handleUpdateType("blurb", v)} multiline />
                    {/* Badge — 3-column inline section */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Badge Background</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="color" value={activeType.bgColor || "#334155"} onChange={(e) => handleUpdateType("bgColor", e.target.value)}
                            style={{ width: 36, height: 28, borderRadius: 4, border: "1px solid #334155", background: "transparent", cursor: "pointer" }} />
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>{activeType.bgColor}</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Badge Foreground</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="color" value={activeType.fgColor || "#f1f5f9"} onChange={(e) => handleUpdateType("fgColor", e.target.value)}
                            style={{ width: 36, height: 28, borderRadius: 4, border: "1px solid #334155", background: "transparent", cursor: "pointer" }} />
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>{activeType.fgColor}</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Preview</div>
                        <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 4, background: activeType.bgColor || "#334155", color: activeType.fgColor || "#f1f5f9" }}>
                          {activeType.singularName}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #1e293b" }} />

            {/* Sections */}
            {loadingSections ? <Spinner /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>Sections</span>
                  {canEdit && (
                    <ButtonIcon name="plus" label="Add section" onClick={() => setShowCreateSection(true)} />
                  )}
                </div>

                {sections.length === 0 && <div style={{ color: "#64748b", fontSize: 12 }}>No sections yet</div>}

                {sections.map((sec, idx) => (
                  <SectionEditor
                    key={sec.id}
                    sec={sec}
                    fields={fieldsBySection[sec.id] || []}
                    relatedItems={relatedBySec[sec.id] || []}
                    entryTypes={entryTypes}
                    activeTypeId={activeTypeId!}
                    canEdit={canEdit}
                    onRename={(name) => handleRenameSection(sec, name)}
                    onDelete={() => handleDeleteSection(sec)}
                    onMoveUp={() => {
                      if (idx === 0) return;
                      const newOrder = [...sections];
                      [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
                      handleReorderSections(newOrder);
                    }}
                    onMoveDown={() => {
                      if (idx === sections.length - 1) return;
                      const newOrder = [...sections];
                      [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
                      handleReorderSections(newOrder);
                    }}
                    onAddField={() => { setCreateFieldSectionId(sec.id); setFieldValues({ name: "", fieldType: "text" }); }}
                    onDeleteField={(fieldId) => handleDeleteField(sec.id, fieldId)}
                    onMoveFieldUp={(fieldId) => {
                      const fields = fieldsBySection[sec.id] || [];
                      const i = fields.findIndex((f) => f.id === fieldId);
                      if (i <= 0) return;
                      const newOrder = [...fields];
                      [newOrder[i - 1], newOrder[i]] = [newOrder[i], newOrder[i - 1]];
                      handleReorderFields(sec.id, newOrder);
                    }}
                    onMoveFieldDown={(fieldId) => {
                      const fields = fieldsBySection[sec.id] || [];
                      const i = fields.findIndex((f) => f.id === fieldId);
                      if (i === fields.length - 1) return;
                      const newOrder = [...fields];
                      [newOrder[i], newOrder[i + 1]] = [newOrder[i + 1], newOrder[i]];
                      handleReorderFields(sec.id, newOrder);
                    }}
                    onAddRelated={() => { setRelatedSecId(sec.id); setRelatedTypeId(""); setRelatedFieldId(""); setRelatedTypeFields([]); }}
                    onRemoveRelated={(itemId) => handleRemoveRelated(sec.id, itemId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Type Modal */}
      {showCreateType && (
        <Modal
          header={<span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>New Entry Type</span>}
          closeable
          onClose={() => setShowCreateType(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreateType(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreateType}>Create</Button>
            </>
          }
          maxWidth={480}
        >
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <DynamicInput input={{ id: "singularName", label: "Singular Name", type: "text", required: true, placeholder: "Character" }} value={typeValues.singularName} onChange={(id, v) => setTypeValues((p) => ({ ...p, [id]: v }))} />
              <DynamicInput input={{ id: "pluralName", label: "Plural Name", type: "text", required: true, placeholder: "Characters" }} value={typeValues.pluralName} onChange={(id, v) => setTypeValues((p) => ({ ...p, [id]: v }))} />
            </div>
            <DynamicInput input={{ id: "blurb", label: "Description", type: "text", placeholder: "What is this entry type?" }} value={typeValues.blurb} onChange={(id, v) => setTypeValues((p) => ({ ...p, [id]: v }))} />
            <DynamicInput input={{ id: "icon", label: "Icon", type: "icon" }} value={typeValues.icon} onChange={(id, v) => setTypeValues((p) => ({ ...p, [id]: v }))} />
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Parent Entry Type (optional)</div>
              <select value={typeValues.parentTypeId} onChange={(e) => setTypeValues((p) => ({ ...p, parentTypeId: e.target.value }))}
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#f1f5f9", fontSize: 13, outline: "none" }}>
                <option value="">None</option>
                {entryTypes.map((t) => <option key={t.id} value={t.id}>{t.pluralName}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Badge Background</div>
                <input type="color" value={typeValues.bgColor} onChange={(e) => setTypeValues((p) => ({ ...p, bgColor: e.target.value }))}
                  style={{ width: "100%", height: 32, borderRadius: 6, border: "1px solid #334155", background: "transparent", cursor: "pointer" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Badge Foreground</div>
                <input type="color" value={typeValues.fgColor} onChange={(e) => setTypeValues((p) => ({ ...p, fgColor: e.target.value }))}
                  style={{ width: "100%", height: 32, borderRadius: 6, border: "1px solid #334155", background: "transparent", cursor: "pointer" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Preview</div>
                <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, background: typeValues.bgColor, color: typeValues.fgColor }}>{typeValues.singularName || "Example"}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Create section modal */}
      {showCreateSection && (
        <Modal
          header={<span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>New Section</span>}
          closeable
          onClose={() => setShowCreateSection(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreateSection(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreateSection} disabled={!newSecName.trim()}>Create</Button>
            </>
          }
          maxWidth={400}
        >
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <DynamicInput input={{ id: "name", label: "Section Name", type: "text", required: true, placeholder: "Appearance" }}
              value={newSecName} onChange={(_, v) => setNewSecName(v)} />
            <DynamicInput
              input={{ id: "type", label: "Section Type", type: "radio-horizontal-group", options: [
                { value: "fields", label: "Fields", description: "Custom data fields" },
                { value: "related_list", label: "Related List", description: "Show related entries" },
              ]}}
              value={newSecType}
              onChange={(_, v) => setNewSecType(v as "fields" | "related_list")}
            />
          </div>
        </Modal>
      )}

      {/* Create field modal */}
      {createFieldSectionId && (
        <Modal
          header={<span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>New Field</span>}
          closeable
          onClose={() => setCreateFieldSectionId(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreateFieldSectionId(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => handleCreateField(createFieldSectionId)} disabled={!fieldValues.name?.trim()}>Create</Button>
            </>
          }
          maxWidth={480}
        >
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <DynamicInput input={{ id: "name", label: "Field Name", type: "text", required: true, placeholder: "Hair Color" }}
              value={fieldValues.name} onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))} />
            <DynamicInput
              input={{ id: "fieldType", label: "Field Type", type: "select", options: FIELD_TYPES.map((t) => ({ value: t, label: FIELD_TYPE_LABELS[t] })) }}
              value={fieldValues.fieldType}
              onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))}
            />

            {/* Type-specific config */}
            {fieldValues.fieldType === "picklist" && (
              <>
                <DynamicInput input={{ id: "multiselect", label: "Allow multiple selections", type: "toggle" }} value={fieldValues.multiselect} onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))} />
                <DynamicInput input={{ id: "allowCustom", label: "Allow user-defined custom values", type: "toggle" }} value={fieldValues.allowCustom} onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))} />
                <PicklistOptionsEditor values={fieldValues.options || []} onChange={(opts) => setFieldValues((p) => ({ ...p, options: opts }))} />
              </>
            )}
            {fieldValues.fieldType === "number" && (
              <>
                <DynamicInput input={{ id: "decimals", label: "Decimal Places", type: "number", min: "0", max: "10" }} value={fieldValues.decimals ?? 0} onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <DynamicInput input={{ id: "min", label: "Min (optional)", type: "number" }} value={fieldValues.min ?? ""} onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))} />
                  <DynamicInput input={{ id: "max", label: "Max (optional)", type: "number" }} value={fieldValues.max ?? ""} onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))} />
                </div>
              </>
            )}
            {fieldValues.fieldType === "lookup" && (
              <>
                <DynamicInput input={{ id: "lookupMultiselect", label: "Allow multiple values", type: "toggle" }} value={fieldValues.lookupMultiselect} onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))} />
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Target Entry Types (select all that apply)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {entryTypes.filter((t) => t.id !== activeTypeId).map((t) => {
                      const selected = (fieldValues.targetTypeIds || []).includes(t.id);
                      return (
                        <span
                          key={t.id}
                          onClick={() => {
                            const cur: string[] = fieldValues.targetTypeIds || [];
                            setFieldValues((p) => ({ ...p, targetTypeIds: selected ? cur.filter((id) => id !== t.id) : [...cur, t.id] }));
                          }}
                          style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer", background: selected ? "#3b82f6" : "#1e293b", color: selected ? "#fff" : "#94a3b8", border: `1px solid ${selected ? "#3b82f6" : "#334155"}` }}
                        >
                          {t.pluralName}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <DynamicInput input={{ id: "aToB", label: "A→B Label (e.g. father)", type: "text", placeholder: "e.g. father" }} value={fieldValues.aToB ?? ""} onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))} />
                  <DynamicInput input={{ id: "bToA", label: "B→A Label (e.g. son)", type: "text", placeholder: "e.g. son" }} value={fieldValues.bToA ?? ""} onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))} />
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Add related pairing modal */}
      {relatedSecId && (
        <Modal
          header={<span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>Add Related Entry Type</span>}
          closeable
          onClose={() => setRelatedSecId(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRelatedSecId(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => handleAddRelated(relatedSecId)} disabled={!relatedTypeId || !relatedFieldId}>Add</Button>
            </>
          }
          maxWidth={420}
        >
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Entry Type with Lookup</div>
              <select
                value={relatedTypeId}
                onChange={async (e) => {
                  setRelatedTypeId(e.target.value);
                  setRelatedFieldId("");
                  if (e.target.value) {
                    // Fetch all fields for this type and filter for lookups targeting active type
                    const sectionsRes = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${e.target.value}/sections`);
                    const lookupFields: EntryField[] = [];
                    if (sectionsRes.ok) {
                      const { sections: secs } = await sectionsRes.json();
                      for (const sec of secs) {
                        if (sec.sectionType !== "fields") continue;
                        const fr = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${e.target.value}/sections/${sec.id}/fields`);
                        if (fr.ok) {
                          const { fields } = await fr.json();
                          const lf = fields.filter((f: any) =>
                            f.fieldType === "lookup" &&
                            (f.config?.targetEntryTypeIds || []).includes(activeTypeId!)
                          );
                          lookupFields.push(...lf);
                        }
                      }
                    }
                    setRelatedTypeFields(lookupFields);
                  } else {
                    setRelatedTypeFields([]);
                  }
                }}
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "7px 10px", color: "#f1f5f9", fontSize: 13, outline: "none" }}
              >
                <option value="">Select entry type…</option>
                {entryTypes.filter((t) => t.id !== activeTypeId).map((t) => (
                  <option key={t.id} value={t.id}>{t.pluralName}</option>
                ))}
              </select>
            </div>
            {relatedTypeId && (
              <div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Lookup Field (must target "{activeType?.singularName}")</div>
                <select
                  value={relatedFieldId}
                  onChange={(e) => setRelatedFieldId(e.target.value)}
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "7px 10px", color: "#f1f5f9", fontSize: 13, outline: "none" }}
                >
                  <option value="">Select field…</option>
                  {relatedTypeFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                {relatedTypeFields.length === 0 && (
                  <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 6 }}>
                    No lookup fields target "{activeType?.singularName}" in this entry type.
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {deleteTypeTarget && (
        <ConfirmModal
          title="Delete Entry Type"
          message={`Delete "${deleteTypeTarget.pluralName}" and all its sections, fields, and records?`}
          confirmText="Delete"
          danger
          onConfirm={handleDeleteType}
          onCancel={() => setDeleteTypeTarget(null)}
        />
      )}
    </div>
  );
}

function InlineEdit({ label, value, onSave, multiline }: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}</div>
        <div
          style={{ fontSize: 13, color: "#e2e8f0", padding: "5px 8px", background: "#1e293b", borderRadius: 6, cursor: "text", minHeight: 28 }}
          onClick={() => { setDraft(value); setEditing(true); }}
        >
          {value || <span style={{ color: "#64748b" }}>Click to edit</span>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            style={{ flex: 1, background: "#1e293b", border: "1px solid #3b82f6", borderRadius: 6, padding: "5px 8px", color: "#f1f5f9", fontSize: 13, outline: "none", resize: "vertical", minHeight: 60 }}
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { onSave(draft); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
            style={{ flex: 1, background: "#1e293b", border: "1px solid #3b82f6", borderRadius: 6, padding: "5px 8px", color: "#f1f5f9", fontSize: 13, outline: "none" }}
          />
        )}
        <ButtonIcon name="check" label="Save" size="sm" onClick={() => { onSave(draft); setEditing(false); }} />
        <ButtonIcon name="close" label="Cancel" size="sm" onClick={() => setEditing(false)} />
      </div>
    </div>
  );
}

function PicklistOptionsEditor({ values, onChange }: { values: Array<{ value: string; label: string }>; onChange: (opts: Array<{ value: string; label: string }>) => void }) {
  const [newVal, setNewVal] = useState("");
  const [newLabel, setNewLabel] = useState("");
  return (
    <div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Options</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {values.map((opt, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#94a3b8", flex: 1 }}>{opt.label} <span style={{ color: "#64748b" }}>({opt.value})</span></span>
            <ButtonIcon name="trash" label="Remove" size="sm" subvariant="danger" onClick={() => onChange(values.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input placeholder="Value" value={newVal} onChange={(e) => setNewVal(e.target.value)}
          style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 4, padding: "4px 6px", color: "#f1f5f9", fontSize: 12, outline: "none" }} />
        <input placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newVal && newLabel) { onChange([...values, { value: newVal, label: newLabel }]); setNewVal(""); setNewLabel(""); } }}
          style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 4, padding: "4px 6px", color: "#f1f5f9", fontSize: 12, outline: "none" }} />
        <ButtonIcon name="plus" label="Add option" size="sm" onClick={() => { if (newVal && newLabel) { onChange([...values, { value: newVal, label: newLabel }]); setNewVal(""); setNewLabel(""); } }} />
      </div>
    </div>
  );
}

function SectionEditor({
  sec, fields, relatedItems, entryTypes, activeTypeId, canEdit,
  onRename, onDelete, onMoveUp, onMoveDown,
  onAddField, onDeleteField, onMoveFieldUp, onMoveFieldDown,
  onAddRelated, onRemoveRelated,
}: {
  sec: EntrySection;
  fields: EntryField[];
  relatedItems: RelatedItem[];
  entryTypes: EntryType[];
  activeTypeId: string;
  canEdit: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddField: () => void;
  onDeleteField: (id: string) => void;
  onMoveFieldUp: (id: string) => void;
  onMoveFieldDown: (id: string) => void;
  onAddRelated: () => void;
  onRemoveRelated: (id: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(sec.name);
  const [showDeleteSec, setShowDeleteSec] = useState(false);

  return (
    <div style={{ background: "#1e293b", borderRadius: 10, padding: 14 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color: "#64748b" }}><Icon name="drag" size={14} /></span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <ButtonIcon name="chevron-up" label="Move up" size="sm" onClick={onMoveUp} />
          <ButtonIcon name="chevron-down" label="Move down" size="sm" onClick={onMoveDown} />
        </div>
        {editingName ? (
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { onRename(nameDraft); setEditingName(false); } if (e.key === "Escape") setEditingName(false); }}
              style={{ flex: 1, background: "#0f172a", border: "1px solid #3b82f6", borderRadius: 4, padding: "4px 8px", color: "#f1f5f9", fontSize: 13, outline: "none" }}
            />
            <ButtonIcon name="check" label="Save" size="sm" onClick={() => { onRename(nameDraft); setEditingName(false); }} />
            <ButtonIcon name="close" label="Cancel" size="sm" onClick={() => setEditingName(false)} />
          </div>
        ) : (
          <span
            style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#f1f5f9", cursor: canEdit ? "pointer" : "default" }}
            onClick={() => canEdit && setEditingName(true)}
          >
            {sec.name}
            <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>
              ({sec.sectionType === "fields" ? "Fields" : "Related List"})
            </span>
          </span>
        )}
        {canEdit && <ButtonIcon name="trash" label="Delete section" subvariant="danger" size="sm" onClick={() => setShowDeleteSec(true)} />}
      </div>

      {/* Fields section */}
      {sec.sectionType === "fields" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {fields.map((field, fi) => (
            <div key={field.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: "#0f172a", borderRadius: 6 }}>
              {canEdit && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <ButtonIcon name="chevron-up" label="Move up" size="sm" onClick={() => onMoveFieldUp(field.id)} />
                  <ButtonIcon name="chevron-down" label="Move down" size="sm" onClick={() => onMoveFieldDown(field.id)} />
                </div>
              )}
              <span style={{ flex: 1, fontSize: 12, color: "#e2e8f0" }}>{field.name}</span>
              <span style={{ fontSize: 11, color: "#94a3b8", background: "#1e293b", padding: "2px 6px", borderRadius: 4 }}>
                {FIELD_TYPE_LABELS[field.fieldType] || field.fieldType}
              </span>
              {canEdit && (
                <ButtonIcon name="trash" label="Delete field" subvariant="danger" size="sm" onClick={() => onDeleteField(field.id)} />
              )}
            </div>
          ))}
          {canEdit && (
            <button
              onClick={onAddField}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: "transparent", border: "1px dashed #334155", borderRadius: 6, color: "#64748b", fontSize: 12, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#93c5fd"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#334155"; e.currentTarget.style.color = "#64748b"; }}
            >
              <Icon name="plus" size={12} /> Add Field
            </button>
          )}
        </div>
      )}

      {/* Related list section */}
      {sec.sectionType === "related_list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {relatedItems.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "#0f172a", borderRadius: 6 }}>
              <span style={{ flex: 1, fontSize: 12, color: "#e2e8f0" }}>
                {item.entryTypeName} <span style={{ color: "#64748b" }}>via</span> {item.fieldName}
              </span>
              {canEdit && (
                <ButtonIcon name="trash" label="Remove pairing" subvariant="danger" size="sm" onClick={() => onRemoveRelated(item.id)} />
              )}
            </div>
          ))}
          {canEdit && (
            <button
              onClick={onAddRelated}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: "transparent", border: "1px dashed #334155", borderRadius: 6, color: "#64748b", fontSize: 12, cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#93c5fd"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#334155"; e.currentTarget.style.color = "#64748b"; }}
            >
              <Icon name="plus" size={12} /> Add Entry Type Pairing
            </button>
          )}
        </div>
      )}

      {showDeleteSec && (
        <ConfirmModal
          title="Delete Section"
          message={`Delete "${sec.name}" and all its contents?`}
          confirmText="Delete"
          danger
          onConfirm={() => { onDelete(); setShowDeleteSec(false); }}
          onCancel={() => setShowDeleteSec(false)}
        />
      )}
    </div>
  );
}
