import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";

// GET /api/my-app/items — list all items
export async function GET(_req: NextRequest, context: ApiContext) {
  const items = context.recordManager("my-app", "items");
  const result = await items.readRecords({ limit: 100 });

  return NextResponse.json({
    items: result.records.map((r) => ({ id: r.id, ...r.data })),
    total: result.total,
  });
}

// POST /api/my-app/items — create a new item
export async function POST(req: NextRequest, context: ApiContext) {
  try {
    const body = await req.json();

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const items = context.recordManager("my-app", "items");
    const table = await items.getTable();
    const record = await items.createRecord(table, {
      name: body.name.trim(),
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
