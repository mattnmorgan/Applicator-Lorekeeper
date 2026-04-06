import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../lib/permissions";
import { entryTypeIconPath, deleteIconFile } from "../../../../../lib/iconStorage";

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
    const allowed = ["singularName", "pluralName", "icon", "blurb", "parentTypeId", "bgColor", "fgColor", "sortOrder", "formLayout"];
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

    await context.withTransaction(async (client) => {
      const rm = (table: string) => context.recordManager("lorekeeper", table);

      await rm("related_list_item").deleteFilteredRecords(
        { filters: [{ field: "entryTypeId", operator: "=", value: params.typeId }] },
        { client }
      );
      await rm("entry_field").deleteFilteredRecords(
        { filters: [{ field: "entryTypeId", operator: "=", value: params.typeId }] },
        { client }
      );
      await rm("entry_section").deleteFilteredRecords(
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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
