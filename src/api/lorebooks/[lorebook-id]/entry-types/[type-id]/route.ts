import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../lib/permissions";
import { entryTypeIconPath, recordIconPath, deleteIconFile } from "../../../../../lib/iconStorage";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const types = context.recordManager("lorekeeper", "entry_type");
    const record = await types.readRecord(params.typeId);
    if (!record || record.data.lorebookId !== params.lorebookId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ id: record.id, ...record.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const types = context.recordManager("lorekeeper", "entry_type");
    const record = await types.readRecord(params.typeId);
    if (!record || record.data.lorebookId !== params.lorebookId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const allowed = ["singularName", "pluralName", "icon", "blurb", "parentTypeId", "bgColor", "fgColor", "sortOrder", "isGroup", "allowAliasCreation", "formLayout", "secondaryFieldId", "groupByFieldId"];
    const updates: any = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const table = await types.getTable();
    const updated = await types.updateRecord(table, params.typeId, updates);
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const types = context.recordManager("lorekeeper", "entry_type");
    const record = await types.readRecord(params.typeId);
    if (!record || record.data.lorebookId !== params.lorebookId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Collect record IDs before the transaction so we can clean up icon files
    // after it commits (file ops can't participate in the DB transaction).
    const preRecordsResult = await context.recordManager("lorekeeper", "entry_record").readRecords({
      filters: [{ field: "entryTypeId", operator: "=", value: params.typeId }],
      limit: 5000,
    });
    const recordIds: string[] = preRecordsResult.records.map((r: any) => r.id);

    await context.withTransaction(async (client) => {
      const rm = (table: string) => context.recordManager("lorekeeper", table);

      // Pre-fetch IDs needed for cascading deletes before removing anything.
      const sectionsResult = await rm("entry_section").readRecords({
        filters: [{ field: "entryTypeId", operator: "=", value: params.typeId }],
        limit: 500,
      });
      const sectionIds: string[] = sectionsResult.records.map((s: any) => s.id);

      const fieldsResult = await rm("entry_field").readRecords({
        filters: [{ field: "entryTypeId", operator: "=", value: params.typeId }],
        limit: 1000,
      });
      const fieldIds: string[] = fieldsResult.records.map((f: any) => f.id);

      await rm("entry_type_alias").deleteFilteredRecords(
        { filters: [{ field: "entryTypeId", operator: "=", value: params.typeId }] },
        { client }
      );
      // Delete related_list_item rows that reference this type from other sections
      await rm("related_list_item").deleteFilteredRecords(
        { filters: [{ field: "entryTypeId", operator: "=", value: params.typeId }] },
        { client }
      );
      // Delete record_lookup rows whose customFieldId points at this type's fields
      for (const fieldId of fieldIds) {
        await rm("record_lookup").deleteFilteredRecords(
          { filters: [{ field: "customFieldId", operator: "=", value: fieldId }] },
          { client }
        );
      }
      await rm("entry_field").deleteFilteredRecords(
        { filters: [{ field: "entryTypeId", operator: "=", value: params.typeId }] },
        { client }
      );
      // Delete related_list_item rows that live inside this type's own sections
      for (const sectionId of sectionIds) {
        await rm("related_list_item").deleteFilteredRecords(
          { filters: [{ field: "sectionId", operator: "=", value: sectionId }] },
          { client }
        );
      }
      await rm("entry_section").deleteFilteredRecords(
        { filters: [{ field: "entryTypeId", operator: "=", value: params.typeId }] },
        { client }
      );
      // Delete record_lookup and entry_attachment rows for each record, then
      // delete the records themselves.
      for (const recordId of recordIds) {
        await rm("record_lookup").deleteFilteredRecords(
          { filters: [{ field: "record1", operator: "=", value: recordId }] },
          { client }
        );
        await rm("record_lookup").deleteFilteredRecords(
          { filters: [{ field: "record2", operator: "=", value: recordId }] },
          { client }
        );
        await rm("entry_attachment").deleteFilteredRecords(
          { filters: [{ field: "entryRecordId", operator: "=", value: recordId }] },
          { client }
        );
      }
      await rm("entry_record").deleteFilteredRecords(
        { filters: [{ field: "entryTypeId", operator: "=", value: params.typeId }] },
        { client }
      );
      // Clear parentTypeId on child types
      const children = await rm("entry_type").readRecords({
        filters: [{ field: "parentTypeId", operator: "=", value: params.typeId }],
        limit: 500,
      });
      const etTable = await rm("entry_type").getTable();
      for (const child of children.records) {
        await rm("entry_type").updateRecord(etTable, child.id, { parentTypeId: "" }, { client });
      }
      await rm("entry_type").deleteRecord(params.typeId, { client });
    });

    await deleteIconFile(context.appFileManager, entryTypeIconPath(params.lorebookId, params.typeId));
    for (const recordId of recordIds) {
      await deleteIconFile(context.appFileManager, recordIconPath(recordId));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
