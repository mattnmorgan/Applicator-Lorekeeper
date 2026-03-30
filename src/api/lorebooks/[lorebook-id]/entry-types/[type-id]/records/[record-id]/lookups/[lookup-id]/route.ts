import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../../../lib/permissions";

export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; recordId: string; lookupId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const lookups = context.recordManager("lorekeeper", "record_lookup");
    const record = await lookups.readRecord(params.lookupId);
    if (
      !record ||
      record.data.lorebookId !== params.lorebookId ||
      (record.data.record1 !== params.recordId && record.data.record2 !== params.recordId)
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await lookups.deleteRecord(params.lookupId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
