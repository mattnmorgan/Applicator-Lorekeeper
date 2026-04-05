import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../lib/permissions";
import { recordIconPath, deleteIconFile } from "../../../../../../../lib/iconStorage";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; recordId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const records = context.recordManager("lorekeeper", "entry_record");
    const record = await records.readRecord(params.recordId);
    if (!record || record.data.lorebookId !== params.lorebookId || record.data.entryTypeId !== params.typeId) {
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
  params: { lorebookId: string; typeId: string; recordId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const records = context.recordManager("lorekeeper", "entry_record");
    const existing = await records.readRecord(params.recordId);
    if (!existing || existing.data.lorebookId !== params.lorebookId || existing.data.entryTypeId !== params.typeId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.blurb !== undefined) updates.blurb = body.blurb;
    if (body.fieldData !== undefined) updates.fieldData = body.fieldData;
    if (body.aliasId !== undefined) updates.aliasId = body.aliasId;

    const table = await records.getTable();
    const updated = await records.updateRecord(table, params.recordId, updates);
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; recordId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const records = context.recordManager("lorekeeper", "entry_record");
    const existing = await records.readRecord(params.recordId);
    if (!existing || existing.data.lorebookId !== params.lorebookId || existing.data.entryTypeId !== params.typeId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await context.withTransaction(async (client) => {
      const rm = (t: string) => context.recordManager("lorekeeper", t);
      // Clear lookups referencing this record
      await rm("record_lookup").deleteFilteredRecords(
        { filters: [{ field: "record1", operator: "=", value: params.recordId }] },
        { client }
      );
      await rm("record_lookup").deleteFilteredRecords(
        { filters: [{ field: "record2", operator: "=", value: params.recordId }] },
        { client }
      );
      // Delete attachments
      await rm("entry_attachment").deleteFilteredRecords(
        { filters: [{ field: "entryRecordId", operator: "=", value: params.recordId }] },
        { client }
      );
      await records.deleteRecord(params.recordId, { client });
    });

    await deleteIconFile(context.appFileManager, recordIconPath(params.recordId));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
