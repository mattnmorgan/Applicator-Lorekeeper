import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../lib/permissions";

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

    // First pass: create all entry types (resolve parent refs after)
    const nameToId: Record<string, string> = {};
    const createdTypes: any[] = [];

    for (const et of body.entryTypes) {
      const record = await rm("entry_type").createRecord(etTable, {
        lorebookId: params.lorebookId,
        singularName: et.singularName,
        pluralName: et.pluralName,
        icon: et.icon || "file",
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

    // Second pass: create sections, fields, and related list items
    for (const { record: typeRecord, source } of createdTypes) {
      if (!source.sections) continue;
      const fieldNameToId: Record<string, Record<string, string>> = {};

      for (const sec of source.sections) {
        const secRecord = await rm("entry_section").createRecord(secTable, {
          lorebookId: params.lorebookId,
          entryTypeId: typeRecord.id,
          name: sec.name,
          sectionType: sec.sectionType,
          sortOrder: sec.sortOrder ?? 0,
        });

        fieldNameToId[sec.name] = {};

        if (sec.fields) {
          for (const field of sec.fields) {
            const fieldRecord = await rm("entry_field").createRecord(fieldTable, {
              lorebookId: params.lorebookId,
              entryTypeId: typeRecord.id,
              sectionId: secRecord.id,
              name: field.name,
              fieldType: field.fieldType,
              config: field.config || {},
              sortOrder: field.sortOrder ?? 0,
            });
            fieldNameToId[sec.name][field.name] = fieldRecord.id;
          }
        }

        if (sec.sectionType === "related_list" && sec.relatedItems) {
          for (const ri of sec.relatedItems) {
            const refTypeId = nameToId[ri.entryTypeName];
            if (!refTypeId) continue;
            // Find the field by name in the referenced entry type's sections
            // (field IDs not yet available for cross-type lookups — deferred to a second pass below)
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

    return NextResponse.json({ success: true, importedTypes: createdTypes.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
