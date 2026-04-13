import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../lib/permissions";
import { lorebookIconPath, entryTypeIconPath, saveIconFromDataUrl } from "../../../../../lib/iconStorage";

function remapFormLayout(
  layout: any,
  aliasIdMap: Record<string, string>,
  fieldIdMap: Record<string, string>
): any {
  if (!layout?.sections) return layout;
  return {
    ...layout,
    sections: layout.sections.map((sec: any) => ({
      ...sec,
      aliasIds: (sec.aliasIds || []).map((id: string) => aliasIdMap[id] ?? id),
      rows: (sec.rows || []).map((row: any) => ({
        ...row,
        columns: (row.columns || []).map((col: any) => ({
          ...col,
          fieldId: col.fieldId ? (fieldIdMap[col.fieldId] ?? col.fieldId) : col.fieldId,
        })),
      })),
    })),
  };
}

export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();

    if (body.version !== 2) {
      return NextResponse.json(
        { error: "Unsupported export format. Please re-export the lorebook to get an up-to-date file." },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.entryTypes)) {
      return NextResponse.json({ error: "Invalid import data: entryTypes missing" }, { status: 400 });
    }

    const rm = (t: string) => context.recordManager("lorekeeper", t);
    const etTable    = await rm("entry_type").getTable();
    const aliasTable = await rm("entry_type_alias").getTable();
    const secTable   = await rm("entry_section").getTable();
    const fieldTable = await rm("entry_field").getTable();
    const relTable   = await rm("related_list_item").getTable();

    // ID remapping maps — exported original ID → newly created ID.
    // All four maps must be fully populated before any cross-type reference is used.
    const typeIdMap:    Record<string, string> = {};
    const aliasIdMap:   Record<string, string> = {};
    const sectionIdMap: Record<string, string> = {};
    const fieldIdMap:   Record<string, string> = {};

    // Track created types for later passes
    const createdTypes: Array<{ newId: string; source: any }> = [];

    // Pass 1: Create all entry types (no parent or formLayout yet)
    for (const et of body.entryTypes) {
      const record = await rm("entry_type").createRecord(etTable, {
        lorebookId: params.lorebookId,
        singularName: et.singularName,
        pluralName: et.pluralName,
        icon: et.sdkIcon || "file",
        blurb: et.blurb || "",
        parentTypeId: "",
        bgColor: et.bgColor || "#334155",
        fgColor: et.fgColor || "#f1f5f9",
        sortOrder: et.sortOrder ?? 0,
        isGroup: et.isGroup || false,
        allowAliasCreation: et.allowAliasCreation || false,
      });
      if (et.id) typeIdMap[et.id] = record.id;
      createdTypes.push({ newId: record.id, source: et });
    }

    // Pass 2: Resolve parent type references (all types exist now)
    for (const { newId, source } of createdTypes) {
      if (source.parentTypeId && typeIdMap[source.parentTypeId]) {
        await rm("entry_type").updateRecord(etTable, newId, {
          parentTypeId: typeIdMap[source.parentTypeId],
        });
      }
    }

    // Pass 3: Create ALL aliases across all types before any fields are created.
    // Fields and formLayouts can reference aliases from other entry types, so
    // aliasIdMap must be complete before passes 4–7.
    for (const { newId: typeNewId, source } of createdTypes) {
      for (const alias of source.aliases ?? []) {
        if (!alias.singularName?.trim() || !alias.pluralName?.trim()) continue;
        const record = await rm("entry_type_alias").createRecord(aliasTable, {
          lorebookId: params.lorebookId,
          entryTypeId: typeNewId,
          singularName: alias.singularName.trim(),
          pluralName: alias.pluralName.trim(),
          bgColor: alias.bgColor || "#1e293b",
          fgColor: alias.fgColor || "#94a3b8",
          blurb: alias.blurb || "",
          visible: alias.visible !== false,
        });
        if (alias.id) aliasIdMap[alias.id] = record.id;
      }
    }

    // Pass 4: Create ALL sections across all types.
    // Section config.aliasIds are remapped using the now-complete aliasIdMap.
    for (const { newId: typeNewId, source } of createdTypes) {
      const sorted = [...(source.sections ?? [])].sort(
        (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      );
      for (const sec of sorted) {
        const remappedConfig = sec.config
          ? { ...sec.config, aliasIds: (sec.config.aliasIds ?? []).map((id: string) => aliasIdMap[id] ?? id) }
          : null;
        const record = await rm("entry_section").createRecord(secTable, {
          lorebookId: params.lorebookId,
          entryTypeId: typeNewId,
          name: sec.name,
          sectionType: sec.sectionType,
          sortOrder: sec.sortOrder ?? 0,
          config: remappedConfig,
        });
        if (sec.id) sectionIdMap[sec.id] = record.id;
      }
    }

    // Pass 5: Create ALL fields across all types.
    // Each field's sectionId is remapped via sectionIdMap.
    // field.aliasIds and lookup config IDs are remapped via aliasIdMap / typeIdMap.
    for (const { newId: typeNewId, source } of createdTypes) {
      const sorted = [...(source.fields ?? [])].sort(
        (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      );
      for (const field of sorted) {
        let config = { ...(field.config ?? {}) };

        if (field.fieldType === "lookup") {
          if (Array.isArray(config.targetEntryTypeIds)) {
            config.targetEntryTypeIds = config.targetEntryTypeIds.map(
              (id: string) => typeIdMap[id] ?? id
            );
          }
          if (Array.isArray(config.targetAliasIds)) {
            config.targetAliasIds = config.targetAliasIds.map(
              (id: string) => aliasIdMap[id] ?? id
            );
          }
        }

        const record = await rm("entry_field").createRecord(fieldTable, {
          lorebookId: params.lorebookId,
          entryTypeId: typeNewId,
          sectionId: field.sectionId ? (sectionIdMap[field.sectionId] ?? "") : "",
          name: field.name,
          fieldType: field.fieldType,
          config,
          aliasIds: (field.aliasIds ?? []).map((id: string) => aliasIdMap[id] ?? id),
          required: field.required ?? false,
          tooltip: field.tooltip ?? "",
          sortOrder: field.sortOrder ?? 0,
        });
        if (field.id) fieldIdMap[field.id] = record.id;
      }
    }

    // Pass 6: Create related list items (all maps are now complete)
    for (const { source } of createdTypes) {
      for (const sec of source.sections ?? []) {
        if (sec.sectionType !== "related_list") continue;
        const newSecId = sectionIdMap[sec.id];
        if (!newSecId) continue;
        for (const ri of sec.relatedItems ?? []) {
          const newTypeId  = typeIdMap[ri.entryTypeId];
          const newFieldId = fieldIdMap[ri.fieldId];
          if (!newTypeId || !newFieldId) continue;
          await rm("related_list_item").createRecord(relTable, {
            lorebookId: params.lorebookId,
            sectionId: newSecId,
            entryTypeId: newTypeId,
            fieldId: newFieldId,
          });
        }
      }
    }

    // Pass 7: Apply form layouts (aliasIdMap and fieldIdMap are both fully populated)
    for (const { newId, source } of createdTypes) {
      if (!source.formLayout) continue;
      const remapped = remapFormLayout(source.formLayout, aliasIdMap, fieldIdMap);
      await rm("entry_type").updateRecord(etTable, newId, { formLayout: remapped });
    }

    // Restore lorebook icon (field name "lorebook.icon" in v2, fallbacks for old formats)
    const lorebookIconData = body.lorebook?.icon || body.icon || body.lorebookIconBase64;
    if (lorebookIconData) {
      try {
        await saveIconFromDataUrl(
          context.appFileManager,
          lorebookIconPath(params.lorebookId),
          lorebookIconData
        );
        const lbTable = await rm("lorebook").getTable();
        await rm("lorebook").updateRecord(lbTable, params.lorebookId, { hasIcon: true });
      } catch {}
    }

    // Restore entry type icons
    for (const { newId, source } of createdTypes) {
      const iconData = source.icon?.startsWith("data:") ? source.icon : null;
      if (iconData) {
        try {
          await saveIconFromDataUrl(
            context.appFileManager,
            entryTypeIconPath(params.lorebookId, newId),
            iconData
          );
          await rm("entry_type").updateRecord(etTable, newId, { hasIcon: true });
        } catch {}
      }
    }

    return NextResponse.json({ success: true, importedTypes: createdTypes.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
