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
    // lookupFieldId: field whose linked record names should be resolved (for display/grouping)
    const lookupFieldId = searchParams.get("lookupFieldId") || "";
    // secondaryFieldId: field shown as secondary display — also searched when search is provided
    const secondaryFieldId = searchParams.get("secondaryFieldId") || "";

    const records = context.recordManager("lorekeeper", "entry_record");
    const filters: any[] = [
      { field: "lorebookId", operator: "=", value: params.lorebookId },
      { field: "entryTypeId", operator: "=", value: params.typeId },
    ];
    if (aliasId) filters.push({ field: "aliasId", operator: "=", value: aliasId });
    const condition = filters.length === 3 ? "1 AND 2 AND 3" : "1 AND 2";
    const result = await records.readRecords({ filters, condition, limit: 2000 });

    let items = result.records.map((r: any) => ({ id: r.id, ...r.data }));

    // Resolve lookup data BEFORE filtering so that lookup names can be included
    // in the search when the secondary field is a lookup type.
    let lookupData: Record<string, any[]> = {};
    if (lookupFieldId && items.length > 0) {
      try {
        const lookupRM = context.recordManager("lorekeeper", "record_lookup");
        const lookupResult = await lookupRM.readRecords({
          filters: [
            { field: "lorebookId", operator: "=", value: params.lorebookId },
            { field: "customFieldId", operator: "=", value: lookupFieldId },
          ],
          condition: "1 AND 2",
          limit: 20000,
        });

        const recordIdSet = new Set(items.map((r: any) => r.id));
        const relevantLookups = lookupResult.records.filter((lr: any) =>
          recordIdSet.has(lr.data.record1)
        );

        const record2Ids = [...new Set(relevantLookups.map((lr: any) => lr.data.record2 as string))];

        const entryRecordRM = context.recordManager("lorekeeper", "entry_record");
        const entryMap: Record<string, { name: string; hasIcon: boolean; entryTypeId: string }> = {};
        await Promise.all(
          record2Ids.map(async (rid) => {
            try {
              const r = await entryRecordRM.readRecord(rid);
              if (r) entryMap[rid] = { name: r.data.name || "", hasIcon: !!r.data.hasIcon, entryTypeId: r.data.entryTypeId || "" };
            } catch {}
          })
        );

        for (const lr of relevantLookups) {
          const rec1 = lr.data.record1 as string;
          const rec2 = lr.data.record2 as string;
          const entry = entryMap[rec2];
          if (entry?.name) {
            if (!lookupData[rec1]) lookupData[rec1] = [];
            lookupData[rec1].push({ id: rec2, ...entry });
          }
        }
      } catch {}
    }

    if (search) {
      const q = search.toLowerCase();
      items = items.filter((r: any) => {
        if (r.name?.toLowerCase().includes(q)) return true;
        if (r.blurb?.toLowerCase().includes(q)) return true;
        if (secondaryFieldId) {
          if (secondaryFieldId === lookupFieldId) {
            // Lookup field: search resolved linked record names
            const names = (lookupData[r.id] || []).map((e: any) => e.name || "");
            if (names.some((n: string) => n.toLowerCase().includes(q))) return true;
          } else {
            // Text or picklist: search the raw fieldData value(s)
            const val = r.fieldData?.[secondaryFieldId];
            if (Array.isArray(val)) {
              if (val.some((v: any) => String(v).toLowerCase().includes(q))) return true;
            } else if (val !== undefined && val !== null && String(val).toLowerCase().includes(q)) {
              return true;
            }
          }
        }
        return false;
      });

      // Drop lookup entries for records that were filtered out
      if (lookupFieldId) {
        const filteredIds = new Set(items.map((r: any) => r.id));
        for (const key of Object.keys(lookupData)) {
          if (!filteredIds.has(key)) delete lookupData[key];
        }
      }
    }

    items.sort((a: any, b: any) => a.name.localeCompare(b.name));

    return NextResponse.json({ records: items, total: items.length, lookupData });
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
