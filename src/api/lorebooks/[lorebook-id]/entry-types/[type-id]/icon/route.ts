import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess } from "../../../../../../lib/permissions";

// Entry type icons are SDK icon names (strings), not image files.
// This route returns the icon name for a given entry type.
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

    return NextResponse.json({ icon: record.data.icon || "file" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
