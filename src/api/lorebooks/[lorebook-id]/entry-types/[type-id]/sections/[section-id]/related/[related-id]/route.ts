import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../../../lib/permissions";

export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; sectionId: string; relatedId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const related = context.recordManager("lorekeeper", "related_list_item");
    const record = await related.readRecord(params.relatedId);
    if (!record || record.data.sectionId !== params.sectionId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await related.deleteRecord(params.relatedId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
