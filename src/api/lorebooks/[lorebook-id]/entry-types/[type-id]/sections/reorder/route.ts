import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../lib/permissions";

export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    if (!Array.isArray(body.order)) {
      return NextResponse.json({ error: "order array is required" }, { status: 400 });
    }

    const sections = context.recordManager("lorekeeper", "entry_section");
    const table = await sections.getTable();

    await context.withTransaction(async (client) => {
      for (let i = 0; i < body.order.length; i++) {
        await sections.updateRecord(table, body.order[i], { sortOrder: i }, { client });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
