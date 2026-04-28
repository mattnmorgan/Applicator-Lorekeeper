"use client";

import { useState, useEffect } from "react";
import {
  Modal,
  Button,
  ButtonIcon,
  Icon,
  Spinner,
  ImageUpload,
  SearchableCombobox,
  DynamicInput,
  RichTextEditor,
} from "@applicator/sdk/components";
import NewAliasForm, { type NewAliasValues } from "./NewAliasForm";
import { SinglePicklistInput, MultiPicklistInput, resolvePicklistValue } from "./PicklistInput";

// ─── Shared types ─────────────────────────────────────────────────────────────

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  bgColor: string;
  fgColor: string;
  allowAliasCreation?: boolean;
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

interface FormLayoutSection {
  id: string;
  aliasIds: string[];
  rows: Array<{ id: string; columns: Array<{ id: string; fieldId?: string }> }>;
}

interface TargetAlias {
  id: string;
  singularName: string;
  pluralName?: string;
  bgColor?: string;
  fgColor?: string;
  visible?: boolean;
}

interface PendingRecord {
  recordId: string;
  recordName: string;
  recordTypeId: string;
  recordHasIcon: boolean;
}

export interface CreatedRecord {
  id: string;
  name: string;
  hasIcon: boolean;
  entryTypeId: string;
  aliasId?: string;
}

// ─── DeferredLookupEditor ─────────────────────────────────────────────────────
// Manages lookup field selections locally (no record ID yet). Supports nested
// CreateEntryModal for creating linked entries on the fly.

