import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess } from "../../../../lib/permissions";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const user = await context.user();
    const prefs = context.recordManager("lorekeeper", "user_pref");
    const result = await prefs.readRecords({
      filters: [
        { field: "lorebookId", operator: "=", value: params.lorebookId },
        { field: "userId", operator: "=", value: user.id },
      ],
      condition: "1 AND 2",
      limit: 1000,
    });

    const map: Record<string, any> = {};
    for (const r of result.records) {
      map[r.data.key] = r.data.value;
    }

    return NextResponse.json({ prefs: map });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const { key, value } = body;
    if (typeof key !== "string" || !key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    const user = await context.user();
    const prefs = context.recordManager("lorekeeper", "user_pref");

    const existing = await prefs.readRecords({
      filters: [
        { field: "lorebookId", operator: "=", value: params.lorebookId },
        { field: "userId", operator: "=", value: user.id },
        { field: "key", operator: "=", value: key },
      ],
      condition: "1 AND 2 AND 3",
      limit: 1,
    });

    const table = await prefs.getTable();
    if (existing.records.length > 0) {
      await prefs.updateRecord(table, existing.records[0].id, { value });
    } else {
      await prefs.createRecord(table, {
        lorebookId: params.lorebookId,
        userId: user.id,
        key,
        value,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
