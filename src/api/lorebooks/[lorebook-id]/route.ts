import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit, isOwner } from "../../../lib/permissions";
import { lorebookIconPath, deleteIconFile } from "../../../lib/iconStorage";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const lorebooks = context.recordManager("lorekeeper", "lorebook");
    const record = await lorebooks.readRecord(params.lorebookId);
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const user = await context.user();
    let ownerName = "";
    try {
      const owner = await context.user(record.data.ownerId);
      ownerName = owner.displayName || owner.username || record.data.ownerId;
    } catch {}

    return NextResponse.json({
      id: record.id,
      ...record.data,
      ownerName,
      accessLevel: level,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const lorebooks = context.recordManager("lorekeeper", "lorebook");
    const table = await lorebooks.getTable();

    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.blurb !== undefined) updates.blurb = body.blurb;

    const updated = await lorebooks.updateRecord(table, params.lorebookId, updates);
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!isOwner(level)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { lorebookId } = params;

    await context.withTransaction(async (client) => {
      const rm = (table: string) => context.recordManager("lorekeeper", table);

      // Delete in dependency order
      const attachments = await rm("entry_attachment").readRecords({
        filters: [{ field: "lorebookId", operator: "=", value: lorebookId }],
        limit: 10000,
      });
      if (attachments.records.length > 0) {
        await rm("entry_attachment").bulkDeleteRecords(
          attachments.records.map((r: any) => r.id),
          { client }
        );
      }

      await rm("record_lookup").deleteFilteredRecords(
        { filters: [{ field: "lorebookId", operator: "=", value: lorebookId }] },
        { client }
      );
      await rm("entry_record").deleteFilteredRecords(
        { filters: [{ field: "lorebookId", operator: "=", value: lorebookId }] },
        { client }
      );
      await rm("related_list_item").deleteFilteredRecords(
        { filters: [{ field: "lorebookId", operator: "=", value: lorebookId }] },
        { client }
      );
      await rm("entry_field").deleteFilteredRecords(
        { filters: [{ field: "lorebookId", operator: "=", value: lorebookId }] },
        { client }
      );
      await rm("entry_section").deleteFilteredRecords(
        { filters: [{ field: "lorebookId", operator: "=", value: lorebookId }] },
        { client }
      );
      await rm("entry_type").deleteFilteredRecords(
        { filters: [{ field: "lorebookId", operator: "=", value: lorebookId }] },
        { client }
      );
      await rm("lorebook_member").deleteFilteredRecords(
        { filters: [{ field: "lorebookId", operator: "=", value: lorebookId }] },
        { client }
      );
      await rm("lorebook").deleteRecord(lorebookId, { client });
    });

    // Clean up icon file outside transaction
    await deleteIconFile(context.appFileManager, lorebookIconPath(lorebookId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
