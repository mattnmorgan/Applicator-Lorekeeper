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

    const fields = context.recordManager("lorekeeper", "entry_field");
    const result = await fields.readRecords({
      filters: [
        { field: "lorebookId", operator: "=", value: params.lorebookId },
        { field: "entryTypeId", operator: "=", value: params.typeId },
      ],
      condition: "1 AND 2",
      limit: 500,
    });

    const sorted = result.records
      .map((r: any) => ({ id: r.id, ...r.data }))
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    return NextResponse.json({ fields: sorted });
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
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const validTypes = ["text", "rich_text", "picklist", "toggle", "number", "lookup"];
    if (!body.fieldType || !validTypes.includes(body.fieldType)) {
      return NextResponse.json({ error: "Invalid fieldType" }, { status: 400 });
    }

    const fields = context.recordManager("lorekeeper", "entry_field");
    const existing = await fields.readRecords({
      filters: [
        { field: "lorebookId", operator: "=", value: params.lorebookId },
        { field: "entryTypeId", operator: "=", value: params.typeId },
      ],
      condition: "1 AND 2",
      limit: 500,
    });
    const maxSort = existing.records.reduce((m: number, r: any) => Math.max(m, r.data.sortOrder ?? 0), 0);

    const table = await fields.getTable();
    const record = await fields.createRecord(table, {
      lorebookId: params.lorebookId,
      entryTypeId: params.typeId,
      sectionId: "",
      name: body.name.trim(),
      fieldType: body.fieldType,
      config: body.config || {},
      aliasIds: body.aliasIds || [],
      required: !!body.required,
      tooltip: body.tooltip || "",
      sortOrder: maxSort + 1,
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
