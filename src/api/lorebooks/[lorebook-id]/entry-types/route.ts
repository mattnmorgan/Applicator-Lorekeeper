import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../lib/permissions";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const types = context.recordManager("lorekeeper", "entry_type");
    const result = await types.readRecords({
      filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
      limit: 500,
    });

    const sorted = result.records
      .map((r: any) => ({ id: r.id, ...r.data }))
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    return NextResponse.json({ entryTypes: sorted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    if (!body.singularName?.trim() || !body.pluralName?.trim()) {
      return NextResponse.json({ error: "singularName and pluralName are required" }, { status: 400 });
    }

    // Get next sort order
    const types = context.recordManager("lorekeeper", "entry_type");
    const existing = await types.readRecords({
      filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
      limit: 500,
    });
    const maxSort = existing.records.reduce((m: number, r: any) => Math.max(m, r.data.sortOrder ?? 0), 0);

    const table = await types.getTable();
    const record = await types.createRecord(table, {
      lorebookId: params.lorebookId,
      singularName: body.singularName.trim(),
      pluralName: body.pluralName.trim(),
      icon: body.icon || "file",
      blurb: body.blurb || "",
      parentTypeId: body.parentTypeId || "",
      bgColor: body.bgColor || "#334155",
      fgColor: body.fgColor || "#f1f5f9",
      sortOrder: maxSort + 1,
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
