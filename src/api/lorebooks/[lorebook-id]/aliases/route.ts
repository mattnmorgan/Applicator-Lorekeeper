import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess } from "../../../../lib/permissions";

export async function GET(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const typeIds = (searchParams.get("typeIds") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (typeIds.length === 0) {
      return NextResponse.json({ byTypeId: {} });
    }

    const aliases = context.recordManager("lorekeeper", "entry_type_alias");
    const result = await aliases.readRecords({
      filters: [
        { field: "lorebookId", operator: "=", value: params.lorebookId },
        { field: "entryTypeId", operator: "IN", value: typeIds },
      ],
      condition: "1 AND 2",
      limit: 5000,
    });

    const byTypeId: Record<string, any[]> = {};
    for (const typeId of typeIds) byTypeId[typeId] = [];
    for (const r of result.records) {
      const typeId = r.data.entryTypeId;
      if (byTypeId[typeId]) byTypeId[typeId].push({ id: r.id, ...r.data });
    }
    for (const typeId of typeIds) {
      byTypeId[typeId].sort((a: any, b: any) => a.pluralName.localeCompare(b.pluralName));
    }

    return NextResponse.json({ byTypeId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
