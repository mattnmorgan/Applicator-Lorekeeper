"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Button,
  ButtonIcon,
  Icon,
  Modal,
  ConfirmModal,
  DynamicInput,
  Spinner,
  ImageUpload,
  FormEditor,
  InfoTooltip,
  Tooltip,
} from "@applicator/sdk/components";
import type {
  FormLayout,
  FormFieldBadge,
  FormAliasBadge,
  SerializedInputDef,
} from "@applicator/sdk/components";

// ─── Local types ──────────────────────────────────────────────────────────────

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
  isGroup?: boolean;
  formLayout?: FormLayout | null;
}

interface EntryTypeAlias {
  id: string;
  entryTypeId: string;
  singularName: string;
  pluralName: string;
  bgColor?: string;
  fgColor?: string;
  visible?: boolean;
  blurb?: string;
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
  aliasIds?: string[];
  required?: boolean;
  tooltip?: string;
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

const FIELD_TYPES = [
  "text",
  "rich_text",
  "picklist",
  "toggle",
  "number",
  "lookup",
];
const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  rich_text: "Rich Text",
  picklist: "Picklist",
  toggle: "Toggle",
  number: "Number",
  lookup: "Lookup",
};

type ActiveTab = "details" | "fields" | "form" | "related";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  lorebookId: string;
  canEdit: boolean;
  addToast: (message: string, type?: "success" | "error") => void;
}

// ─── MetadataTab ──────────────────────────────────────────────────────────────

