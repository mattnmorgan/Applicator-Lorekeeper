import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../lib/permissions";

export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; aliasId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const aliases = context.recordManager("lorekeeper", "entry_type_alias");
    const record = await aliases.readRecord(params.aliasId);
    if (!record || record.data.lorebookId !== params.lorebookId || record.data.entryTypeId !== params.typeId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const updates: any = {};
    if (body.singularName !== undefined) updates.singularName = body.singularName.trim();
    if (body.pluralName !== undefined) updates.pluralName = body.pluralName.trim();
    if (body.bgColor !== undefined) updates.bgColor = body.bgColor;
    if (body.fgColor !== undefined) updates.fgColor = body.fgColor;
    if (body.visible !== undefined) updates.visible = body.visible;

    const table = await aliases.getTable();
    const updated = await aliases.updateRecord(table, params.aliasId, updates);
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; aliasId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const aliases = context.recordManager("lorekeeper", "entry_type_alias");
    const record = await aliases.readRecord(params.aliasId);
    if (!record || record.data.lorebookId !== params.lorebookId || record.data.entryTypeId !== params.typeId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await aliases.deleteRecord(params.aliasId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
