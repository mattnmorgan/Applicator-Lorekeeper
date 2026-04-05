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

interface EntryTypeAlias {
  id: string;
  entryTypeId: string;
  singularName: string;
  pluralName: string;
  bgColor?: string;
  fgColor?: string;
}

interface EntrySection {
  id: string;
  name: string;
  sectionType: "fields" | "related_list";
  sortOrder: number;
  config?: { aliasIds?: string[] };
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

  // Aliases
  const [aliases, setAliases] = useState<EntryTypeAlias[]>([]);
  const [showCreateAlias, setShowCreateAlias] = useState(false);
  const [aliasValues, setAliasValues] = useState({ singularName: "", pluralName: "", bgColor: "#1e293b", fgColor: "#94a3b8" });
  const [editingAlias, setEditingAlias] = useState<EntryTypeAlias | null>(null);

  // Field editing
  const [editingField, setEditingField] = useState<EntryField | null>(null);
  const [editingFieldSectionId, setEditingFieldSectionId] = useState<string | null>(null);
  const [editFieldValues, setEditFieldValues] = useState<Record<string, any>>({});
  const [usedPicklistValues, setUsedPicklistValues] = useState<Set<string>>(new Set());

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

  const fetchAliases = async (typeId: string) => {
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/aliases`);
    if (res.ok) setAliases((await res.json()).aliases || []);
  };

  useEffect(() => { fetchTypes(); }, [lorebookId]);
  useEffect(() => {
    if (activeTypeId) {
      fetchSections(activeTypeId);
      fetchAliases(activeTypeId);
    } else {
      setAliases([]);
    }
  }, [activeTypeId]);

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
      config = { options: fieldValues.options || [], multiselect: !!fieldValues.multiselect, allowCustom: !!fieldValues.allowCustom };
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

  const openEditField = async (field: EntryField, sectionId: string) => {
    setEditingField(field);
    setEditingFieldSectionId(sectionId);
    const cfg = (field.config || {}) as any;
    setEditFieldValues({ options: cfg.options ? [...cfg.options] : [], multiselect: cfg.multiselect, allowCustom: cfg.allowCustom });

    // Fetch all records for this entry type to determine which picklist values are in use
    if (field.fieldType === "picklist" && activeTypeId) {
      try {
        const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/records`);
        if (res.ok) {
          const data = await res.json();
          const used = new Set<string>();
          for (const record of data.records || []) {
            const val = record.fieldData?.[field.id];
            if (Array.isArray(val)) val.forEach((v: string) => used.add(v));
            else if (val) used.add(String(val));
          }
          setUsedPicklistValues(used);
        }
      } catch {}
    } else {
      setUsedPicklistValues(new Set());
    }
  };

  const handleSaveField = async () => {
    if (!editingField || !editingFieldSectionId || !activeTypeId) return;
    const updates: any = {};
    if (editingField.fieldType === "picklist") {
      updates.config = {
        options: editFieldValues.options || [],
        multiselect: !!editFieldValues.multiselect,
        allowCustom: !!editFieldValues.allowCustom,
      };
    }
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${editingFieldSectionId}/fields/${editingField.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }
    );
    if (res.ok) {
      const updated = await res.json();
      setFieldsBySection((p) => ({
        ...p,
        [editingFieldSectionId]: (p[editingFieldSectionId] || []).map((f) => f.id === editingField.id ? updated : f),
      }));
      setEditingField(null);
      setEditingFieldSectionId(null);
      addToast("Field updated");
    } else {
      addToast("Failed to update field", "error");
    }
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

  const handleCreateAlias = async () => {
    if (!activeTypeId || !aliasValues.singularName.trim() || !aliasValues.pluralName.trim()) return;
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/aliases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aliasValues),
    });
    if (res.ok) {
      const a = await res.json();
      setAliases((prev) => [...prev, a].sort((x, y) => x.pluralName.localeCompare(y.pluralName)));
      setAliasValues({ singularName: "", pluralName: "", bgColor: "#1e293b", fgColor: "#94a3b8" });
      setShowCreateAlias(false);
      addToast("Alias created");
    } else addToast("Failed to create alias", "error");
  };

  const handleUpdateAlias = async (alias: EntryTypeAlias, updates: Partial<EntryTypeAlias>) => {
    if (!activeTypeId) return;
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/aliases/${alias.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setAliases((prev) => prev.map((a) => a.id === alias.id ? updated : a).sort((x, y) => x.pluralName.localeCompare(y.pluralName)));
      setEditingAlias(null);
    } else addToast("Failed to update alias", "error");
  };

  const handleDeleteAlias = async (aliasId: string) => {
    if (!activeTypeId) return;
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/aliases/${aliasId}`, { method: "DELETE" });
    if (res.ok) {
      setAliases((prev) => prev.filter((a) => a.id !== aliasId));
      addToast("Alias deleted");
    } else addToast("Failed to delete alias", "error");
  };

  const handleUpdateSectionAliasRestriction = async (sec: EntrySection, aliasIds: string[]) => {
    if (!activeTypeId) return;
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sec.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { ...(sec.config || {}), aliasIds } }),
    });
    if (res.ok) {
      setSections((prev) => prev.map((s) => s.id === sec.id ? { ...s, config: { ...(s.config || {}), aliasIds } } : s));
    } else addToast("Failed to update section restriction", "error");
  };

  const activeType = entryTypes.find((t) => t.id === activeTypeId);

  // Returns the full ancestor path label for a type, e.g. "Planets > Continents"
  const getTypePath = (typeId: string, visited = new Set<string>()): string => {
    if (visited.has(typeId)) return "";
    visited.add(typeId);
    const t = entryTypes.find((x) => x.id === typeId);
    if (!t) return "";
    if (!t.parentTypeId) return t.pluralName;
    const parentPath = getTypePath(t.parentTypeId, visited);
    return parentPath ? `${parentPath} › ${t.pluralName}` : t.pluralName;
  };

  // Returns entry types in depth-first tree order with their depth, so children always appear directly under their parent
  const getTreeOrderedTypes = (): Array<{ type: EntryType; depth: number }> => {
    const childrenOf: Record<string, EntryType[]> = {};
    const roots: EntryType[] = [];
    entryTypes.forEach((t) => {
      const parent = t.parentTypeId && entryTypes.find((x) => x.id === t.parentTypeId);
      if (parent) {
        (childrenOf[parent.id] = childrenOf[parent.id] || []).push(t);
      } else {
        roots.push(t);
      }
    });
    // Sort children and roots alphabetically by pluralName
    const byName = (a: EntryType, b: EntryType) => a.pluralName.localeCompare(b.pluralName);
    roots.sort(byName);
    Object.values(childrenOf).forEach((arr) => arr.sort(byName));

    const result: Array<{ type: EntryType; depth: number }> = [];
    const visit = (t: EntryType, depth: number) => {
      result.push({ type: t, depth });
      (childrenOf[t.id] || []).forEach((child) => visit(child, depth + 1));
    };
    roots.forEach((r) => visit(r, 0));
    return result;
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spinner /></div>;

  return (
    <div style={{ display: "flex", gap: 0, height: "100%", overflow: "hidden" }}>
      {/* Left: entry types list */}
      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #1e293b" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 12px 8px 12px", flexShrink: 0, borderBottom: "1px solid #1e293b" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Entry Types</span>
          {canEdit && <ButtonIcon name="plus" label="New entry type" size="sm" onClick={() => setShowCreateType(true)} />}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
        {entryTypes.length === 0 && <div style={{ color: "#64748b", fontSize: 12, padding: "8px 12px" }}>No entry types yet</div>}
        {getTreeOrderedTypes().map(({ type: et, depth }) => {
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
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#1a2e47"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              onClick={() => setActiveTypeId(et.id)}
            >
              {et.hasIcon ? (
                <img src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${et.id}/icon`} style={{ width: 14, height: 14, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} alt="" />
              ) : (
                <span style={{ color: "#64748b", flexShrink: 0 }}><Icon name={(et.icon as any) || "file"} size={12} /></span>
              )}
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <span
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
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
              </div>
              {canEdit && isActive && (
                <ButtonIcon name="trash" label="Delete entry type" subvariant="danger" size="sm" onClick={() => setDeleteTypeTarget(et)} />
              )}
            </div>
          );
        })}
        </div>
      </div>

      {/* Right: active type detail */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!activeType ? (
          <div style={{ padding: "16px 24px", color: "#64748b", fontSize: 13 }}>Select an entry type to edit</div>
        ) : (
          <>
            {/* Sticky type header */}
            <div style={{ flexShrink: 0, padding: "14px 24px 12px 24px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 8 }}>
              {activeType.hasIcon ? (
                <img src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeType.id}/icon`} style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }} alt="" />
              ) : (
                <span style={{ color: "#94a3b8" }}><Icon name={(activeType.icon as any) || "file"} size={16} /></span>
              )}
              <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{activeType.pluralName}</span>
            </div>

            {/* Scrollable form */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px 24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {canEdit && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Icon + Parent Type */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <ImageUpload
                          key={activeType.id}
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
                            <option key={t.id} value={t.id}>{getTypePath(t.id)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
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
                    {/* Singular + Plural Name */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <InlineEdit label="Singular Name" value={activeType.singularName} onSave={(v) => handleUpdateType("singularName", v)} />
                      <InlineEdit label="Plural Name" value={activeType.pluralName} onSave={(v) => handleUpdateType("pluralName", v)} />
                    </div>
                    {/* Summary */}
                    <InlineEdit label="Summary" value={activeType.blurb} onSave={(v) => handleUpdateType("blurb", v)} multiline />
                  </div>
                )}

                {/* Aliases */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Aliases</span>
                      <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>Sub-types used for filtering</span>
                    </div>
                    {canEdit && (
                      <ButtonIcon name="plus" label="Add alias" size="sm" onClick={() => { setAliasValues({ singularName: "", pluralName: "", bgColor: "#1e293b", fgColor: "#94a3b8" }); setShowCreateAlias(true); }} />
                    )}
                  </div>
                  {aliases.length === 0 && <div style={{ fontSize: 12, color: "#64748b" }}>No aliases yet</div>}
                  {aliases.map((alias) => (
                    <div key={alias.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#1e293b", borderRadius: 6 }}>
                      {editingAlias?.id === alias.id ? (
                        <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            value={editingAlias.singularName}
                            onChange={(e) => setEditingAlias({ ...editingAlias, singularName: e.target.value })}
                            placeholder="Singular"
                            style={{ flex: 1, minWidth: 0, background: "#0f172a", border: "1px solid #3b82f6", borderRadius: 4, padding: "4px 6px", color: "#f1f5f9", fontSize: 12, outline: "none" }}
                          />
                          <input
                            value={editingAlias.pluralName}
                            onChange={(e) => setEditingAlias({ ...editingAlias, pluralName: e.target.value })}
                            placeholder="Plural"
                            style={{ flex: 1, minWidth: 0, background: "#0f172a", border: "1px solid #3b82f6", borderRadius: 4, padding: "4px 6px", color: "#f1f5f9", fontSize: 12, outline: "none" }}
                          />
                          <input type="color" value={editingAlias.bgColor || "#1e293b"} onChange={(e) => setEditingAlias({ ...editingAlias, bgColor: e.target.value })} title="Background color" style={{ width: 28, height: 26, border: "1px solid #334155", borderRadius: 3, cursor: "pointer", background: "transparent", flexShrink: 0 }} />
                          <input type="color" value={editingAlias.fgColor || "#94a3b8"} onChange={(e) => setEditingAlias({ ...editingAlias, fgColor: e.target.value })} title="Foreground color" style={{ width: 28, height: 26, border: "1px solid #334155", borderRadius: 3, cursor: "pointer", background: "transparent", flexShrink: 0 }} />
                          <ButtonIcon name="check" label="Save" size="sm" onClick={() => handleUpdateAlias(alias, { singularName: editingAlias.singularName, pluralName: editingAlias.pluralName, bgColor: editingAlias.bgColor, fgColor: editingAlias.fgColor })} />
                          <ButtonIcon name="close" label="Cancel" size="sm" onClick={() => setEditingAlias(null)} />
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: alias.bgColor || "#1e293b", color: alias.fgColor || "#94a3b8", flexShrink: 0 }}>
                            {alias.singularName}
                          </span>
                          <span style={{ flex: 1, fontSize: 12, color: "#e2e8f0" }}>
                            {alias.pluralName} <span style={{ color: "#64748b" }}>/ {alias.singularName}</span>
                          </span>
                          {canEdit && (
                            <>
                              <ButtonIcon name="edit" label="Edit alias" size="sm" onClick={() => setEditingAlias({ ...alias })} />
                              <ButtonIcon name="trash" label="Delete alias" subvariant="danger" size="sm" onClick={() => handleDeleteAlias(alias.id)} />
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))}
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
                    aliases={aliases}
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
                    onEditField={(field) => openEditField(field, sec.id)}
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
                    onUpdateAliasRestriction={(aliasIds) => handleUpdateSectionAliasRestriction(sec, aliasIds)}
                  />
                ))}
              </div>
            )}
          </div>
            </div>
          </>
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
                {entryTypes.map((t) => <option key={t.id} value={t.id}>{getTypePath(t.id)}</option>)}
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
                <PicklistOptionsEditor values={fieldValues.options || []} usedValues={new Set()} onChange={(opts) => setFieldValues((p) => ({ ...p, options: opts }))} />
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

      {showCreateAlias && (
        <Modal
          header={<span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>New Alias</span>}
          closeable
          onClose={() => setShowCreateAlias(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreateAlias(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreateAlias} disabled={!aliasValues.singularName.trim() || !aliasValues.pluralName.trim()}>Create</Button>
            </>
          }
          maxWidth={400}
        >
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <DynamicInput input={{ id: "singularName", label: "Singular Name", type: "text", required: true, placeholder: "e.g. Human" }} value={aliasValues.singularName} onChange={(id, v) => setAliasValues((p) => ({ ...p, [id]: v }))} />
            <DynamicInput input={{ id: "pluralName", label: "Plural Name", type: "text", required: true, placeholder: "e.g. Humans" }} value={aliasValues.pluralName} onChange={(id, v) => setAliasValues((p) => ({ ...p, [id]: v }))} />
            <div style={{ display: "flex", gap: 12, alignItems: "end" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Badge Background</div>
                <input type="color" value={aliasValues.bgColor} onChange={(e) => setAliasValues((p) => ({ ...p, bgColor: e.target.value }))}
                  style={{ width: "100%", height: 32, borderRadius: 6, border: "1px solid #334155", background: "transparent", cursor: "pointer" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Badge Foreground</div>
                <input type="color" value={aliasValues.fgColor} onChange={(e) => setAliasValues((p) => ({ ...p, fgColor: e.target.value }))}
                  style={{ width: "100%", height: 32, borderRadius: 6, border: "1px solid #334155", background: "transparent", cursor: "pointer" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Preview</div>
                <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 4, background: aliasValues.bgColor, color: aliasValues.fgColor }}>
                  {aliasValues.singularName || "Example"}
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {/* Edit field modal */}
      {editingField && editingField.fieldType === "picklist" && (
        <Modal
          header={<span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>Edit Field: {editingField.name}</span>}
          closeable
          onClose={() => setEditingField(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditingField(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleSaveField}>Save</Button>
            </>
          }
          maxWidth={480}
        >
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <DynamicInput input={{ id: "multiselect", label: "Allow multiple selections", type: "toggle" }} value={editFieldValues.multiselect} onChange={(id, v) => setEditFieldValues((p) => ({ ...p, [id]: v }))} />
            <DynamicInput input={{ id: "allowCustom", label: "Allow user-defined custom values", type: "toggle" }} value={editFieldValues.allowCustom} onChange={(id, v) => setEditFieldValues((p) => ({ ...p, [id]: v }))} />
            <PicklistOptionsEditor
              values={editFieldValues.options || []}
              usedValues={usedPicklistValues}
              onChange={(opts) => setEditFieldValues((p) => ({ ...p, options: opts }))}
            />
          </div>
        </Modal>
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

function PicklistOptionsEditor({ values, usedValues = new Set(), onChange }: {
  values: Array<{ value: string; label: string }>;
  usedValues?: Set<string>;
  onChange: (opts: Array<{ value: string; label: string }>) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const addOption = () => {
    if (!newLabel.trim()) return;
    const base = newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "option";
    const existing = new Set(values.map((o) => o.value));
    let value = base;
    let n = 2;
    while (existing.has(value)) value = `${base}_${n++}`;
    onChange([...values, { value, label: newLabel.trim() }]);
    setNewLabel("");
  };

  const saveEdit = (i: number) => {
    if (!editingLabel.trim()) return;
    const updated = values.map((o, j) => j === i ? { ...o, label: editingLabel.trim() } : o);
    onChange(updated);
    setEditingIdx(null);
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Options</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {values.map((opt, i) => (
          <div key={opt.value} style={{ display: "flex", gap: 6, alignItems: "center", padding: "3px 6px", background: "#0f172a", borderRadius: 4 }}>
            {editingIdx === i ? (
              <>
                <input
                  value={editingLabel}
                  onChange={(e) => setEditingLabel(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(i); if (e.key === "Escape") setEditingIdx(null); }}
                  style={{ flex: 1, background: "#1e293b", border: "1px solid #3b82f6", borderRadius: 4, padding: "3px 6px", color: "#f1f5f9", fontSize: 12, outline: "none" }}
                />
                <ButtonIcon name="check" label="Save" size="sm" onClick={() => saveEdit(i)} />
                <ButtonIcon name="close" label="Cancel" size="sm" onClick={() => setEditingIdx(null)} />
              </>
            ) : (
              <>
                <span style={{ fontSize: 12, color: "#e2e8f0", flex: 1 }}>{opt.label}</span>
                <span style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{opt.value}</span>
                <ButtonIcon name="edit" label="Edit label" size="sm" onClick={() => { setEditingIdx(i); setEditingLabel(opt.label); }} />
                {!usedValues.has(opt.value) && (
                  <ButtonIcon name="trash" label="Remove" size="sm" subvariant="danger" onClick={() => onChange(values.filter((_, j) => j !== i))} />
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input placeholder="New option label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addOption(); }}
          style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 4, padding: "4px 6px", color: "#f1f5f9", fontSize: 12, outline: "none" }} />
        <ButtonIcon name="plus" label="Add option" size="sm" onClick={addOption} />
      </div>
    </div>
  );
}

function SectionEditor({
  sec, fields, relatedItems, entryTypes, activeTypeId, canEdit, aliases,
  onRename, onDelete, onMoveUp, onMoveDown,
  onAddField, onEditField, onDeleteField, onMoveFieldUp, onMoveFieldDown,
  onAddRelated, onRemoveRelated, onUpdateAliasRestriction,
}: {
  sec: EntrySection;
  fields: EntryField[];
  relatedItems: RelatedItem[];
  entryTypes: EntryType[];
  activeTypeId: string;
  canEdit: boolean;
  aliases: EntryTypeAlias[];
  onRename: (name: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddField: () => void;
  onEditField: (field: EntryField) => void;
  onDeleteField: (id: string) => void;
  onMoveFieldUp: (id: string) => void;
  onMoveFieldDown: (id: string) => void;
  onAddRelated: () => void;
  onRemoveRelated: (id: string) => void;
  onUpdateAliasRestriction: (aliasIds: string[]) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(sec.name);
  const [showDeleteSec, setShowDeleteSec] = useState(false);

  return (
    <div style={{ background: "#1e293b", borderRadius: 10, padding: 14 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
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
          <>
            <ButtonIcon name="chevron-up" label="Move up" size="sm" onClick={onMoveUp} />
            <ButtonIcon name="chevron-down" label="Move down" size="sm" onClick={onMoveDown} />
            <span
              style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#f1f5f9", cursor: canEdit ? "pointer" : "default" }}
              onClick={() => canEdit && setEditingName(true)}
            >
              {sec.name}
              <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>
                ({sec.sectionType === "fields" ? "Fields" : "Related List"})
              </span>
            </span>
            {canEdit && <ButtonIcon name="trash" label="Delete section" subvariant="danger" size="sm" onClick={() => setShowDeleteSec(true)} />}
          </>
        )}
      </div>

      {/* Fields section */}
      {sec.sectionType === "fields" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {fields.map((field, fi) => (
            <div key={field.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: "#0f172a", borderRadius: 6 }}>
              {canEdit && (
                <>
                  <ButtonIcon name="chevron-up" label="Move up" size="sm" onClick={() => onMoveFieldUp(field.id)} />
                  <ButtonIcon name="chevron-down" label="Move down" size="sm" onClick={() => onMoveFieldDown(field.id)} />
                </>
              )}
              <span style={{ flex: 1, fontSize: 12, color: "#e2e8f0" }}>{field.name}</span>
              <span style={{ fontSize: 11, color: "#94a3b8", background: "#1e293b", padding: "2px 6px", borderRadius: 4 }}>
                {FIELD_TYPE_LABELS[field.fieldType] || field.fieldType}
              </span>
              {canEdit && field.fieldType === "picklist" && (
                <ButtonIcon name="edit" label="Edit field" size="sm" onClick={() => onEditField(field)} />
              )}
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

      {/* Alias restriction */}
      {aliases.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e293b" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Visible for</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <span
              onClick={() => canEdit && onUpdateAliasRestriction([])}
              style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, cursor: canEdit ? "pointer" : "default", background: !sec.config?.aliasIds?.length ? "#3b82f6" : "#0f172a", color: !sec.config?.aliasIds?.length ? "#fff" : "#94a3b8", border: `1px solid ${!sec.config?.aliasIds?.length ? "#3b82f6" : "#334155"}` }}
            >
              All
            </span>
            {aliases.map((alias) => {
              const selected = (sec.config?.aliasIds || []).includes(alias.id);
              return (
                <span
                  key={alias.id}
                  onClick={() => {
                    if (!canEdit) return;
                    const cur = sec.config?.aliasIds || [];
                    onUpdateAliasRestriction(selected ? cur.filter((id) => id !== alias.id) : [...cur, alias.id]);
                  }}
                  style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, cursor: canEdit ? "pointer" : "default", background: selected ? "#3b82f6" : "#0f172a", color: selected ? "#fff" : "#94a3b8", border: `1px solid ${selected ? "#3b82f6" : "#334155"}` }}
                >
                  {alias.pluralName}
                </span>
              );
            })}
          </div>
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
