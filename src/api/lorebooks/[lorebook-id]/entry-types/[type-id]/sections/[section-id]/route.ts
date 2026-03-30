import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../lib/permissions";

export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; sectionId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sections = context.recordManager("lorekeeper", "entry_section");
    const record = await sections.readRecord(params.sectionId);
    if (!record || record.data.lorebookId !== params.lorebookId || record.data.entryTypeId !== params.typeId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;

    const table = await sections.getTable();
    const updated = await sections.updateRecord(table, params.sectionId, updates);
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; sectionId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sections = context.recordManager("lorekeeper", "entry_section");
    const record = await sections.readRecord(params.sectionId);
    if (!record || record.data.lorebookId !== params.lorebookId || record.data.entryTypeId !== params.typeId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await context.withTransaction(async (client) => {
      const rm = (table: string) => context.recordManager("lorekeeper", table);
      await rm("related_list_item").deleteFilteredRecords(
        { filters: [{ field: "sectionId", operator: "=", value: params.sectionId }] },
        { client }
      );
      await rm("entry_field").deleteFilteredRecords(
        { filters: [{ field: "sectionId", operator: "=", value: params.sectionId }] },
        { client }
      );
      await rm("entry_section").deleteRecord(params.sectionId, { client });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
