import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../../../lib/permissions";

export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; sectionId: string; fieldId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const fields = context.recordManager("lorekeeper", "entry_field");
    const record = await fields.readRecord(params.fieldId);
    if (!record || record.data.lorebookId !== params.lorebookId || record.data.sectionId !== params.sectionId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Delete field and any related lookups that reference it
    await context.withTransaction(async (client) => {
      await context.recordManager("lorekeeper", "record_lookup").deleteFilteredRecords(
        { filters: [{ field: "customFieldId", operator: "=", value: params.fieldId }] },
        { client }
      );
      await context.recordManager("lorekeeper", "related_list_item").deleteFilteredRecords(
        { filters: [{ field: "fieldId", operator: "=", value: params.fieldId }] },
        { client }
      );
      await fields.deleteRecord(params.fieldId, { client });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
