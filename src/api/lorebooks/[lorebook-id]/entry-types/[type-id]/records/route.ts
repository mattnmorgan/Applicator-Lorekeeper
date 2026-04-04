import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../lib/permissions";

export async function GET(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const aliasId = searchParams.get("aliasId") || "";

    const records = context.recordManager("lorekeeper", "entry_record");
    const filters: any[] = [
      { field: "lorebookId", operator: "=", value: params.lorebookId },
      { field: "entryTypeId", operator: "=", value: params.typeId },
    ];
    if (aliasId) filters.push({ field: "aliasId", operator: "=", value: aliasId });
    const condition = filters.length === 3 ? "1 AND 2 AND 3" : "1 AND 2";
    const result = await records.readRecords({ filters, condition, limit: 2000 });

    let items = result.records.map((r: any) => ({ id: r.id, ...r.data }));

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (r: any) =>
          r.name?.toLowerCase().includes(q) ||
          r.blurb?.toLowerCase().includes(q)
      );
    }

    items.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return NextResponse.json({ records: items, total: items.length });
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

    const records = context.recordManager("lorekeeper", "entry_record");
    const table = await records.getTable();
    const record = await records.createRecord(table, {
      lorebookId: params.lorebookId,
      entryTypeId: params.typeId,
      aliasId: body.aliasId || "",
      name: body.name.trim(),
      blurb: body.blurb || "",
      hasIcon: false,
      fieldData: body.fieldData || {},
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