export default function MetadataTab({ lorebookId, canEdit, addToast }: Props) {
  const [entryTypes, setEntryTypes] = useState<EntryType[]>([]);
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("details");
  const [loading, setLoading] = useState(true);

  // Per-type data (loaded when activeTypeId changes)
  const [aliases, setAliases] = useState<EntryTypeAlias[]>([]);
  const [fields, setFields] = useState<EntryField[]>([]);
  const [sections, setSections] = useState<EntrySection[]>([]);
  const [relatedBySec, setRelatedBySec] = useState<
    Record<string, RelatedItem[]>
  >({});
  const [loadingTypeData, setLoadingTypeData] = useState(false);

  // Modals / create state
  const [showCreateType, setShowCreateType] = useState(false);
  const [typeValues, setTypeValues] = useState<Record<string, any>>({
    singularName: "",
    pluralName: "",
    blurb: "",
    bgColor: "#334155",
    fgColor: "#f1f5f9",
    parentTypeId: "",
  });
  const [createTypeIcon, setCreateTypeIcon] = useState<string | null>(null);
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<EntryType | null>(
    null,
  );

  // Alias CRUD
  const [showCreateAlias, setShowCreateAlias] = useState(false);
  const [aliasValues, setAliasValues] = useState({
    singularName: "",
    pluralName: "",
    blurb: "",
    bgColor: "#1e293b",
    fgColor: "#94a3b8",
    visible: true,
  });
  const [editingAlias, setEditingAlias] = useState<EntryTypeAlias | null>(null);

  // Field CRUD
  const [showCreateField, setShowCreateField] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({
    name: "",
    fieldType: "text",
  });
  const [editingField, setEditingField] = useState<EntryField | null>(null);
  const [editFieldValues, setEditFieldValues] = useState<Record<string, any>>(
    {},
  );
  const [usedPicklistValues, setUsedPicklistValues] = useState<Set<string>>(
    new Set(),
  );

  // Related (sections with sectionType === "related_list")
  const [showCreateRelSec, setShowCreateRelSec] = useState(false);
  const [newRelSecName, setNewRelSecName] = useState("");
  const [relatedSecId, setRelatedSecId] = useState<string | null>(null);
  const [relatedTypeId, setRelatedTypeId] = useState("");
  const [relatedFieldId, setRelatedFieldId] = useState("");
  const [relatedTypeFields, setRelatedTypeFields] = useState<EntryField[]>([]);
  const [renamingRelSecId, setRenamingRelSecId] = useState<string | null>(null);
  const [relSecRenameValue, setRelSecRenameValue] = useState("");
  const [lookupTargetAliasOptions, setLookupTargetAliasOptions] = useState<EntryTypeAlias[]>([]);
  const [editingFieldTargetAliases, setEditingFieldTargetAliases] = useState<EntryTypeAlias[]>([]);

  // Per-type icon version for cache-busting after upload
  const [typeIconVersions, setTypeIconVersions] = useState<
    Record<string, number>
  >({});

  const [reparenting, setReparenting] = useState(false);

  // Debounce ref for badge color updates
  const colorSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleColorChange = (field: "bgColor" | "fgColor", value: string) => {
    if (!activeTypeId) return;
    // Optimistic update for immediate preview
    setEntryTypes((prev) =>
      prev.map((t) => (t.id === activeTypeId ? { ...t, [field]: value } : t)),
    );
    // Debounced server save
    if (colorSaveRef.current) clearTimeout(colorSaveRef.current);
    colorSaveRef.current = setTimeout(() => {
      fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        },
      );
    }, 600);
  };

  const handleReparentAll = async () => {
    if (!activeType || aliases.length === 0) return;
    setReparenting(true);
    try {
      const res = await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/aliases`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: aliases.map((a) => a.id),
            bgColor: activeType.bgColor,
            fgColor: activeType.fgColor,
          }),
        },
      );
      if (res.ok) {
        const { aliases: updated } = await res.json();
        setAliases(
          updated.sort((a: any, b: any) => a.pluralName.localeCompare(b.pluralName)),
        );
        addToast("All aliases updated to match entry type colors");
      } else {
        addToast("Failed to update aliases", "error");
      }
    } finally {
      setReparenting(false);
    }
  };

  // Form layout save debounce
  const formLayoutSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchTypes = async () => {
    setLoading(true);
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types`,
    );
    if (res.ok) {
      const d = await res.json();
      setEntryTypes(d.entryTypes || []);
      if (!activeTypeId && d.entryTypes?.length > 0)
        setActiveTypeId(d.entryTypes[0].id);
    }
    setLoading(false);
  };

  const fetchTypeData = async (typeId: string) => {
    setLoadingTypeData(true);
    const [aliasRes, fieldRes, secRes] = await Promise.all([
      fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/aliases`,
      ),
      fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/fields`,
      ),
      fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/sections`,
      ),
    ]);
    if (aliasRes.ok) setAliases((await aliasRes.json()).aliases || []);
    else setAliases([]);
    if (fieldRes.ok) setFields((await fieldRes.json()).fields || []);
    else setFields([]);
    if (secRes.ok) {
      const { sections: secs } = await secRes.json();
      const relSecs = (secs || []).filter(
        (s: EntrySection) => s.sectionType === "related_list",
      );
      setSections(relSecs);
      const rMap: Record<string, RelatedItem[]> = {};
      await Promise.all(
        relSecs.map(async (sec: EntrySection) => {
          const r = await fetch(
            `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/sections/${sec.id}/related`,
          );
          if (r.ok) rMap[sec.id] = (await r.json()).items || [];
        }),
      );
      setRelatedBySec(rMap);
    } else {
      setSections([]);
      setRelatedBySec({});
    }
    setLoadingTypeData(false);
  };

  useEffect(() => {
    fetchTypes();
  }, [lorebookId]);
  useEffect(() => {
    if (activeTypeId) fetchTypeData(activeTypeId);
    else {
      setAliases([]);
      setFields([]);
      setSections([]);
      setRelatedBySec({});
    }
  }, [activeTypeId]);

  // ── Entry type CRUD ─────────────────────────────────────────────────────────

  const handleCreateType = async () => {
    if (!typeValues.singularName?.trim() || !typeValues.pluralName?.trim()) {
      addToast("Singular and plural names are required", "error");
      return;
    }
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(typeValues),
      },
    );
    if (res.ok) {
      let et = await res.json();
      // Upload icon if one was selected
      if (createTypeIcon) {
        const iconRes = await fetch(
          `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${et.id}/icon`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ iconData: createTypeIcon }),
          },
        );
        if (iconRes.ok) et = { ...et, hasIcon: true };
      }
      addToast("Entry type created");
      setShowCreateType(false);
      setCreateTypeIcon(null);
      setTypeValues({
        singularName: "",
        pluralName: "",
        blurb: "",
        bgColor: "#334155",
        fgColor: "#f1f5f9",
        parentTypeId: "",
      });
      setEntryTypes((prev) => [...prev, et]);
      setActiveTypeId(et.id);
    } else addToast("Failed to create entry type", "error");
  };

  const handleUpdateType = async (field: keyof EntryType, value: any) => {
    if (!activeTypeId) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      },
    );
    if (res.ok) {
      const updated = await res.json();
      setEntryTypes((prev) =>
        prev.map((t) => (t.id === activeTypeId ? { ...t, ...updated } : t)),
      );
    } else addToast("Failed to save", "error");
  };

  const handleDeleteType = async () => {
    if (!deleteTypeTarget) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${deleteTypeTarget.id}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      addToast("Entry type deleted");
      const remaining = entryTypes.filter((t) => t.id !== deleteTypeTarget.id);
      setEntryTypes(remaining);
      setActiveTypeId(remaining.length > 0 ? remaining[0].id : null);
      setDeleteTypeTarget(null);
    } else addToast("Failed to delete", "error");
  };

  // ── Alias CRUD ──────────────────────────────────────────────────────────────

  const handleCreateAlias = async () => {
    if (
      !activeTypeId ||
      !aliasValues.singularName.trim() ||
      !aliasValues.pluralName.trim()
    )
      return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/aliases`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aliasValues),
      },
    );
    if (res.ok) {
      const a = await res.json();
      setAliases((prev) =>
        [...prev, a].sort((x, y) => x.pluralName.localeCompare(y.pluralName)),
      );
      setAliasValues({
        singularName: "",
        pluralName: "",
        blurb: "",
        bgColor: "#1e293b",
        fgColor: "#94a3b8",
        visible: true,
      });
      setShowCreateAlias(false);
      addToast("Alias created");
    } else addToast("Failed to create alias", "error");
  };

  const handleUpdateAlias = async (
    alias: EntryTypeAlias,
    updates: Partial<EntryTypeAlias>,
  ) => {
    if (!activeTypeId) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/aliases/${alias.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );
    if (res.ok) {
      const updated = await res.json();
      setAliases((prev) =>
        prev
          .map((a) => (a.id === alias.id ? updated : a))
          .sort((x, y) => x.pluralName.localeCompare(y.pluralName)),
      );
      setEditingAlias(null);
    } else addToast("Failed to update alias", "error");
  };

  const handleDeleteAlias = async (aliasId: string) => {
    if (!activeTypeId) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/aliases/${aliasId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setAliases((prev) => prev.filter((a) => a.id !== aliasId));
      addToast("Alias deleted");
    } else addToast("Failed to delete alias", "error");
  };

  const handleToggleAllAliasVisibility = async () => {
    if (!activeTypeId || aliases.length === 0) return;
    const targetVisible = !aliases.some((a) => a.visible !== false);
    // Optimistic update
    setAliases((prev) => prev.map((a) => ({ ...a, visible: targetVisible })));
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/aliases`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: aliases.map((a) => a.id), visible: targetVisible }),
      },
    );
    if (!res.ok) addToast("Failed to update aliases", "error");
  };

  // ── Field CRUD ──────────────────────────────────────────────────────────────

  const buildFieldConfig = (values: Record<string, any>) => {
    if (values.fieldType === "picklist")
      return {
        options: values.options || [],
        multiselect: !!values.multiselect,
        allowCustom: !!values.allowCustom,
      };
    if (values.fieldType === "number")
      return {
        decimals: values.decimals ?? 0,
        min: values.min,
        max: values.max,
        unit: values.unit || "",
        unitPosition: values.unitPosition || "suffix",
      };
    if (values.fieldType === "lookup")
      return {
        multiselect: !!values.lookupMultiselect,
        targetEntryTypeIds: values.targetTypeIds || [],
        targetAliasIds: values.targetAliasIds || [],
        aToB: values.aToB || "",
        bToA: values.bToA || "",
      };
    return {};
  };

  const handleCreateField = async () => {
    if (!activeTypeId || !fieldValues.name?.trim()) {
      addToast("Field name is required", "error");
      return;
    }
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/fields`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fieldValues.name.trim(),
          fieldType: fieldValues.fieldType,
          config: buildFieldConfig(fieldValues),
          aliasIds: fieldValues.aliasIds || [],
          required: !!fieldValues.required,
          tooltip: fieldValues.tooltip || "",
        }),
      },
    );
    if (res.ok) {
      const field = await res.json();
      setFields((prev) => [...prev, field]);
      setFieldValues({ name: "", fieldType: "text" });
      setShowCreateField(false);
      addToast("Field created");
    } else addToast("Failed to create field", "error");
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!activeTypeId) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/fields/${fieldId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      // Also remove from formLayout
      if (activeType?.formLayout) {
        const cleaned = removeFieldFromLayout(activeType.formLayout, fieldId);
        const updated = { ...activeType, formLayout: cleaned };
        setEntryTypes((prev) =>
          prev.map((t) => (t.id === activeTypeId ? updated : t)),
        );
        saveFormLayout(activeTypeId, cleaned);
      }
      addToast("Field deleted");
    } else addToast("Failed to delete field", "error");
  };

  const openEditField = async (field: EntryField) => {
    setEditingField(field);
    const cfg = (field.config || {}) as any;
    setEditFieldValues({
      options: cfg.options ? [...cfg.options].sort((a: any, b: any) => a.label.localeCompare(b.label)) : [],
      multiselect: cfg.multiselect,
      allowCustom: cfg.allowCustom,
      required: !!field.required,
      tooltip: field.tooltip || "",
      aliasIds: field.aliasIds || [],
      // number
      decimals: cfg.decimals ?? 0,
      min: cfg.min ?? "",
      max: cfg.max ?? "",
      unit: cfg.unit || "",
      unitPosition: cfg.unitPosition || "suffix",
      // lookup
      aToB: cfg.aToB || "",
      bToA: cfg.bToA || "",
    });
    if (field.fieldType === "lookup") {
      const targetTypeIds: string[] = (field.config as any)?.targetEntryTypeIds || [];
      if (targetTypeIds.length > 0) {
        const results: EntryTypeAlias[] = [];
        await Promise.all(targetTypeIds.map(async (tid) => {
          try {
            const r = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${tid}/aliases`);
            if (r.ok) results.push(...((await r.json()).aliases || []));
          } catch {}
        }));
        setEditingFieldTargetAliases(results.sort((a, b) => a.pluralName.localeCompare(b.pluralName)));
      } else setEditingFieldTargetAliases([]);
    }
    if (field.fieldType === "picklist" && activeTypeId) {
      try {
        const res = await fetch(
          `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/records`,
        );
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
    } else setUsedPicklistValues(new Set());
  };

  const handleSaveField = async () => {
    if (!editingField || !activeTypeId) return;
    const updates: any = {
      required: !!editFieldValues.required,
      tooltip: editFieldValues.tooltip || "",
      aliasIds: editFieldValues.aliasIds || [],
    };
    if (editingField.fieldType === "picklist")
      updates.config = {
        options: editFieldValues.options || [],
        multiselect: !!editFieldValues.multiselect,
        allowCustom: !!editFieldValues.allowCustom,
      };
    if (editingField.fieldType === "number")
      updates.config = {
        decimals: editFieldValues.decimals ?? 0,
        min: editFieldValues.min || undefined,
        max: editFieldValues.max || undefined,
        unit: editFieldValues.unit || "",
        unitPosition: editFieldValues.unitPosition || "suffix",
      };
    if (editingField.fieldType === "lookup")
      updates.config = {
        ...(editingField.config || {}),
        aToB: editFieldValues.aToB || "",
        bToA: editFieldValues.bToA || "",
      };
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/fields/${editingField.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );
    if (res.ok) {
      const updated = await res.json();
      setFields((prev) =>
        prev.map((f) => (f.id === editingField.id ? updated : f)),
      );
      setEditingField(null);
      addToast("Field updated");
    } else addToast("Failed to update field", "error");
  };


  // ── Form layout ─────────────────────────────────────────────────────────────

  const saveFormLayout = (typeId: string, layout: FormLayout) => {
    if (formLayoutSaveRef.current) clearTimeout(formLayoutSaveRef.current);
    formLayoutSaveRef.current = setTimeout(async () => {
      await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/form-layout`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formLayout: layout }),
        },
      );
    }, 600);
  };

  const handleFormLayoutChange = (layout: FormLayout) => {
    if (!activeTypeId) return;
    setEntryTypes((prev) =>
      prev.map((t) =>
        t.id === activeTypeId ? { ...t, formLayout: layout } : t,
      ),
    );
    saveFormLayout(activeTypeId, layout);
  };

  // ── Related sections ────────────────────────────────────────────────────────

  const handleCreateRelatedSection = async () => {
    if (!activeTypeId || !newRelSecName.trim()) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRelSecName.trim(),
          sectionType: "related_list",
        }),
      },
    );
    if (res.ok) {
      const sec = await res.json();
      setSections((prev) => [...prev, sec]);
      setRelatedBySec((p) => ({ ...p, [sec.id]: [] }));
      setNewRelSecName("");
      setShowCreateRelSec(false);
      addToast("Related section created");
    } else addToast("Failed to create section", "error");
  };

  const handleRenameRelatedSection = async (sectionId: string, newName: string) => {
    if (!activeTypeId || !newName.trim()) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sectionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      },
    );
    if (res.ok) {
      setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, name: newName.trim() } : s));
      setRenamingRelSecId(null);
    } else addToast("Failed to rename section", "error");
  };

  const handleDeleteRelatedSection = async (sec: EntrySection) => {
    if (!activeTypeId) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sec.id}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setSections((prev) => prev.filter((s) => s.id !== sec.id));
      setRelatedBySec((p) => {
        const n = { ...p };
        delete n[sec.id];
        return n;
      });
      addToast("Section deleted");
    }
  };

  const handleAddRelated = async (sectionId: string) => {
    if (!activeTypeId || !relatedTypeId || !relatedFieldId) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sectionId}/related`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryTypeId: relatedTypeId,
          fieldId: relatedFieldId,
        }),
      },
    );
    if (res.ok) {
      const item = await res.json();
      const et = entryTypes.find((t) => t.id === relatedTypeId);
      const field = relatedTypeFields.find((f) => f.id === relatedFieldId);
      setRelatedBySec((p) => ({
        ...p,
        [sectionId]: [
          ...(p[sectionId] || []),
          {
            ...item,
            entryTypeName: et?.pluralName || "",
            fieldName: field?.name || "",
          },
        ],
      }));
      setRelatedSecId(null);
      setRelatedTypeId("");
      setRelatedFieldId("");
      setRelatedTypeFields([]);
      addToast("Related pairing added");
    } else addToast("Failed to add pairing", "error");
  };

  const handleRemoveRelated = async (sectionId: string, itemId: string) => {
    if (!activeTypeId) return;
    const res = await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeTypeId}/sections/${sectionId}/related/${itemId}`,
      { method: "DELETE" },
    );
    if (res.ok)
      setRelatedBySec((p) => ({
        ...p,
        [sectionId]: (p[sectionId] || []).filter((i) => i.id !== itemId),
      }));
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const activeType = entryTypes.find((t) => t.id === activeTypeId);

  const getTypePath = (typeId: string, visited = new Set<string>()): string => {
    if (visited.has(typeId)) return "";
    visited.add(typeId);
    const t = entryTypes.find((x) => x.id === typeId);
    if (!t) return "";
    if (!t.parentTypeId) return t.pluralName;
    const parentPath = getTypePath(t.parentTypeId, visited);
    return parentPath ? `${parentPath} › ${t.pluralName}` : t.pluralName;
  };

  const getTreeOrderedTypes = (): Array<{ type: EntryType; depth: number }> => {
    const childrenOf: Record<string, EntryType[]> = {};
    const roots: EntryType[] = [];
    entryTypes.forEach((t) => {
      const parent =
        t.parentTypeId && entryTypes.find((x) => x.id === t.parentTypeId);
      if (parent) (childrenOf[parent.id] = childrenOf[parent.id] || []).push(t);
      else roots.push(t);
    });
    const byName = (a: EntryType, b: EntryType) =>
      a.pluralName.localeCompare(b.pluralName);
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

  const emptyFormLayout: FormLayout = { sections: [] };

  const formEditorFields: FormFieldBadge[] = [...fields]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({
      id: f.id,
      name: f.name,
      fieldType: f.fieldType,
    }));
  const formEditorAliases: FormAliasBadge[] = aliases.map((a) => ({
    id: a.id,
    singularName: a.singularName,
    pluralName: a.pluralName,
    bgColor: a.bgColor,
    fgColor: a.fgColor,
  }));

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading)
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
        <Spinner />
      </div>
    );

  return (
    <div
      style={{ display: "flex", gap: 0, height: "100%", overflow: "hidden" }}
    >
      {/* Left: entry types list */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #1e293b",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 12px 8px 12px",
            flexShrink: 0,
            borderBottom: "1px solid #1e293b",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
            Entry Types
          </span>
          {canEdit && (
            <ButtonIcon
              name="plus"
              label="New entry type"
              size="sm"
              onClick={() => setShowCreateType(true)}
            />
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {entryTypes.length === 0 && (
            <div
              style={{ color: "#64748b", fontSize: 12, padding: "8px 12px" }}
            >
              No entry types yet
            </div>
          )}
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
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "#1a2e47";
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    e.currentTarget.style.background = "transparent";
                }}
                onClick={() => {
                  setActiveTypeId(et.id);
                  setActiveTab("details");
                }}
              >
                {et.hasIcon ? (
                  <img
                    src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${et.id}/icon${typeIconVersions[et.id] ? `?v=${typeIconVersions[et.id]}` : ""}`}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      objectFit: "cover",
                      flexShrink: 0,
                    }}
                    alt=""
                  />
                ) : (
                  <span style={{ color: "#64748b", flexShrink: 0 }}>
                    <Icon name={(et.icon as any) || "file"} size={12} />
                  </span>
                )}
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
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
                  <ButtonIcon
                    name="trash"
                    label="Delete entry type"
                    subvariant="danger"
                    size="sm"
                    onClick={() => setDeleteTypeTarget(et)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: active type detail */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {!activeType ? (
          <div style={{ padding: "16px 24px", color: "#64748b", fontSize: 13 }}>
            Select an entry type to edit
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              style={{
                flexShrink: 0,
                padding: "10px 24px 0 24px",
                borderBottom: "1px solid #1e293b",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                {activeType.hasIcon ? (
                  <img
                    src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeType.id}/icon${typeIconVersions[activeType.id] ? `?v=${typeIconVersions[activeType.id]}` : ""}`}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      objectFit: "cover",
                    }}
                    alt=""
                  />
                ) : (
                  <span style={{ color: "#94a3b8" }}>
                    <Icon name={(activeType.icon as any) || "file"} size={16} />
                  </span>
                )}
                <span
                  style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}
                >
                  {activeType.pluralName}
                </span>
              </div>
              {/* Tab strip */}
              <div style={{ display: "flex", gap: 0 }}>
                {(["details", "fields", "form", "related"] as ActiveTab[]).map(
                  (tab) => {
                    const label = tab.charAt(0).toUpperCase() + tab.slice(1);
                    const isActive = activeTab === tab;
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                          padding: "6px 14px",
                          background: "none",
                          border: "none",
                          borderBottom: isActive
                            ? "2px solid #3b82f6"
                            : "2px solid transparent",
                          color: isActive ? "#f1f5f9" : "#64748b",
                          fontSize: 13,
                          cursor: "pointer",
                          fontWeight: isActive ? 600 : 400,
                          transition: "color 0.12s, border-color 0.12s",
                        }}
                      >
                        {label}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            {/* Tab content */}
            <div
              style={
                activeTab === "form"
                  ? {
                      flex: 1,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }
                  : {
                      flex: 1,
                      overflowY: "auto",
                      padding: "16px 24px 24px 24px",
                    }
              }
            >
              {loadingTypeData ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    padding: 24,
                  }}
                >
                  <Spinner />
                </div>
              ) : (
                <>
                  {/* ── Details tab ── */}
                  {activeTab === "details" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {canEdit && (
                        <>
                          {/* Icon + Parent Type */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 10,
                            }}
                          >
                            <div>
                              <ImageUpload
                                key={activeType.id}
                                label="Icon"
                                value={
                                  activeType.hasIcon
                                    ? `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeType.id}/icon${typeIconVersions[activeType.id] ? `?v=${typeIconVersions[activeType.id]}` : ""}`
                                    : null
                                }
                                onChange={async (dataUrl) => {
                                  const res = await fetch(
                                    `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${activeType.id}/icon`,
                                    {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        iconData: dataUrl,
                                      }),
                                    },
                                  );
                                  if (res.ok) {
                                    const data = await res.json();
                                    const typeId = activeType.id;
                                    setEntryTypes((prev) =>
                                      prev.map((t) =>
                                        t.id === typeId
                                          ? { ...t, hasIcon: data.hasIcon }
                                          : t,
                                      ),
                                    );
                                    setTypeIconVersions((prev) => ({
                                      ...prev,
                                      [typeId]: (prev[typeId] || 0) + 1,
                                    }));
                                  }
                                }}
                                previewSize={48}
                                previewRadius={8}
                              />
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  marginBottom: 4,
                                }}
                              >
                                Parent Type
                              </div>
                              <select
                                value={activeType.parentTypeId || ""}
                                onChange={(e) =>
                                  handleUpdateType(
                                    "parentTypeId",
                                    e.target.value,
                                  )
                                }
                                style={{
                                  background: "#1e293b",
                                  border: "1px solid #334155",
                                  borderRadius: 6,
                                  padding: "5px 8px",
                                  color: "#f1f5f9",
                                  fontSize: 12,
                                  outline: "none",
                                  width: "100%",
                                }}
                              >
                                <option value="">None</option>
                                {entryTypes
                                  .filter((t) => t.id !== activeTypeId)
                                  .map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {getTypePath(t.id)}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                          {/* Names */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr auto",
                              gap: 10,
                              alignItems: "start",
                            }}
                          >
                            <InlineEdit
                              label="Singular Name"
                              value={activeType.singularName}
                              onSave={(v) =>
                                handleUpdateType("singularName", v)
                              }
                            />
                            <InlineEdit
                              label="Plural Name"
                              value={activeType.pluralName}
                              onSave={(v) => handleUpdateType("pluralName", v)}
                            />
                            <div>
                              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                                Group
                                <InfoTooltip text="Group types are not selectable in the navigation menu. Use them to organise child entry types hierarchically." />
                              </div>
                              <DynamicInput
                                input={{ id: "isGroup", label: "", type: "toggle" }}
                                value={!!activeType.isGroup}
                                onChange={(_, v) => handleUpdateType("isGroup", v)}
                              />
                            </div>
                          </div>
                          {/* Summary */}
                          <InlineEdit
                            label="Summary"
                            value={activeType.blurb}
                            onSave={(v) => handleUpdateType("blurb", v)}
                            multiline
                          />
                          {/* Badge colors */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr 1fr",
                              gap: 10,
                              alignItems: "end",
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  marginBottom: 4,
                                }}
                              >
                                Badge Background
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                <input
                                  type="color"
                                  value={activeType.bgColor || "#334155"}
                                  onChange={(e) =>
                                    handleColorChange("bgColor", e.target.value)
                                  }
                                  style={{
                                    width: 36,
                                    height: 28,
                                    borderRadius: 4,
                                    border: "1px solid #334155",
                                    background: "transparent",
                                    cursor: "pointer",
                                  }}
                                />
                                <span
                                  style={{ fontSize: 12, color: "#94a3b8" }}
                                >
                                  {activeType.bgColor}
                                </span>
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  marginBottom: 4,
                                }}
                              >
                                Badge Foreground
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                <input
                                  type="color"
                                  value={activeType.fgColor || "#f1f5f9"}
                                  onChange={(e) =>
                                    handleColorChange("fgColor", e.target.value)
                                  }
                                  style={{
                                    width: 36,
                                    height: 28,
                                    borderRadius: 4,
                                    border: "1px solid #334155",
                                    background: "transparent",
                                    cursor: "pointer",
                                  }}
                                />
                                <span
                                  style={{ fontSize: 12, color: "#94a3b8" }}
                                >
                                  {activeType.fgColor}
                                </span>
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  marginBottom: 4,
                                }}
                              >
                                Preview
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span
                                  style={{
                                    fontSize: 12,
                                    padding: "3px 10px",
                                    borderRadius: 4,
                                    background: activeType.bgColor || "#334155",
                                    color: activeType.fgColor || "#f1f5f9",
                                  }}
                                >
                                  {activeType.singularName}
                                </span>
                                {canEdit && aliases.length > 0 && (
                                  <ButtonIcon
                                    name="refresh"
                                    label="Reparent all aliases to match these colors"
                                    size="sm"
                                    disabled={reparenting}
                                    onClick={handleReparentAll}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Aliases */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          paddingTop: canEdit ? 4 : 0,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "#f1f5f9",
                              }}
                            >
                              Aliases
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: "#64748b",
                                marginLeft: 8,
                              }}
                            >
                              Sub-types used for filtering
                            </span>
                          </div>
                          {canEdit && (
                            <div style={{ display: "flex", gap: 4 }}>
                              {aliases.length > 0 && (
                                <ButtonIcon
                                  name={aliases.some((a) => a.visible !== false) ? "eye-off" : "eye"}
                                  label={aliases.some((a) => a.visible !== false) ? "Make all invisible" : "Make all visible"}
                                  size="sm"
                                  onClick={handleToggleAllAliasVisibility}
                                />
                              )}
                              <ButtonIcon
                                name="plus"
                                label="Add alias"
                                size="sm"
                                onClick={() => {
                                  setAliasValues({
                                    singularName: "",
                                    pluralName: "",
                                    blurb: "",
                                    bgColor: "#1e293b",
                                    fgColor: "#94a3b8",
                                    visible: true,
                                  });
                                  setShowCreateAlias(true);
                                }}
                              />
                            </div>
                          )}
                        </div>
                        {aliases.length === 0 && (
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            No aliases yet
                          </div>
                        )}
                        {aliases.map((alias) => (
                          <div
                            key={alias.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "6px 10px",
                              background: "#1e293b",
                              borderRadius: 6,
                            }}
                          >
                            {editingAlias?.id === alias.id ? (
                              <div
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  display: "flex",
                                  gap: 6,
                                  alignItems: "center",
                                }}
                              >
                                <input
                                  value={editingAlias.singularName}
                                  onChange={(e) =>
                                    setEditingAlias({
                                      ...editingAlias,
                                      singularName: e.target.value,
                                    })
                                  }
                                  placeholder="Singular"
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    background: "#0f172a",
                                    border: "1px solid #3b82f6",
                                    borderRadius: 4,
                                    padding: "4px 6px",
                                    color: "#f1f5f9",
                                    fontSize: 12,
                                    outline: "none",
                                  }}
                                />
                                <input
                                  value={editingAlias.pluralName}
                                  onChange={(e) =>
                                    setEditingAlias({
                                      ...editingAlias,
                                      pluralName: e.target.value,
                                    })
                                  }
                                  placeholder="Plural"
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    background: "#0f172a",
                                    border: "1px solid #3b82f6",
                                    borderRadius: 4,
                                    padding: "4px 6px",
                                    color: "#f1f5f9",
                                    fontSize: 12,
                                    outline: "none",
                                  }}
                                />
                                <input
                                  value={editingAlias.blurb || ""}
                                  onChange={(e) =>
                                    setEditingAlias({
                                      ...editingAlias,
                                      blurb: e.target.value,
                                    })
                                  }
                                  placeholder="Summary…"
                                  style={{
                                    flex: 2,
                                    minWidth: 0,
                                    background: "#0f172a",
                                    border: "1px solid #3b82f6",
                                    borderRadius: 4,
                                    padding: "4px 6px",
                                    color: "#f1f5f9",
                                    fontSize: 12,
                                    outline: "none",
                                  }}
                                />
                                <input
                                  type="color"
                                  value={
                                    editingAlias.bgColor ||
                                    activeType?.bgColor ||
                                    "#334155"
                                  }
                                  onChange={(e) =>
                                    setEditingAlias({
                                      ...editingAlias,
                                      bgColor: e.target.value,
                                    })
                                  }
                                  title="Background color"
                                  style={{
                                    width: 28,
                                    height: 26,
                                    border: "1px solid #334155",
                                    borderRadius: 3,
                                    cursor: "pointer",
                                    background: "transparent",
                                    flexShrink: 0,
                                  }}
                                />
                                <input
                                  type="color"
                                  value={
                                    editingAlias.fgColor ||
                                    activeType?.fgColor ||
                                    "#f1f5f9"
                                  }
                                  onChange={(e) =>
                                    setEditingAlias({
                                      ...editingAlias,
                                      fgColor: e.target.value,
                                    })
                                  }
                                  title="Foreground color"
                                  style={{
                                    width: 28,
                                    height: 26,
                                    border: "1px solid #334155",
                                    borderRadius: 3,
                                    cursor: "pointer",
                                    background: "transparent",
                                    flexShrink: 0,
                                  }}
                                />
                                <ButtonIcon
                                  name="refresh"
                                  label="Reset to parent type colors"
                                  size="sm"
                                  onClick={() =>
                                    setEditingAlias({
                                      ...editingAlias,
                                      bgColor: activeType?.bgColor || "#334155",
                                      fgColor: activeType?.fgColor || "#f1f5f9",
                                    })
                                  }
                                />
                                <Tooltip text="Visible" placement="top">
                                  <div>
                                    <DynamicInput
                                      input={{ id: "visible", label: "", type: "toggle" }}
                                      value={editingAlias.visible !== false}
                                      onChange={(_, v) =>
                                        setEditingAlias({
                                          ...editingAlias,
                                          visible: v,
                                        })
                                      }
                                    />
                                  </div>
                                </Tooltip>
                                <ButtonIcon
                                  name="check"
                                  label="Save"
                                  size="sm"
                                  onClick={() =>
                                    handleUpdateAlias(alias, {
                                      singularName: editingAlias.singularName,
                                      pluralName: editingAlias.pluralName,
                                      blurb: editingAlias.blurb,
                                      bgColor: editingAlias.bgColor,
                                      fgColor: editingAlias.fgColor,
                                      visible: editingAlias.visible,
                                    })
                                  }
                                />
                                <ButtonIcon
                                  name="close"
                                  label="Cancel"
                                  size="sm"
                                  onClick={() => setEditingAlias(null)}
                                />
                              </div>
                            ) : (
                              <>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, color: "#e2e8f0" }}>
                                    {alias.pluralName}{" "}
                                    <span style={{ color: "#64748b" }}>
                                      / {alias.singularName}
                                    </span>
                                  </div>
                                  {alias.blurb && (
                                    <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {alias.blurb}
                                    </div>
                                  )}
                                </div>
                                {canEdit && (
                                  <>
                                    <span
                                      style={{
                                        fontSize: 11,
                                        padding: "2px 8px",
                                        borderRadius: 4,
                                        background:
                                          alias.bgColor ||
                                          activeType?.bgColor ||
                                          "#334155",
                                        color:
                                          alias.fgColor ||
                                          activeType?.fgColor ||
                                          "#f1f5f9",
                                        flexShrink: 0,
                                      }}
                                    >
                                      {alias.singularName}
                                    </span>
                                    <ButtonIcon
                                      name={alias.visible === false ? "eye-off" : "eye"}
                                      label={alias.visible === false ? "Make visible" : "Make invisible"}
                                      size="sm"
                                      onClick={() =>
                                        handleUpdateAlias(alias, { visible: alias.visible === false })
                                      }
                                    />
                                    <ButtonIcon
                                      name="edit"
                                      label="Edit alias"
                                      size="sm"
                                      onClick={() =>
                                        setEditingAlias({ ...alias })
                                      }
                                    />
                                    <ButtonIcon
                                      name="trash"
                                      label="Delete alias"
                                      subvariant="danger"
                                      size="sm"
                                      onClick={() =>
                                        handleDeleteAlias(alias.id)
                                      }
                                    />
                                  </>
                                )}
                                {!canEdit && (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      padding: "2px 8px",
                                      borderRadius: 4,
                                      background:
                                        alias.bgColor ||
                                        activeType?.bgColor ||
                                        "#334155",
                                      color:
                                        alias.fgColor ||
                                        activeType?.fgColor ||
                                        "#f1f5f9",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {alias.singularName}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Fields tab ── */}
                  {activeTab === "fields" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#f1f5f9",
                          }}
                        >
                          Fields
                        </span>
                        {canEdit && (
                          <ButtonIcon
                            name="plus"
                            label="New field"
                            onClick={() => {
                              setFieldValues({ name: "", fieldType: "text" });
                              setShowCreateField(true);
                            }}
                          />
                        )}
                      </div>
                      {fields.length === 0 && (
                        <div style={{ color: "#64748b", fontSize: 13 }}>
                          No fields yet
                        </div>
                      )}
                      {[...fields].sort((a, b) => a.name.localeCompare(b.name)).map((field) => (
                        <div
                          key={field.id}
                          style={{
                            background: "#1e293b",
                            borderRadius: 8,
                            padding: "10px 12px 0",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                flex: 1,
                                fontSize: 13,
                                color: "#e2e8f0",
                                fontWeight: 500,
                              }}
                            >
                              {field.name}
                              {field.required && (
                                <span
                                  style={{ color: "#f87171", marginLeft: 3 }}
                                >
                                  *
                                </span>
                              )}
                            </span>
                            {field.required && (
                              <span style={{ fontSize: 11, color: "#fca5a5", background: "#450a0a", padding: "2px 7px", borderRadius: 4 }}>
                                Required
                              </span>
                            )}
                            {(field.aliasIds?.length ?? 0) > 0 && (
                              <span style={{ fontSize: 11, color: "#93c5fd", background: "#172554", padding: "2px 7px", borderRadius: 4 }}>
                                Restricted
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: 11,
                                color: "#94a3b8",
                                background: "#0f172a",
                                padding: "2px 7px",
                                borderRadius: 4,
                              }}
                            >
                              {FIELD_TYPE_LABELS[field.fieldType] ||
                                field.fieldType}
                            </span>
                            {canEdit && (
                              <ButtonIcon
                                name="edit"
                                label="Edit field"
                                size="sm"
                                onClick={() => openEditField(field)}
                              />
                            )}
                            {canEdit && (
                              <ButtonIcon
                                name="trash"
                                label="Delete field"
                                subvariant="danger"
                                size="sm"
                                onClick={() => handleDeleteField(field.id)}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Form tab ── */}
                  {activeTab === "form" && (
                    <div
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        padding: "16px 24px 24px 24px",
                      }}
                    >
                      {fields.length === 0 ? (
                        <div style={{ color: "#64748b", fontSize: 13 }}>
                          Add fields in the Fields tab first.
                        </div>
                      ) : (
                        <FormEditor
                          layout={activeType.formLayout || emptyFormLayout}
                          fields={formEditorFields}
                          aliases={formEditorAliases}
                          onChange={canEdit ? handleFormLayoutChange : () => {}}
                          getDefaultInputDef={
                            canEdit
                              ? (fieldBadge) => {
                                  if (fieldBadge.fieldType === "picklist") {
                                    const actualField = fields.find(
                                      (f) => f.id === fieldBadge.id,
                                    );
                                    return {
                                      type: actualField?.config?.multiselect
                                        ? "badge-multiselect"
                                        : "select",
                                    };
                                  }
                                  const typeMap: Record<
                                    string,
                                    SerializedInputDef["type"]
                                  > = {
                                    text: "text",
                                    rich_text: "richtext",
                                    toggle: "toggle",
                                    number: "number",
                                  };
                                  const t = typeMap[fieldBadge.fieldType];
                                  return t ? { type: t } : undefined;
                                }
                              : undefined
                          }
                        />
                      )}
                    </div>
                  )}

                  {/* ── Related tab ── */}
                  {activeTab === "related" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#f1f5f9",
                          }}
                        >
                          Related Entry Sections
                        </span>
                        {canEdit && (
                          <ButtonIcon
                            name="plus"
                            label="Add related section"
                            onClick={() => {
                              setNewRelSecName("");
                              setShowCreateRelSec(true);
                            }}
                          />
                        )}
                      </div>
                      {sections.length === 0 && (
                        <div style={{ color: "#64748b", fontSize: 13 }}>
                          No related sections yet
                        </div>
                      )}
                      {[...sections].sort((a, b) => a.name.localeCompare(b.name)).map((sec) => (
                        <div
                          key={sec.id}
                          style={{
                            background: "#1e293b",
                            borderRadius: 8,
                            padding: "10px 12px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 8,
                            }}
                          >
                            {canEdit && renamingRelSecId === sec.id ? (
                              <>
                                <input
                                  autoFocus
                                  value={relSecRenameValue}
                                  onChange={(e) => setRelSecRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleRenameRelatedSection(sec.id, relSecRenameValue);
                                    if (e.key === "Escape") setRenamingRelSecId(null);
                                  }}
                                  style={{ flex: 1, fontSize: 13, fontWeight: 600, background: "#0f172a", border: "1px solid #3b82f6", borderRadius: 5, padding: "2px 7px", color: "#f1f5f9", outline: "none" }}
                                />
                                <ButtonIcon name="check" label="Save name" size="sm" onClick={() => handleRenameRelatedSection(sec.id, relSecRenameValue)} />
                                <ButtonIcon name="close" label="Cancel" size="sm" onClick={() => setRenamingRelSecId(null)} />
                              </>
                            ) : (
                              <>
                                <span
                                  style={{
                                    flex: 1,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "#f1f5f9",
                                  }}
                                >
                                  {sec.name}
                                </span>
                                {canEdit && (
                                  <ButtonIcon
                                    name="edit"
                                    label="Rename section"
                                    size="sm"
                                    onClick={() => { setRenamingRelSecId(sec.id); setRelSecRenameValue(sec.name); }}
                                  />
                                )}
                              </>
                            )}
                            {canEdit && renamingRelSecId !== sec.id && (
                              <ButtonIcon
                                name="trash"
                                label="Delete section"
                                subvariant="danger"
                                size="sm"
                                onClick={() => handleDeleteRelatedSection(sec)}
                              />
                            )}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }}
                          >
                            {[...(relatedBySec[sec.id] || [])].sort((a, b) => {
                                const tn = a.entryTypeName.localeCompare(b.entryTypeName);
                                return tn !== 0 ? tn : a.fieldName.localeCompare(b.fieldName);
                              }).map((item) => (
                              <div
                                key={item.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "4px 8px",
                                  background: "#0f172a",
                                  borderRadius: 6,
                                }}
                              >
                                <span
                                  style={{
                                    flex: 1,
                                    fontSize: 12,
                                    color: "#e2e8f0",
                                  }}
                                >
                                  {item.entryTypeName}{" "}
                                  <span style={{ color: "#64748b" }}>via</span>{" "}
                                  {item.fieldName}
                                </span>
                                {canEdit && (
                                  <ButtonIcon
                                    name="trash"
                                    label="Remove pairing"
                                    subvariant="danger"
                                    size="sm"
                                    onClick={() =>
                                      handleRemoveRelated(sec.id, item.id)
                                    }
                                  />
                                )}
                              </div>
                            ))}
                            {canEdit && (
                              <button
                                onClick={() => {
                                  setRelatedSecId(sec.id);
                                  setRelatedTypeId("");
                                  setRelatedFieldId("");
                                  setRelatedTypeFields([]);
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "4px 8px",
                                  background: "transparent",
                                  border: "1px dashed #334155",
                                  borderRadius: 5,
                                  color: "#64748b",
                                  fontSize: 12,
                                  cursor: "pointer",
                                  transition: "all 0.12s",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = "#3b82f6";
                                  e.currentTarget.style.color = "#93c5fd";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = "#334155";
                                  e.currentTarget.style.color = "#64748b";
                                }}
                              >
                                <Icon name="plus" size={12} /> Add Entry Type
                                Pairing
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Modals ── */}

      {showCreateType && (
        <Modal
          header={
            <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
              New Entry Type
            </span>
          }
          closeable
          onClose={() => setShowCreateType(false)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowCreateType(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreateType}>
                Create
              </Button>
            </>
          }
          maxWidth={480}
        >
          <div
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <DynamicInput
                input={{
                  id: "singularName",
                  label: "Singular Name",
                  type: "text",
                  required: true,
                  placeholder: "Character",
                }}
                value={typeValues.singularName}
                onChange={(id, v) => setTypeValues((p) => ({ ...p, [id]: v }))}
              />
              <DynamicInput
                input={{
                  id: "pluralName",
                  label: "Plural Name",
                  type: "text",
                  required: true,
                  placeholder: "Characters",
                }}
                value={typeValues.pluralName}
                onChange={(id, v) => setTypeValues((p) => ({ ...p, [id]: v }))}
              />
            </div>
            <DynamicInput
              input={{
                id: "blurb",
                label: "Description",
                type: "text",
                placeholder: "What is this entry type?",
              }}
              value={typeValues.blurb}
              onChange={(id, v) => setTypeValues((p) => ({ ...p, [id]: v }))}
            />
            <ImageUpload
              label="Icon"
              value={createTypeIcon}
              onChange={setCreateTypeIcon}
            />
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                Parent Entry Type (optional)
              </div>
              <select
                value={typeValues.parentTypeId}
                onChange={(e) =>
                  setTypeValues((p) => ({ ...p, parentTypeId: e.target.value }))
                }
                style={{
                  width: "100%",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "6px 10px",
                  color: "#f1f5f9",
                  fontSize: 13,
                  outline: "none",
                }}
              >
                <option value="">None</option>
                {entryTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {getTypePath(t.id)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}
                >
                  Badge Background
                </div>
                <input
                  type="color"
                  value={typeValues.bgColor}
                  onChange={(e) =>
                    setTypeValues((p) => ({ ...p, bgColor: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    height: 32,
                    borderRadius: 6,
                    border: "1px solid #334155",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}
                >
                  Badge Foreground
                </div>
                <input
                  type="color"
                  value={typeValues.fgColor}
                  onChange={(e) =>
                    setTypeValues((p) => ({ ...p, fgColor: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    height: 32,
                    borderRadius: 6,
                    border: "1px solid #334155",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}
                >
                  Preview
                </div>
                <span
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 4,
                    background: typeValues.bgColor,
                    color: typeValues.fgColor,
                  }}
                >
                  {typeValues.singularName || "Example"}
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {showCreateAlias && (
        <Modal
          header={
            <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
              New Alias
            </span>
          }
          closeable
          onClose={() => setShowCreateAlias(false)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowCreateAlias(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateAlias}
                disabled={
                  !aliasValues.singularName.trim() ||
                  !aliasValues.pluralName.trim()
                }
              >
                Create
              </Button>
            </>
          }
          maxWidth={400}
        >
          <div
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <DynamicInput
              input={{
                id: "singularName",
                label: "Singular Name",
                type: "text",
                required: true,
                placeholder: "e.g. Human",
              }}
              value={aliasValues.singularName}
              onChange={(id, v) => setAliasValues((p) => ({ ...p, [id]: v }))}
            />
            <DynamicInput
              input={{
                id: "pluralName",
                label: "Plural Name",
                type: "text",
                required: true,
                placeholder: "e.g. Humans",
              }}
              value={aliasValues.pluralName}
              onChange={(id, v) => setAliasValues((p) => ({ ...p, [id]: v }))}
            />
            <DynamicInput
              input={{
                id: "blurb",
                label: "Summary",
                type: "text",
                placeholder: "Brief description of this alias…",
              }}
              value={aliasValues.blurb}
              onChange={(id, v) => setAliasValues((p) => ({ ...p, [id]: v }))}
            />
            <DynamicInput
              input={{
                id: "visible",
                label: "Visible",
                type: "toggle",
                tooltip: "When off, this alias will not appear in the entry type navigation menu.",
              }}
              value={aliasValues.visible}
              onChange={(_, v) => setAliasValues((p) => ({ ...p, visible: v }))}
            />
            <div style={{ display: "flex", gap: 12, alignItems: "end" }}>
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}
                >
                  Badge Background
                </div>
                <input
                  type="color"
                  value={aliasValues.bgColor}
                  onChange={(e) =>
                    setAliasValues((p) => ({ ...p, bgColor: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    height: 32,
                    borderRadius: 6,
                    border: "1px solid #334155",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}
                >
                  Badge Foreground
                </div>
                <input
                  type="color"
                  value={aliasValues.fgColor}
                  onChange={(e) =>
                    setAliasValues((p) => ({ ...p, fgColor: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    height: 32,
                    borderRadius: 6,
                    border: "1px solid #334155",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}
                >
                  Preview
                </div>
                <span
                  style={{
                    fontSize: 12,
                    padding: "3px 10px",
                    borderRadius: 4,
                    background: aliasValues.bgColor,
                    color: aliasValues.fgColor,
                  }}
                >
                  {aliasValues.singularName || "Example"}
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {showCreateField && (
        <Modal
          header={
            <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
              New Field
            </span>
          }
          closeable
          onClose={() => setShowCreateField(false)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowCreateField(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateField}
                disabled={!fieldValues.name?.trim()}
              >
                Create
              </Button>
            </>
          }
          maxWidth={480}
        >
          <div
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <DynamicInput
              input={{
                id: "name",
                label: "Field Name",
                type: "text",
                required: true,
                placeholder: "Hair Color",
              }}
              value={fieldValues.name}
              onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))}
            />
            <DynamicInput
              input={{
                id: "tooltip",
                label: "Tooltip (optional)",
                type: "text",
                placeholder: "Help text shown to users when filling in this field",
              }}
              value={fieldValues.tooltip ?? ""}
              onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "end",
              }}
            >
              <DynamicInput
                input={{
                  id: "fieldType",
                  label: "Field Type",
                  type: "select",
                  options: FIELD_TYPES.map((t) => ({
                    value: t,
                    label: FIELD_TYPE_LABELS[t],
                  })),
                }}
                value={fieldValues.fieldType}
                onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))}
              />
              <DynamicInput
                input={{ id: "required", label: "Required", type: "toggle" }}
                value={!!fieldValues.required}
                onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))}
              />
            </div>
            {aliases.length > 0 && (
              <DynamicInput
                input={{
                  id: "aliasIds",
                  label: "Restrict to aliases (optional)",
                  type: "badge-multiselect",
                  tooltip: "Leave empty to show for all aliases. Select one or more to restrict visibility.",
                  options: [...aliases].sort((a, b) => a.pluralName.localeCompare(b.pluralName)).map((a) => ({
                    value: a.id,
                    label: a.pluralName,
                    selectedColor: a.bgColor || "#334155",
                    fgColor: a.fgColor || "#f1f5f9",
                  })),
                }}
                value={fieldValues.aliasIds || []}
                onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))}
              />
            )}
            {fieldValues.fieldType === "picklist" && (
              <>
                <DynamicInput
                  input={{
                    id: "multiselect",
                    label: "Allow multiple selections",
                    type: "toggle",
                  }}
                  value={fieldValues.multiselect}
                  onChange={(id, v) =>
                    setFieldValues((p) => ({ ...p, [id]: v }))
                  }
                />
                <DynamicInput
                  input={{
                    id: "allowCustom",
                    label: "Allow user-defined custom values",
                    type: "toggle",
                  }}
                  value={fieldValues.allowCustom}
                  onChange={(id, v) =>
                    setFieldValues((p) => ({ ...p, [id]: v }))
                  }
                />
                <PicklistOptionsEditor
                  values={fieldValues.options || []}
                  usedValues={new Set()}
                  onChange={(opts) =>
                    setFieldValues((p) => ({ ...p, options: opts }))
                  }
                />
              </>
            )}
            {fieldValues.fieldType === "number" && (
              <>
                <DynamicInput
                  input={{
                    id: "decimals",
                    label: "Decimal Places",
                    type: "number",
                    min: "0",
                    max: "10",
                  }}
                  value={fieldValues.decimals ?? 0}
                  onChange={(id, v) =>
                    setFieldValues((p) => ({ ...p, [id]: v }))
                  }
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <DynamicInput
                    input={{
                      id: "min",
                      label: "Min (optional)",
                      type: "number",
                    }}
                    value={fieldValues.min ?? ""}
                    onChange={(id, v) =>
                      setFieldValues((p) => ({ ...p, [id]: v }))
                    }
                  />
                  <DynamicInput
                    input={{
                      id: "max",
                      label: "Max (optional)",
                      type: "number",
                    }}
                    value={fieldValues.max ?? ""}
                    onChange={(id, v) =>
                      setFieldValues((p) => ({ ...p, [id]: v }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
                  <DynamicInput
                    input={{ id: "unit", label: "Unit (optional)", type: "text", placeholder: 'e.g. "cards" or "$"' }}
                    value={fieldValues.unit ?? ""}
                    onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))}
                  />
                  <div>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6, fontWeight: 500 }}>Position</div>
                    <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #334155" }}>
                      {(["prefix", "suffix"] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setFieldValues((p) => ({ ...p, unitPosition: pos }))}
                          style={{
                            padding: "6px 12px", border: "none", cursor: "pointer", fontSize: 12,
                            background: (fieldValues.unitPosition || "suffix") === pos ? "#1e3a5f" : "transparent",
                            color: (fieldValues.unitPosition || "suffix") === pos ? "#e2e8f0" : "#64748b",
                            fontWeight: (fieldValues.unitPosition || "suffix") === pos ? 600 : 400,
                          }}
                        >{pos}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {fieldValues.fieldType === "lookup" && (
              <>
                <DynamicInput
                  input={{
                    id: "lookupMultiselect",
                    label: "Allow multiple values",
                    type: "toggle",
                  }}
                  value={fieldValues.lookupMultiselect}
                  onChange={(id, v) =>
                    setFieldValues((p) => ({ ...p, [id]: v }))
                  }
                />
                <DynamicInput
                  input={{
                    id: "targetTypeIds",
                    label: "Target Entry Types",
                    type: "badge-multiselect",
                    options: [...entryTypes]
                      .sort((a, b) => a.pluralName.localeCompare(b.pluralName))
                      .map((t) => ({
                        value: t.id,
                        label: t.pluralName,
                        selectedColor: t.bgColor || "#3b82f6",
                        fgColor: t.fgColor || "#fff",
                      })),
                  }}
                  value={fieldValues.targetTypeIds || []}
                  onChange={async (id, v) => {
                    setFieldValues((p) => ({ ...p, [id]: v, targetAliasIds: [] }));
                    const typeIds: string[] = v || [];
                    if (typeIds.length === 0) { setLookupTargetAliasOptions([]); return; }
                    const results: EntryTypeAlias[] = [];
                    await Promise.all(typeIds.map(async (tid) => {
                      try {
                        const r = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${tid}/aliases`);
                        if (r.ok) results.push(...((await r.json()).aliases || []));
                      } catch {}
                    }));
                    setLookupTargetAliasOptions(results.sort((a, b) => a.pluralName.localeCompare(b.pluralName)));
                  }}
                />
                {lookupTargetAliasOptions.length > 0 && (
                  <DynamicInput
                    input={{
                      id: "targetAliasIds",
                      label: "Restrict to subaliases (optional)",
                      type: "badge-multiselect",
                      tooltip: "Leave empty to allow any subalias. Select one or more to limit this field to records with those subtypes.",
                      options: [
                        { value: "__none__", label: "No subtypes", selectedColor: "#475569", fgColor: "#f1f5f9" },
                        ...lookupTargetAliasOptions.map((a) => ({
                          value: a.id,
                          label: a.pluralName,
                          selectedColor: a.bgColor || "#334155",
                          fgColor: a.fgColor || "#f1f5f9",
                        })),
                      ],
                    }}
                    value={fieldValues.targetAliasIds || []}
                    onChange={(id, v) => setFieldValues((p) => ({ ...p, [id]: v }))}
                  />
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <DynamicInput
                    input={{
                      id: "aToB",
                      label: "This record's label",
                      type: "text",
                      placeholder: "e.g. father",
                      tooltip:
                        'Label shown on this record when it points to a linked record (e.g. "father")',
                    }}
                    value={fieldValues.aToB ?? ""}
                    onChange={(id, v) =>
                      setFieldValues((p) => ({ ...p, [id]: v }))
                    }
                  />
                  <DynamicInput
                    input={{
                      id: "bToA",
                      label: "Linked record's label",
                      type: "text",
                      placeholder: "e.g. son",
                      tooltip:
                        'Label shown on the linked record when it appears in a related section (e.g. "son")',
                    }}
                    value={fieldValues.bToA ?? ""}
                    onChange={(id, v) =>
                      setFieldValues((p) => ({ ...p, [id]: v }))
                    }
                  />
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {editingField && (
        <Modal
          header={
            <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
              Edit Field: {editingField.name}
            </span>
          }
          closeable
          onClose={() => setEditingField(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditingField(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveField}>
                Save
              </Button>
            </>
          }
          maxWidth={480}
        >
          <div
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <DynamicInput
              input={{
                id: "required",
                label: "Required",
                type: "toggle",
                tooltip:
                  "Entry records cannot be saved without a value for this field",
              }}
              value={!!editFieldValues.required}
              onChange={(id, v) =>
                setEditFieldValues((p) => ({ ...p, [id]: v }))
              }
            />
            <DynamicInput
              input={{
                id: "tooltip",
                label: "Tooltip (optional)",
                type: "text",
                placeholder: "Help text shown to users when filling in this field",
              }}
              value={editFieldValues.tooltip ?? ""}
              onChange={(id, v) => setEditFieldValues((p) => ({ ...p, [id]: v }))}
            />
            {aliases.length > 0 && (
              <DynamicInput
                input={{
                  id: "aliasIds",
                  label: "Restrict to aliases (optional)",
                  type: "badge-multiselect",
                  tooltip: "Leave empty to show for all aliases. Select one or more to restrict visibility.",
                  options: [...aliases].sort((a, b) => a.pluralName.localeCompare(b.pluralName)).map((a) => ({
                    value: a.id,
                    label: a.pluralName,
                    selectedColor: a.bgColor || "#334155",
                    fgColor: a.fgColor || "#f1f5f9",
                  })),
                }}
                value={editFieldValues.aliasIds || []}
                onChange={(id, v) => setEditFieldValues((p) => ({ ...p, [id]: v }))}
              />
            )}
            {editingField.fieldType === "picklist" && (
              <>
                <DynamicInput
                  input={{
                    id: "multiselect",
                    label: "Allow multiple selections",
                    type: "toggle",
                  }}
                  value={editFieldValues.multiselect}
                  onChange={(id, v) =>
                    setEditFieldValues((p) => ({ ...p, [id]: v }))
                  }
                />
                <DynamicInput
                  input={{
                    id: "allowCustom",
                    label: "Allow user-defined custom values",
                    type: "toggle",
                  }}
                  value={editFieldValues.allowCustom}
                  onChange={(id, v) =>
                    setEditFieldValues((p) => ({ ...p, [id]: v }))
                  }
                />
                <PicklistOptionsEditor
                  values={editFieldValues.options || []}
                  usedValues={usedPicklistValues}
                  onChange={(opts) =>
                    setEditFieldValues((p) => ({ ...p, options: opts }))
                  }
                />
              </>
            )}
            {editingField.fieldType === "number" && (
              <>
                <DynamicInput
                  input={{ id: "decimals", label: "Decimal Places", type: "number", min: "0", max: "10" }}
                  value={editFieldValues.decimals ?? 0}
                  onChange={(id, v) => setEditFieldValues((p) => ({ ...p, [id]: v }))}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <DynamicInput
                    input={{ id: "min", label: "Min (optional)", type: "number" }}
                    value={editFieldValues.min ?? ""}
                    onChange={(id, v) => setEditFieldValues((p) => ({ ...p, [id]: v }))}
                  />
                  <DynamicInput
                    input={{ id: "max", label: "Max (optional)", type: "number" }}
                    value={editFieldValues.max ?? ""}
                    onChange={(id, v) => setEditFieldValues((p) => ({ ...p, [id]: v }))}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
                  <DynamicInput
                    input={{ id: "unit", label: "Unit (optional)", type: "text", placeholder: 'e.g. "cards" or "$"' }}
                    value={editFieldValues.unit ?? ""}
                    onChange={(id, v) => setEditFieldValues((p) => ({ ...p, [id]: v }))}
                  />
                  <div>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6, fontWeight: 500 }}>Position</div>
                    <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #334155" }}>
                      {(["prefix", "suffix"] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setEditFieldValues((p) => ({ ...p, unitPosition: pos }))}
                          style={{
                            padding: "6px 12px", border: "none", cursor: "pointer", fontSize: 12,
                            background: (editFieldValues.unitPosition || "suffix") === pos ? "#1e3a5f" : "transparent",
                            color: (editFieldValues.unitPosition || "suffix") === pos ? "#e2e8f0" : "#64748b",
                            fontWeight: (editFieldValues.unitPosition || "suffix") === pos ? 600 : 400,
                          }}
                        >{pos}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {editingField.fieldType === "lookup" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <DynamicInput
                    input={{ id: "aToB", label: "This record's label", type: "text", placeholder: "e.g. father" }}
                    value={editFieldValues.aToB ?? ""}
                    onChange={(id, v) => setEditFieldValues((p) => ({ ...p, [id]: v }))}
                  />
                  <DynamicInput
                    input={{ id: "bToA", label: "Linked record's label", type: "text", placeholder: "e.g. son" }}
                    value={editFieldValues.bToA ?? ""}
                    onChange={(id, v) => setEditFieldValues((p) => ({ ...p, [id]: v }))}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6, fontWeight: 500 }}>Target Entry Types</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {((editingField.config as any)?.targetEntryTypeIds || []).length === 0
                      ? <span style={{ fontSize: 12, color: "#475569" }}>Any</span>
                      : ((editingField.config as any)?.targetEntryTypeIds || []).map((tid: string) => {
                          const t = entryTypes.find((e) => e.id === tid);
                          return t ? (
                            <span key={tid} style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, background: t.bgColor || "#334155", color: t.fgColor || "#f1f5f9" }}>{t.pluralName}</span>
                          ) : null;
                        })}
                  </div>
                </div>
                {((editingField.config as any)?.targetAliasIds?.length ?? 0) > 0 && (
                  <div>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6, fontWeight: 500 }}>Restricted to Subaliases</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {((editingField.config as any).targetAliasIds as string[]).map((aid: string) => {
                        if (aid === "__none__") {
                          return (
                            <span key={aid} style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, background: "#475569", color: "#f1f5f9" }}>
                              No subtypes
                            </span>
                          );
                        }
                        const found = editingFieldTargetAliases.find((a) => a.id === aid);
                        return (
                          <span key={aid} style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, background: found?.bgColor || "#334155", color: found?.fgColor || "#f1f5f9" }}>
                            {found?.pluralName || aid}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>Allow multiple values:</span>
                  <span style={{ fontSize: 13, color: "#f1f5f9" }}>{(editingField.config as any)?.multiselect ? "Yes" : "No"}</span>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {showCreateRelSec && (
        <Modal
          header={
            <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
              New Related Section
            </span>
          }
          closeable
          onClose={() => setShowCreateRelSec(false)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowCreateRelSec(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateRelatedSection}
                disabled={!newRelSecName.trim()}
              >
                Create
              </Button>
            </>
          }
          maxWidth={380}
        >
          <div style={{ padding: 16 }}>
            <DynamicInput
              input={{
                id: "name",
                label: "Section Name",
                type: "text",
                required: true,
                placeholder: "Related Characters",
              }}
              value={newRelSecName}
              onChange={(_, v) => setNewRelSecName(v)}
            />
          </div>
        </Modal>
      )}

      {relatedSecId && (
        <Modal
          header={
            <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
              Add Related Entry Type
            </span>
          }
          closeable
          onClose={() => setRelatedSecId(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRelatedSecId(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleAddRelated(relatedSecId)}
                disabled={!relatedTypeId || !relatedFieldId}
              >
                Add
              </Button>
            </>
          }
          maxWidth={420}
        >
          <div
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                Entry Type with Lookup
              </div>
              <select
                value={relatedTypeId}
                onChange={async (e) => {
                  setRelatedTypeId(e.target.value);
                  setRelatedFieldId("");
                  if (e.target.value) {
                    const allFieldsRes = await fetch(
                      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${e.target.value}/fields`,
                    );
                    const lookupFields: EntryField[] = [];
                    if (allFieldsRes.ok) {
                      const { fields: allFields } = await allFieldsRes.json();
                      lookupFields.push(
                        ...allFields.filter(
                          (f: any) =>
                            f.fieldType === "lookup" &&
                            (f.config?.targetEntryTypeIds || []).includes(
                              activeTypeId!,
                            ),
                        ),
                      );
                    }
                    setRelatedTypeFields(lookupFields);
                  } else setRelatedTypeFields([]);
                }}
                style={{
                  width: "100%",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "7px 10px",
                  color: "#f1f5f9",
                  fontSize: 13,
                  outline: "none",
                }}
              >
                <option value="">Select entry type…</option>
                {[...entryTypes]
                  .sort((a, b) => a.pluralName.localeCompare(b.pluralName))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.pluralName}
                      {t.id === activeTypeId ? " (self)" : ""}
                    </option>
                  ))}
              </select>
            </div>
            {relatedTypeId && (
              <div>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}
                >
                  Lookup Field targeting "{activeType?.singularName}"
                </div>
                <select
                  value={relatedFieldId}
                  onChange={(e) => setRelatedFieldId(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    padding: "7px 10px",
                    color: "#f1f5f9",
                    fontSize: 13,
                    outline: "none",
                  }}
                >
                  <option value="">Select field…</option>
                  {relatedTypeFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {relatedTypeFields.length === 0 && (
                  <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 6 }}>
                    No lookup fields target "{activeType?.singularName}" in this
                    entry type.
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
          message={`Delete "${deleteTypeTarget.pluralName}" and all its fields, sections, and records?`}
          confirmText="Delete"
          danger
          onConfirm={handleDeleteType}
          onCancel={() => setDeleteTypeTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function removeFieldFromLayout(
  layout: FormLayout,
  fieldId: string,
): FormLayout {
  return {
    ...layout,
    sections: layout.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) => ({
        ...r,
        columns: r.columns.map((c) =>
          c.fieldId === fieldId ? { ...c, fieldId: null } : c,
        ),
      })),
    })),
  };
}

function InlineEdit({
  label,
  value,
  onSave,
  multiline,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#e2e8f0",
            padding: "5px 8px",
            background: "#1e293b",
            borderRadius: 6,
            cursor: "text",
            minHeight: 28,
          }}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          {value || <span style={{ color: "#64748b" }}>Click to edit</span>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              background: "#1e293b",
              border: "1px solid #3b82f6",
              borderRadius: 6,
              padding: "5px 8px",
              color: "#f1f5f9",
              fontSize: 13,
              outline: "none",
              resize: "vertical",
              minHeight: 60,
            }}
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSave(draft);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            style={{
              flex: 1,
              background: "#1e293b",
              border: "1px solid #3b82f6",
              borderRadius: 6,
              padding: "5px 8px",
              color: "#f1f5f9",
              fontSize: 13,
              outline: "none",
            }}
          />
        )}
        <ButtonIcon
          name="check"
          label="Save"
          size="sm"
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
        />
        <ButtonIcon
          name="close"
          label="Cancel"
          size="sm"
          onClick={() => setEditing(false)}
        />
      </div>
    </div>
  );
}

