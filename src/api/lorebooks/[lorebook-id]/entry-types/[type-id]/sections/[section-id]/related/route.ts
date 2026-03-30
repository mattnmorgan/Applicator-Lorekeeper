import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../../lib/permissions";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; sectionId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const related = context.recordManager("lorekeeper", "related_list_item");
    const result = await related.readRecords({
      filters: [{ field: "sectionId", operator: "=", value: params.sectionId }],
      limit: 100,
    });

    // Resolve entry type and field names
    const items = await Promise.all(
      result.records.map(async (r: any) => {
        let entryTypeName = "";
        let fieldName = "";
        try {
          const et = await context.recordManager("lorekeeper", "entry_type").readRecord(r.data.entryTypeId);
          entryTypeName = et?.data.pluralName || "";
        } catch {}
        try {
          const field = await context.recordManager("lorekeeper", "entry_field").readRecord(r.data.fieldId);
          fieldName = field?.data.name || "";
        } catch {}
        return { id: r.id, ...r.data, entryTypeName, fieldName };
      })
    );

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; sectionId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    if (!body.entryTypeId || !body.fieldId) {
      return NextResponse.json({ error: "entryTypeId and fieldId are required" }, { status: 400 });
    }

    const related = context.recordManager("lorekeeper", "related_list_item");
    const table = await related.getTable();
    const record = await related.createRecord(table, {
      lorebookId: params.lorebookId,
      sectionId: params.sectionId,
      entryTypeId: body.entryTypeId,
      fieldId: body.fieldId,
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
