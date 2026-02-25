import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";

// GET /api/my-app/items/:itemId — get a single item
export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { itemId: string },
) {
  const { itemId } = params;
  const items = context.recordManager("my-app", "items");
  const record = await items.readRecord(itemId);

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ id: record.id, ...record.data });
}

// PATCH /api/my-app/items/:itemId — update an item
export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { itemId: string },
) {
  try {
    const { itemId } = params;
    const body = await req.json();

    const items = context.recordManager("my-app", "items");
    const table = await items.getTable();
    const existing = await items.readRecord(itemId);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await items.updateRecord(table, itemId, body);
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/my-app/items/:itemId — delete an item
export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { itemId: string },
) {
  try {
    const { itemId } = params;
    const items = context.recordManager("my-app", "items");
    const existing = await items.readRecord(itemId);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await items.deleteRecord(itemId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
