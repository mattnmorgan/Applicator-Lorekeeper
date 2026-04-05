import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../../lib/permissions";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; recordId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(_req.url);
    const fieldId = searchParams.get("fieldId");

    const lookups = context.recordManager("lorekeeper", "record_lookup");
    const filters: any[] = [
      { field: "lorebookId", operator: "=", value: params.lorebookId },
    ];
    if (fieldId) {
      filters.push({ field: "customFieldId", operator: "=", value: fieldId });
    }

    // Get lookups where record is record1 or record2
    const asRecord1 = await lookups.readRecords({
      filters: [
        ...filters,
        { field: "record1", operator: "=", value: params.recordId },
      ],
      condition: filters.length === 1 ? "1 AND 2" : "1 AND 2 AND 3",
      limit: 500,
    });

    const asRecord2 = await lookups.readRecords({
      filters: [
        ...filters,
        { field: "record2", operator: "=", value: params.recordId },
      ],
      condition: filters.length === 1 ? "1 AND 2" : "1 AND 2 AND 3",
      limit: 500,
    });

    const allLookups = [...asRecord1.records, ...asRecord2.records];

    // Resolve record names
    const recordIds = new Set<string>();
    allLookups.forEach((r: any) => {
      recordIds.add(r.data.record1);
      recordIds.add(r.data.record2);
    });

    const entryRecords = context.recordManager("lorekeeper", "entry_record");
    const nameMap: Record<string, string> = {};
    for (const id of recordIds) {
      try {
        const r = await entryRecords.readRecord(id);
        nameMap[id] = r?.data.name || id;
      } catch {}
    }

    const items = allLookups.map((r: any) => ({
      id: r.id,
      ...r.data,
      record1Name: nameMap[r.data.record1] || r.data.record1,
      record2Name: nameMap[r.data.record2] || r.data.record2,
    }));

    return NextResponse.json({ lookups: items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; recordId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    if (!body.customFieldId || !body.record2) {
      return NextResponse.json({ error: "customFieldId and record2 are required" }, { status: 400 });
    }

    const lookups = context.recordManager("lorekeeper", "record_lookup");
    const table = await lookups.getTable();
    const record = await lookups.createRecord(table, {
      lorebookId: params.lorebookId,
      customFieldId: body.customFieldId,
      record1: params.recordId,
      record2: body.record2,
      aToB: body.aToB || "",
      bToA: body.bToA || "",
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
