import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../lib/permissions";
import { lorebookIconPath, entryTypeIconPath, saveIconFromDataUrl } from "../../../../../lib/iconStorage";

export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    if (!body.entryTypes || !Array.isArray(body.entryTypes)) {
      return NextResponse.json({ error: "Invalid import data" }, { status: 400 });
    }

    const rm = (t: string) => context.recordManager("lorekeeper", t);
    const etTable = await rm("entry_type").getTable();
    const secTable = await rm("entry_section").getTable();
    const fieldTable = await rm("entry_field").getTable();
    const relTable = await rm("related_list_item").getTable();
    const aliasTable = await rm("entry_type_alias").getTable();

    // First pass: create all entry types (resolve parent refs after)
    const nameToId: Record<string, string> = {};
    const createdTypes: any[] = [];

    for (const et of body.entryTypes) {
      const record = await rm("entry_type").createRecord(etTable, {
        lorebookId: params.lorebookId,
        singularName: et.singularName,
        pluralName: et.pluralName,
        // sdkIcon is the new field name; fall back to old "icon" if it's not image data
        icon: et.sdkIcon || (et.icon && !et.icon.startsWith("data:") ? et.icon : null) || "file",
        blurb: et.blurb || "",
        parentTypeId: "",
        bgColor: et.bgColor || "#334155",
        fgColor: et.fgColor || "#f1f5f9",
        sortOrder: et.sortOrder ?? 0,
      });
      nameToId[et.singularName] = record.id;
      createdTypes.push({ record, source: et });
    }

    // Resolve parent references
    for (const { record, source } of createdTypes) {
      if (source.parentTypeName && nameToId[source.parentTypeName]) {
        await rm("entry_type").updateRecord(etTable, record.id, {
          parentTypeId: nameToId[source.parentTypeName],
        });
      }
    }

    // Second pass: create sections, fields, and aliases per type
    for (const { record: typeRecord, source } of createdTypes) {
      // Create aliases
      if (Array.isArray(source.aliases)) {
        for (const alias of source.aliases) {
          if (!alias.singularName?.trim() || !alias.pluralName?.trim()) continue;
          await rm("entry_type_alias").createRecord(aliasTable, {
            lorebookId: params.lorebookId,
            entryTypeId: typeRecord.id,
            singularName: alias.singularName.trim(),
            pluralName: alias.pluralName.trim(),
            bgColor: alias.bgColor || "#1e293b",
            fgColor: alias.fgColor || "#94a3b8",
          });
        }
      }

      if (!source.sections) continue;

      for (const sec of source.sections) {
        const secRecord = await rm("entry_section").createRecord(secTable, {
          lorebookId: params.lorebookId,
          entryTypeId: typeRecord.id,
          name: sec.name,
          sectionType: sec.sectionType,
          sortOrder: sec.sortOrder ?? 0,
        });

        if (sec.fields) {
          for (const field of sec.fields) {
            let config = field.config || {};

            // Resolve lookup targetEntryTypeNames → IDs
            if (field.fieldType === "lookup" && Array.isArray(config.targetEntryTypeNames)) {
              const resolvedIds = config.targetEntryTypeNames
                .map((name: string) => nameToId[name])
                .filter(Boolean);
              config = {
                ...config,
                targetEntryTypeIds: resolvedIds,
                targetEntryTypeNames: undefined,
              };
              delete config.targetEntryTypeNames;
            }

            await rm("entry_field").createRecord(fieldTable, {
              lorebookId: params.lorebookId,
              entryTypeId: typeRecord.id,
              sectionId: secRecord.id,
              name: field.name,
              fieldType: field.fieldType,
              config,
              sortOrder: field.sortOrder ?? 0,
            });
          }
        }
      }
    }

    // Third pass: resolve related list items (need all field IDs)
    for (const { record: typeRecord, source } of createdTypes) {
      if (!source.sections) continue;
      for (const sec of source.sections) {
        if (sec.sectionType !== "related_list" || !sec.relatedItems) continue;

        // Find the created section record
        const secResult = await rm("entry_section").readRecords({
          filters: [
            { field: "lorebookId", operator: "=", value: params.lorebookId },
            { field: "entryTypeId", operator: "=", value: typeRecord.id },
            { field: "name", operator: "=", value: sec.name },
          ],
          condition: "1 AND 2 AND 3",
          limit: 1,
        });
        if (secResult.records.length === 0) continue;
        const secId = secResult.records[0].id;

        for (const ri of sec.relatedItems) {
          const refTypeId = nameToId[ri.entryTypeName];
          if (!refTypeId) continue;

          // Find the field in the referenced type by name
          const fieldResult = await rm("entry_field").readRecords({
            filters: [
              { field: "lorebookId", operator: "=", value: params.lorebookId },
              { field: "entryTypeId", operator: "=", value: refTypeId },
              { field: "name", operator: "=", value: ri.fieldName },
            ],
            condition: "1 AND 2 AND 3",
            limit: 1,
          });
          if (fieldResult.records.length === 0) continue;

          await rm("related_list_item").createRecord(relTable, {
            lorebookId: params.lorebookId,
            sectionId: secId,
            entryTypeId: refTypeId,
            fieldId: fieldResult.records[0].id,
          });
        }
      }
    }

    // Restore lorebook icon — accepts new field name "icon" or old "lorebookIconBase64"
    const lorebookIconData = body.icon || body.lorebookIconBase64;
    if (lorebookIconData) {
      try {
        const iconPath = lorebookIconPath(params.lorebookId);
        await saveIconFromDataUrl(context.appFileManager, iconPath, lorebookIconData);
        const lorebooks = context.recordManager("lorekeeper", "lorebook");
        const lorebookTable = await lorebooks.getTable();
        await lorebooks.updateRecord(lorebookTable, params.lorebookId, { hasIcon: true });
      } catch {}
    }

    // Restore entry type icons — accepts new field "icon" (data URL) or old "iconBase64"
    for (const { record: typeRecord, source } of createdTypes) {
      const iconData = (source.icon && source.icon.startsWith("data:")) ? source.icon : source.iconBase64;
      if (iconData) {
        try {
          const iconPath = entryTypeIconPath(params.lorebookId, typeRecord.id);
          await saveIconFromDataUrl(context.appFileManager, iconPath, iconData);
          const table = await rm("entry_type").getTable();
          await rm("entry_type").updateRecord(table, typeRecord.id, { hasIcon: true });
        } catch {}
      }
    }

    return NextResponse.json({ success: true, importedTypes: createdTypes.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
