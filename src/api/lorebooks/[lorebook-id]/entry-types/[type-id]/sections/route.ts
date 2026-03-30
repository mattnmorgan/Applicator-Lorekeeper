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

    const sections = context.recordManager("lorekeeper", "entry_section");
    const result = await sections.readRecords({
      filters: [
        { field: "lorebookId", operator: "=", value: params.lorebookId },
        { field: "entryTypeId", operator: "=", value: params.typeId },
      ],
      condition: "1 AND 2",
      limit: 200,
    });

    const sorted = result.records
      .map((r: any) => ({ id: r.id, ...r.data }))
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    return NextResponse.json({ sections: sorted });
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
    if (!body.sectionType || !["fields", "related_list"].includes(body.sectionType)) {
      return NextResponse.json({ error: "sectionType must be 'fields' or 'related_list'" }, { status: 400 });
    }

    const sections = context.recordManager("lorekeeper", "entry_section");
    const existing = await sections.readRecords({
      filters: [
        { field: "lorebookId", operator: "=", value: params.lorebookId },
        { field: "entryTypeId", operator: "=", value: params.typeId },
      ],
      condition: "1 AND 2",
      limit: 200,
    });
    const maxSort = existing.records.reduce((m: number, r: any) => Math.max(m, r.data.sortOrder ?? 0), 0);

    const table = await sections.getTable();
    const record = await sections.createRecord(table, {
      lorebookId: params.lorebookId,
      entryTypeId: params.typeId,
      name: body.name.trim(),
      sectionType: body.sectionType,
      sortOrder: maxSort + 1,
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