function DeferredLookupEditor({
  field,
  lorebookId,
  entryTypes,
  pending,
  preloadedAliasMap,
  onAdd,
  onRemove,
  addToast,
}: {
  field: EntryField;
  lorebookId: string;
  entryTypes: EntryType[];
  pending: PendingRecord[];
  preloadedAliasMap?: Record<string, { singularName: string; bgColor?: string; fgColor?: string }>;
  onAdd: (record: PendingRecord) => void;
  onRemove: (recordId: string) => void;
  addToast: (message: string, type?: "success" | "error") => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [createTypeId, setCreateTypeId] = useState<string | null>(null);

  const targetIds: string[] = field.config?.targetEntryTypeIds || [];
  const pendingIds = new Set(pending.map((p) => p.recordId));
  const canAddMore = field.config?.multiselect !== false || pending.length === 0;

  const aliasMap = preloadedAliasMap ?? {};

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const controller = new AbortController();
    const targetAliasIds: string[] = Array.isArray(field.config?.targetAliasIds)
      ? field.config.targetAliasIds
      : [];
    const namedAliasIds = targetAliasIds.filter((id) => id !== "__none__");
    const t = setTimeout(async () => {
      const seen = new Set<string>();
      const all: any[] = [];
      for (const typeId of targetIds) {
        try {
          const et = entryTypes.find((t) => t.id === typeId);
          const aliasQueries: Array<string | null> =
            targetAliasIds.length === 0
              ? [null]
              : [
                  ...namedAliasIds,
                  "__none__", // always include records with no alias assigned
                ];
          for (const aliasQuery of aliasQueries) {
            const qs = new URLSearchParams({ search });
            if (aliasQuery && aliasQuery !== "__none__") qs.set("aliasId", aliasQuery);
            const res = await fetch(
              `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${typeId}/records?${qs}`,
              { signal: controller.signal },
            );
            if (!res.ok) continue;
            const data = await res.json();
            for (const r of data.records || []) {
              if (seen.has(r.id) || pendingIds.has(r.id)) continue;
              if (aliasQuery === "__none__" && r.aliasId) continue;
              seen.add(r.id);
              all.push({ ...r, entryTypeId: typeId, entryType: et });
            }
          }
        } catch {}
      }
      setResults(all.sort((a: any, b: any) => a.name.localeCompare(b.name)));
    }, 200);
    return () => { clearTimeout(t); controller.abort(); };
  }, [search, pending.length]);

  const handleSelect = (r: any) => {
    onAdd({ recordId: r.id, recordName: r.name, recordTypeId: r.entryTypeId, recordHasIcon: !!r.hasIcon });
    setSearch(""); setResults([]); setOpen(false);
  };

  const showDropdown = open && (results.length > 0 || targetIds.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {pending.map((p) => {
        const et = entryTypes.find((t) => t.id === p.recordTypeId);
        return (
          <div
            key={p.recordId}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", borderRadius: 6, padding: "4px 8px" }}
          >
            {p.recordHasIcon ? (
              <img
                src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${p.recordTypeId}/records/${p.recordId}/icon`}
                style={{ width: 20, height: 20, borderRadius: 3, objectFit: "cover", flexShrink: 0 }}
                alt=""
              />
            ) : et ? (
              <span
                style={{ width: 20, height: 20, borderRadius: 3, background: et.bgColor || "#334155", color: et.fgColor || "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 600 }}
              >
                {et.singularName[0]}
              </span>
            ) : null}
            <span style={{ fontSize: 13, color: "#e2e8f0", flex: 1 }}>{p.recordName}</span>
            <ButtonIcon name="close" label="Remove" size="sm" onClick={() => onRemove(p.recordId)} />
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
          {showDropdown && (
            <div
              style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: "#1e293b", border: "1px solid #334155", borderRadius: 6, maxHeight: 220, overflowY: "auto", marginTop: 2 }}
            >
              {results.map((r) => {
                const et = r.entryType as EntryType | undefined;
                return (
                  <div
                    key={r.id}
                    onMouseDown={() => handleSelect(r)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#0f172a")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {r.hasIcon ? (
                      <img
                        src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${r.entryTypeId}/records/${r.id}/icon`}
                        style={{ width: 20, height: 20, borderRadius: 3, objectFit: "cover", flexShrink: 0 }}
                        alt=""
                      />
                    ) : et ? (
                      <span style={{ width: 20, height: 20, borderRadius: 3, background: et.bgColor || "#334155", color: et.fgColor || "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 600 }}>
                        {et.singularName[0]}
                      </span>
                    ) : null}
                    <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0" }}>{r.name}</span>
                    {(() => {
                      const alias = r.aliasId ? aliasMap[r.aliasId] : undefined;
                      const label = alias ? alias.singularName : et?.singularName;
                      const bg = alias ? alias.bgColor || "#334155" : et?.bgColor || "#334155";
                      const fg = alias ? alias.fgColor || "#fff" : et?.fgColor || "#fff";
                      return label ? (
                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: bg, color: fg }}>{label}</span>
                      ) : null;
                    })()}
                  </div>
                );
              })}
              {results.length > 0 && (
                <div style={{ borderTop: "1px solid #334155", margin: "2px 0" }} />
              )}
              {targetIds.map((typeId) => {
                const et = entryTypes.find((t) => t.id === typeId);
                if (!et) return null;
                return (
                  <div
                    key={`create-${typeId}`}
                    onMouseDown={() => { setCreateTypeId(typeId); setOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", cursor: "pointer", color: "#94a3b8", fontSize: 13 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#0f172a"; e.currentTarget.style.color = "#f1f5f9"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
                  >
                    <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                      <Icon name="plus" size={14} />
                    </span>
                    <span>Create new {et.singularName}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {createTypeId && (
        <CreateEntryModal
          lorebookId={lorebookId}
          entryTypeId={createTypeId}
          entryTypes={entryTypes}
          allowedAliasIds={field.config?.targetAliasIds || []}
          initialName={search.trim()}
          addToast={addToast}
          onCreated={(record) => {
            onAdd({
              recordId: record.id,
              recordName: record.name,
              recordTypeId: record.entryTypeId,
              recordHasIcon: record.hasIcon,
            });
            setCreateTypeId(null);
            setSearch("");
          }}
          onClose={() => setCreateTypeId(null)}
        />
      )}
    </div>
  );
}

// ─── CreateEntryModal ──────────────────────────────────────────────────────────

interface Props {
  lorebookId: string;
  entryTypeId: string;
  entryTypes: EntryType[];
  /**
   * Restrict which aliases can be selected. Empty = all aliases allowed.
   * May contain "__none__" as a sentinel meaning "no alias" is a valid choice.
   */
  allowedAliasIds?: string[];
  /** Pre-select and lock the alias (selector is hidden). */
  fixedAliasId?: string;
  initialName?: string;
  addToast: (message: string, type?: "success" | "error") => void;
  onCreated: (record: CreatedRecord) => void;
  onAliasCreated?: (typeId: string, alias: TargetAlias) => void;
  onClose: () => void;
}

export default function CreateEntryModal({
  lorebookId,
  entryTypeId,
  entryTypes,
  allowedAliasIds,
  fixedAliasId,
  initialName,
  addToast,
  onCreated,
  onAliasCreated,
  onClose,
}: Props) {
  const [aliases, setAliases] = useState<TargetAlias[]>([]);
  const [aliasMap, setAliasMap] = useState<Record<string, { singularName: string; bgColor?: string; fgColor?: string }>>({});
  const [fields, setFields] = useState<EntryField[]>([]);
  const [formLayoutSections, setFormLayoutSections] = useState<FormLayoutSection[] | null>(null);
  const [loadingFields, setLoadingFields] = useState(true);
  const [values, setValues] = useState({
    name: initialName || "",
    blurb: "",
    iconData: "",
    aliasId: fixedAliasId || "",
  });
  const [fieldData, setFieldData] = useState<Record<string, any>>({});
  const [pendingLookups, setPendingLookups] = useState<Record<string, PendingRecord[]>>({});
  const [creating, setCreating] = useState(false);
  const [showNewAliasForm, setShowNewAliasForm] = useState(false);
  const [savingAlias, setSavingAlias] = useState(false);

  const entryType = entryTypes.find((t) => t.id === entryTypeId);

  const handleSaveNewAlias = async (newValues: NewAliasValues) => {
    setSavingAlias(true);
    try {
      const res = await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/aliases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newValues),
        },
      );
      if (res.ok) {
        const alias = await res.json();
        const newAlias: TargetAlias = {
          id: alias.id,
          singularName: alias.singularName,
          pluralName: alias.pluralName,
          bgColor: alias.bgColor,
          fgColor: alias.fgColor,
          visible: alias.visible,
        };
        setAliases((prev) =>
          [...prev, newAlias].sort((a, b) =>
            (a.pluralName || "").localeCompare(b.pluralName || ""),
          ),
        );
        setValues((p) => ({ ...p, aliasId: alias.id }));
        setShowNewAliasForm(false);
        onAliasCreated?.(entryTypeId, newAlias);
      } else {
        addToast("Failed to create alias", "error");
      }
    } catch {
      addToast("Failed to create alias", "error");
    }
    setSavingAlias(false);
  };

  // Load fields, form layout, and all needed aliases in one pass.
  // Aliases for lookup target types are fetched together with the main type's
  // aliases so that only one bulk aliases call is needed per modal open.
  useEffect(() => {
    const fetchData = async () => {
      setLoadingFields(true);
      try {
        const [fieldsRes, layoutRes] = await Promise.all([
          fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/fields`),
          fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/form-layout`),
        ]);

        const loadedFields: EntryField[] = fieldsRes.ok ? (await fieldsRes.json()).fields || [] : [];
        setFields(loadedFields);

        if (layoutRes.ok) {
          const data = await layoutRes.json();
          setFormLayoutSections(data.formLayout?.sections ?? null);
        }

        // Collect all type IDs that need aliases: the main type + all lookup targets
        const lookupTypeIds = loadedFields
          .filter((f) => f.fieldType === "lookup")
          .flatMap((f) => (f.config?.targetEntryTypeIds as string[]) || []);
        const allTypeIds = [...new Set([entryTypeId, ...lookupTypeIds])];

        const qs = new URLSearchParams({ typeIds: allTypeIds.join(",") });
        const aliasRes = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/aliases?${qs}`);
        if (aliasRes.ok) {
          const { byTypeId } = await aliasRes.json();

          // Main type aliases → subtype selector
          let mainAliases: TargetAlias[] = byTypeId[entryTypeId] || [];
          if (allowedAliasIds && allowedAliasIds.length > 0) {
            const realIds = allowedAliasIds.filter((id) => id !== "__none__");
            mainAliases = realIds.length > 0 ? mainAliases.filter((a) => realIds.includes(a.id)) : [];
          }
          setAliases(mainAliases);

          // Flatten all aliases into a map keyed by alias ID for lookup display
          const map: Record<string, { singularName: string; bgColor?: string; fgColor?: string }> = {};
          for (const typeAliases of Object.values(byTypeId) as any[][]) {
            for (const a of typeAliases) {
              map[a.id] = { singularName: a.singularName, bgColor: a.bgColor, fgColor: a.fgColor };
            }
          }
          setAliasMap(map);
        }
      } catch {}
      setLoadingFields(false);
    };
    fetchData();
  }, [lorebookId, entryTypeId, (allowedAliasIds || []).join(",")]);

  const activeAliasId = values.aliasId;

  // Compute which field IDs are visible, mirroring FormViewer's aliasIds logic.
  // If no form layout exists, fall back to field-level aliasIds only.
  const visibleFieldIds: Set<string> | null = (() => {
    if (formLayoutSections === null) return null; // no layout loaded yet or none exists
    const visible = new Set<string>();
    for (const sec of formLayoutSections) {
      // Section-level aliasIds filter (matches FormViewer exactly)
      if (sec.aliasIds.length > 0) {
        if (!activeAliasId) {
          if (!sec.aliasIds.includes("__no_alias__")) continue;
        } else {
          if (!sec.aliasIds.filter((id: string) => id !== "__no_alias__").includes(activeAliasId)) continue;
        }
      }
      // Section visible — collect fields that pass field-level aliasIds filter
      for (const row of sec.rows) {
        for (const col of row.columns) {
          if (!col.fieldId) continue;
          const field = fields.find((f) => f.id === col.fieldId);
          if (!field) continue;
          if (field.aliasIds && field.aliasIds.length > 0) {
            if (!activeAliasId) {
              if (!field.aliasIds.includes("__no_alias__")) continue;
            } else {
              if (!field.aliasIds.filter((id: string) => id !== "__no_alias__").includes(activeAliasId)) continue;
            }
          }
          visible.add(col.fieldId);
        }
      }
    }
    return visible;
  })();

  const visibleFields = fields
    .filter((f) => {
      if (visibleFieldIds !== null) return visibleFieldIds.has(f.id);
      // No form layout: apply field-level aliasIds allowlist only
      if (!f.aliasIds || f.aliasIds.length === 0) return true;
      const otherIds = f.aliasIds.filter((id) => id !== "__no_alias__");
      if (!activeAliasId) return f.aliasIds.includes("__no_alias__") || otherIds.length === 0;
      return otherIds.includes(activeAliasId);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleCustomPicklistOption = async (field: EntryField, computedValue: string, label: string) => {
    const existing: Array<{ value: string; label: string }> = field.config?.options || [];
    if (existing.some((o) => o.value === computedValue)) return;
    const updatedOptions = [...existing, { value: computedValue, label }];
    const updatedConfig = { ...field.config, options: updatedOptions };
    setFields((prev) =>
      prev.map((f) => f.id === field.id ? { ...f, config: updatedConfig } : f),
    );
    await fetch(
      `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/fields/${field.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: updatedConfig }),
      },
    );
  };

  const setFieldValue = (fieldId: string, value: any) => {
    setFieldData((p) => ({ ...p, [fieldId]: value }));
  };

  const renderField = (field: EntryField) => {
    const value = fieldData[field.id];
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
      return (
        <RichTextEditor
          value={value || ""}
          onChange={(v) => setFieldValue(field.id, v)}
          minHeight={80}
        />
      );
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
      const unit = cfg.unit as string | undefined;
      const unitPos = (cfg.unitPosition as string) || "suffix";
      const input = (
        <DynamicInput
          input={{
            id: field.id,
            label: "",
            type: "number",
            min: cfg.min != null ? String(cfg.min) : undefined,
            max: cfg.max != null ? String(cfg.max) : undefined,
            step: cfg.decimals ? String(Math.pow(10, -cfg.decimals)) : "1",
            decimalPlaces: cfg.decimals ?? 0,
          }}
          value={value ?? ""}
          onChange={(_, v) => setFieldValue(field.id, v === "" ? null : Number(v))}
        />
      );
      if (!unit) return input;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {unitPos === "prefix" && (
            <span style={{ fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap" }}>{unit}</span>
          )}
          {input}
          {unitPos !== "prefix" && (
            <span style={{ fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap" }}>{unit}</span>
          )}
        </div>
      );
    }
    if (field.fieldType === "picklist") {
      const opts = [...(cfg.options || [])].sort((a: any, b: any) =>
        a.label.localeCompare(b.label),
      );
      if (cfg.multiselect) {
        if (cfg.allowCustom) {
          return (
            <MultiPicklistInput
              options={opts}
              value={Array.isArray(value) ? value : value ? [value] : []}
              onChange={(v) => setFieldValue(field.id, v)}
              resolveCustomValue={(label) => resolvePicklistValue(label, new Set(opts.map((o) => o.value)))}
              onCustomAdded={(computed, label) => handleCustomPicklistOption(field, computed, label)}
            />
          );
        }
        return (
          <DynamicInput
            input={{ id: field.id, label: "", type: "badge-multiselect", options: opts }}
            value={Array.isArray(value) ? value : value ? [value] : []}
            onChange={(_, v) => setFieldValue(field.id, v)}
          />
        );
      }
      if (cfg.allowCustom) {
        return (
          <SinglePicklistInput
            options={opts}
            value={value || ""}
            onChange={(v) => setFieldValue(field.id, v)}
            resolveCustomValue={(label) => resolvePicklistValue(label, new Set(opts.map((o) => o.value)))}
            onCustomAdded={(computed, label) => handleCustomPicklistOption(field, computed, label)}
          />
        );
      }
      return (
        <DynamicInput
          input={{ id: field.id, label: "", type: "select", options: opts }}
          value={value || ""}
          onChange={(_, v) => setFieldValue(field.id, v)}
        />
      );
    }
    if (field.fieldType === "date") {
      return (
        <DynamicInput
          input={{ id: field.id, label: "", type: "date" }}
          value={value || ""}
          onChange={(_, v) => setFieldValue(field.id, v)}
        />
      );
    }
    if (field.fieldType === "datetime") {
      return (
        <DynamicInput
          input={{ id: field.id, label: "", type: "datetime" }}
          value={value || ""}
          onChange={(_, v) => setFieldValue(field.id, v)}
        />
      );
    }
    if (field.fieldType === "color") {
      return (
        <DynamicInput
          input={{ id: field.id, label: "", type: "color" }}
          value={value || "#3b82f6"}
          onChange={(_, v) => setFieldValue(field.id, v)}
        />
      );
    }
    if (field.fieldType === "range") {
      const min = cfg.min ?? 0;
      const max = cfg.max ?? 100;
      const step = cfg.step ?? 1;
      const numVal = value !== null && value !== undefined && value !== "" ? Number(value) : min;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={numVal}
            onChange={(e) => setFieldValue(field.id, Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 13, color: "#e2e8f0", minWidth: 32, textAlign: "right" }}>
            {numVal}
          </span>
        </div>
      );
    }
    if (field.fieldType === "lookup") {
      const fieldPending = pendingLookups[field.id] || [];
      return (
        <DeferredLookupEditor
          field={field}
          lorebookId={lorebookId}
          entryTypes={entryTypes}
          pending={fieldPending}
          preloadedAliasMap={aliasMap}
          addToast={addToast}
          onAdd={(record) =>
            setPendingLookups((p) => ({
              ...p,
              [field.id]: [...(p[field.id] || []), record],
            }))
          }
          onRemove={(recordId) =>
            setPendingLookups((p) => ({
              ...p,
              [field.id]: (p[field.id] || []).filter((r) => r.recordId !== recordId),
            }))
          }
        />
      );
    }
    return null;
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!values.name.trim()) errs.push("Name");
    for (const field of visibleFields) {
      if (!field.required) continue;
      if (field.fieldType === "toggle") continue;
      if (field.fieldType === "lookup") {
        if ((pendingLookups[field.id] || []).length === 0) errs.push(field.name);
      } else {
        const val = fieldData[field.id];
        if (val === undefined || val === null || val === "") errs.push(field.name);
        else if (Array.isArray(val) && val.length === 0) errs.push(field.name);
      }
    }
    return errs;
  };

  const handleCreate = async () => {
    const errs = validate();
    if (errs.length > 0) {
      addToast(`Required fields missing: ${errs.join(", ")}`, "error");
      return;
    }
    setCreating(true);
    try {
      const body: any = {
        name: values.name.trim(),
        blurb: values.blurb || "",
        fieldData: { ...fieldData },
      };
      if (values.aliasId) body.aliasId = values.aliasId;

      const res = await fetch(
        `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/records`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (!res.ok) { setCreating(false); return; }
      const newRecord = await res.json();

      if (values.iconData) {
        await fetch(
          `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/records/${newRecord.id}/icon`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ iconData: values.iconData }),
          },
        );
      }

      // Create all deferred lookup relationships
      for (const [fieldId, records] of Object.entries(pendingLookups)) {
        const f = fields.find((x) => x.id === fieldId);
        for (const target of records) {
          await fetch(
            `/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${entryTypeId}/records/${newRecord.id}/lookups`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customFieldId: fieldId,
                record2: target.recordId,
                aToB: f?.config?.aToB || "",
                bToA: f?.config?.bToA || "",
              }),
            },
          );
        }
      }

      onCreated({
        id: newRecord.id,
        name: newRecord.name,
        hasIcon: !!values.iconData,
        entryTypeId,
        aliasId: values.aliasId || undefined,
      });
      onClose();
    } catch {}
    setCreating(false);
  };

  const showAliasSelector = !fixedAliasId && aliases.length > 0;

  return (
    <Modal
      header={
        <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
          New {entryType?.singularName || "Entry"}
        </span>
      }
      closeable
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreate} disabled={creating}>
            {creating ? "Creating…" : "Create"}
          </Button>
        </>
      }
      maxWidth={520}
    >
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Icon + name + summary */}
        <div style={{ display: "flex", gap: 12 }}>
          <ImageUpload
            label="Icon (optional)"
            value={values.iconData || null}
            onChange={(v) => setValues((p) => ({ ...p, iconData: v || "" }))}
            previewSize={64}
            previewRadius={8}
          />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                Name <span style={{ color: "#ef4444" }}>*</span>
              </div>
              <input
                autoFocus
                value={values.name}
                onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter" && !creating) handleCreate(); }}
                placeholder={`${entryType?.singularName || "Entry"} name…`}
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#f1f5f9", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Summary</div>
              <input
                value={values.blurb}
                onChange={(e) => setValues((p) => ({ ...p, blurb: e.target.value }))}
                placeholder="Brief description…"
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#f1f5f9", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>
        </div>

        {/* Alias / subtype selector */}
        {showAliasSelector && !showNewAliasForm && (
          <div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Subtype (optional)</div>
            <SearchableCombobox<TargetAlias>
              items={[{ id: "", singularName: "None" }, ...aliases]}
              selectedItems={[{ id: "", singularName: "None" }, ...aliases].filter(
                (a) => a.id === values.aliasId,
              )}
              onSelectionChange={(items) =>
                setValues((p) => ({ ...p, aliasId: items[0]?.id || "" }))
              }
              getItemKey={(a) => a.id || "__none__"}
              renderItem={(a) => <span>{a.singularName}</span>}
              filterItem={(a, term) =>
                a.singularName.toLowerCase().includes(term.toLowerCase())
              }
              placeholder="No subtype…"
            />
          </div>
        )}

        {/* Inline new alias creation */}
        {!fixedAliasId && entryType?.allowAliasCreation && !showNewAliasForm && (
          <button
            type="button"
            onClick={() => setShowNewAliasForm(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
              fontSize: 12,
              padding: "2px 0",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#94a3b8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
          >
            <Icon name="plus" size={13} />
            Create new alias…
          </button>
        )}
        {showNewAliasForm && (
          <NewAliasForm
            defaultBgColor={entryType?.bgColor || "#1e293b"}
            defaultFgColor={entryType?.fgColor || "#94a3b8"}
            onSave={handleSaveNewAlias}
            onCancel={() => setShowNewAliasForm(false)}
            saving={savingAlias}
          />
        )}

        {/* Dynamic fields for the selected entry type / alias */}
        {loadingFields ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
            <Spinner />
          </div>
        ) : visibleFields.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              borderTop: "1px solid #1e293b",
              paddingTop: 12,
            }}
          >
            {visibleFields.map((field) => (
              <div key={field.id}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {field.name}
                  {field.required && <span style={{ color: "#ef4444" }}>*</span>}
                </div>
                {renderField(field)}
              </div>
            ))}
          </div>
        ) : null}

      </div>
    </Modal>
  );
}