function PicklistOptionsEditor({
  values,
  usedValues = new Set(),
  onChange,
}: {
  values: Array<{ value: string; label: string }>;
  usedValues?: Set<string>;
  onChange: (opts: Array<{ value: string; label: string }>) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const addOption = () => {
    if (!newLabel.trim()) return;
    const base =
      newLabel
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "option";
    const existing = new Set(values.map((o) => o.value));
    let value = base;
    let n = 2;
    while (existing.has(value)) value = `${base}_${n++}`;
    const sorted = [...values, { value, label: newLabel.trim() }]
      .sort((a, b) => a.label.localeCompare(b.label));
    onChange(sorted);
    setNewLabel("");
  };

  const saveEdit = (i: number) => {
    if (!editingLabel.trim()) return;
    const updated = values.map((o, j) =>
      j === i ? { ...o, label: editingLabel.trim() } : o,
    ).sort((a, b) => a.label.localeCompare(b.label));
    onChange(updated);
    setEditingIdx(null);
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
        Options
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          marginBottom: 8,
        }}
      >
        {values.map((opt, i) => (
          <div
            key={opt.value}
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              padding: "3px 6px",
              background: "#0f172a",
              borderRadius: 4,
            }}
          >
            {editingIdx === i ? (
              <>
                <input
                  value={editingLabel}
                  onChange={(e) => setEditingLabel(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(i);
                    if (e.key === "Escape") setEditingIdx(null);
                  }}
                  style={{
                    flex: 1,
                    background: "#1e293b",
                    border: "1px solid #3b82f6",
                    borderRadius: 4,
                    padding: "3px 6px",
                    color: "#f1f5f9",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <ButtonIcon
                  name="check"
                  label="Save"
                  size="sm"
                  onClick={() => saveEdit(i)}
                />
                <ButtonIcon
                  name="close"
                  label="Cancel"
                  size="sm"
                  onClick={() => setEditingIdx(null)}
                />
              </>
            ) : (
              <>
                <span style={{ fontSize: 12, color: "#e2e8f0", flex: 1 }}>
                  {opt.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "#475569",
                    fontFamily: "monospace",
                  }}
                >
                  {opt.value}
                </span>
                <ButtonIcon
                  name="edit"
                  label="Edit label"
                  size="sm"
                  onClick={() => {
                    setEditingIdx(i);
                    setEditingLabel(opt.label);
                  }}
                />
                {!usedValues.has(opt.value) && (
                  <ButtonIcon
                    name="trash"
                    label="Remove"
                    size="sm"
                    subvariant="danger"
                    onClick={() => onChange(values.filter((_, j) => j !== i))}
                  />
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          placeholder="New option label"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addOption();
          }}
          style={{
            flex: 1,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 4,
            padding: "4px 6px",
            color: "#f1f5f9",
            fontSize: 12,
            outline: "none",
          }}
        />
        <ButtonIcon
          name="plus"
          label="Add option"
          size="sm"
          onClick={addOption}
        />
      </div>
    </div>
  );
}
