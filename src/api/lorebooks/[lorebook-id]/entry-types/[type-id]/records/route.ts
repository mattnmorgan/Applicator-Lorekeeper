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
    // lookupFieldId: field whose linked record names should be resolved (for grouping)
    const lookupFieldId = searchParams.get("lookupFieldId") || "";
    // secondaryLookupFieldId: lookup field shown as secondary display — resolved separately
    const secondaryLookupFieldId = searchParams.get("secondaryLookupFieldId") || "";
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

    // Resolve secondary lookup field separately when it differs from the groupBy lookup
    let secondaryLookupData: Record<string, any[]> = {};
    if (secondaryLookupFieldId && secondaryLookupFieldId !== lookupFieldId && items.length > 0) {
      try {
        const slRM = context.recordManager("lorekeeper", "record_lookup");
        const slResult = await slRM.readRecords({
          filters: [
            { field: "lorebookId", operator: "=", value: params.lorebookId },
            { field: "customFieldId", operator: "=", value: secondaryLookupFieldId },
          ],
          condition: "1 AND 2",
          limit: 20000,
        });

        const recordIdSet = new Set(items.map((r: any) => r.id));
        const relevantSL = slResult.records.filter((lr: any) => recordIdSet.has(lr.data.record1));
        const sl2Ids = [...new Set(relevantSL.map((lr: any) => lr.data.record2 as string))];

        const slEntryRM = context.recordManager("lorekeeper", "entry_record");
        const slEntryMap: Record<string, { name: string; hasIcon: boolean; entryTypeId: string }> = {};
        await Promise.all(
          sl2Ids.map(async (rid) => {
            try {
              const r = await slEntryRM.readRecord(rid);
              if (r) slEntryMap[rid] = { name: r.data.name || "", hasIcon: !!r.data.hasIcon, entryTypeId: r.data.entryTypeId || "" };
            } catch {}
          })
        );

        for (const lr of relevantSL) {
          const rec1 = lr.data.record1 as string;
          const rec2 = lr.data.record2 as string;
          const entry = slEntryMap[rec2];
          if (entry?.name) {
            if (!secondaryLookupData[rec1]) secondaryLookupData[rec1] = [];
            secondaryLookupData[rec1].push({ id: rec2, ...entry });
          }
        }
      } catch {}
    } else if (secondaryLookupFieldId && secondaryLookupFieldId === lookupFieldId) {
      secondaryLookupData = lookupData;
    }

    if (search) {
      const q = search.toLowerCase();
      items = items.filter((r: any) => {
        if (r.name?.toLowerCase().includes(q)) return true;
        if (r.blurb?.toLowerCase().includes(q)) return true;
        if (secondaryFieldId) {
          if (secondaryLookupFieldId && secondaryLookupFieldId === secondaryFieldId) {
            // Lookup field: search resolved linked record names
            const names = (secondaryLookupData[r.id] || lookupData[r.id] || []).map((e: any) => e.name || "");
            if (names.some((n: string) => n.toLowerCase().includes(q))) return true;
          }
          // Also search raw fieldData for non-lookup types (text, date, datetime, range, etc.)
          // Lookup fields store nothing in fieldData so this branch is a no-op for them.
          const val = r.fieldData?.[secondaryFieldId];
          if (Array.isArray(val)) {
            if (val.some((v: any) => String(v).toLowerCase().includes(q))) return true;
          } else if (val !== undefined && val !== null && val !== "" && String(val).toLowerCase().includes(q)) {
            return true;
          }
        }
        return false;
      });

      // Drop lookup entries for records that were filtered out
      const filteredIds = new Set(items.map((r: any) => r.id));
      if (lookupFieldId) {
        for (const key of Object.keys(lookupData)) {
          if (!filteredIds.has(key)) delete lookupData[key];
        }
      }
      if (secondaryLookupFieldId && secondaryLookupFieldId !== lookupFieldId) {
        for (const key of Object.keys(secondaryLookupData)) {
          if (!filteredIds.has(key)) delete secondaryLookupData[key];
        }
      }
    }

    items.sort((a: any, b: any) => a.name.localeCompare(b.name));

    return NextResponse.json({ records: items, total: items.length, lookupData, secondaryLookupData });
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
