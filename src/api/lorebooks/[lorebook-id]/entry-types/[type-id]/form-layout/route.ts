import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../lib/permissions";

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

    return NextResponse.json({ formLayout: record.data.formLayout || null });
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
    if (body.formLayout === undefined) {
      return NextResponse.json({ error: "formLayout is required" }, { status: 400 });
    }

    const table = await types.getTable();
    const updated = await types.updateRecord(table, params.typeId, { formLayout: body.formLayout });
    return NextResponse.json({ formLayout: updated.data.formLayout || null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
