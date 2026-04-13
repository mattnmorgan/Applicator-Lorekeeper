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
    const typeIds = searchParams.get("typeIds")?.split(",").filter(Boolean) || [];
    if (typeIds.length === 0) {
      return NextResponse.json({ error: "typeIds is required" }, { status: 400 });
    }

    const records = context.recordManager("lorekeeper", "entry_record");

    const results = await Promise.all(
      typeIds.map(async (typeId) => {
        const result = await records.readRecords({
          filters: [
            { field: "lorebookId", operator: "=", value: params.lorebookId },
            { field: "entryTypeId", operator: "=", value: typeId },
          ],
          condition: "1 AND 2",
          limit: 2000,
        });
        const items = result.records
          .map((r: any) => ({ id: r.id, ...r.data }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
        return [typeId, items] as [string, any[]];
      }),
    );

    return NextResponse.json({ recordsByTypeId: Object.fromEntries(results) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
