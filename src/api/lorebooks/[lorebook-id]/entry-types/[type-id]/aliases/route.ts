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

    const aliases = context.recordManager("lorekeeper", "entry_type_alias");
    const result = await aliases.readRecords({
      filters: [
        { field: "lorebookId", operator: "=", value: params.lorebookId },
        { field: "entryTypeId", operator: "=", value: params.typeId },
      ],
      condition: "1 AND 2",
      limit: 500,
    });

    const sorted = result.records
      .map((r: any) => ({ id: r.id, ...r.data }))
      .sort((a: any, b: any) => a.pluralName.localeCompare(b.pluralName));

    return NextResponse.json({ aliases: sorted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    if (!body.singularName?.trim() || !body.pluralName?.trim()) {
      return NextResponse.json({ error: "singularName and pluralName are required" }, { status: 400 });
    }

    // Verify the entry type belongs to this lorebook
    const types = context.recordManager("lorekeeper", "entry_type");
    const typeRecord = await types.readRecord(params.typeId);
    if (!typeRecord || typeRecord.data.lorebookId !== params.lorebookId) {
      return NextResponse.json({ error: "Entry type not found" }, { status: 404 });
    }

    const aliases = context.recordManager("lorekeeper", "entry_type_alias");
    const table = await aliases.getTable();
    const record = await aliases.createRecord(table, {
      lorebookId: params.lorebookId,
      entryTypeId: params.typeId,
      singularName: body.singularName.trim(),
      pluralName: body.pluralName.trim(),
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
