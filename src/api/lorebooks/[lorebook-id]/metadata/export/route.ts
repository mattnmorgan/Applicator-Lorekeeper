import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess } from "../../../../../lib/permissions";
import { lorebookIconPath, entryTypeIconPath } from "../../../../../lib/iconStorage";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rm = (t: string) => context.recordManager("lorekeeper", t);

    const [lorebookRecord, typesRes, aliasesRes, sectionsRes, fieldsRes, relatedRes] = await Promise.all([
      rm("lorebook").readRecord(params.lorebookId),
      rm("entry_type").readRecords({
        filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
        limit: 500,
      }),
      rm("entry_type_alias").readRecords({
        filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
        limit: 2000,
      }),
      rm("entry_section").readRecords({
        filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
        limit: 2000,
      }),
      rm("entry_field").readRecords({
        filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
        limit: 10000,
      }),
      rm("related_list_item").readRecords({
        filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
        limit: 2000,
      }),
    ]);

    // Group children by parent ID for O(1) lookup during assembly
    const aliasesByType: Record<string, any[]> = {};
    for (const r of aliasesRes.records) {
      const k = r.data.entryTypeId;
      if (!aliasesByType[k]) aliasesByType[k] = [];
      aliasesByType[k].push(r);
    }
    const sectionsByType: Record<string, any[]> = {};
    for (const r of sectionsRes.records) {
      const k = r.data.entryTypeId;
      if (!sectionsByType[k]) sectionsByType[k] = [];
      sectionsByType[k].push(r);
    }
    const fieldsByType: Record<string, any[]> = {};
    for (const r of fieldsRes.records) {
      const k = r.data.entryTypeId;
      if (!fieldsByType[k]) fieldsByType[k] = [];
      fieldsByType[k].push(r);
    }
    const relatedBySection: Record<string, any[]> = {};
    for (const r of relatedRes.records) {
      const k = r.data.sectionId;
      if (!relatedBySection[k]) relatedBySection[k] = [];
      relatedBySection[k].push(r);
    }

    // Read lorebook icon
    let lorebookIcon: string | null = null;
    try {
      const p = lorebookIconPath(params.lorebookId);
      if (await context.appFileManager.exists(p)) {
        const buf = await context.appFileManager.readFile(p);
        lorebookIcon = `data:image/jpeg;base64,${buf.toString("base64")}`;
      }
    } catch {}

    // Read entry type icons in parallel
    const types = typesRes.records
      .map((r: any) => ({ id: r.id, ...r.data }))
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const typeIconMap: Record<string, string> = {};
    await Promise.all(types.map(async (t: any) => {
      try {
        const p = entryTypeIconPath(params.lorebookId, t.id);
        if (await context.appFileManager.exists(p)) {
          const buf = await context.appFileManager.readFile(p);
          typeIconMap[t.id] = `data:image/jpeg;base64,${buf.toString("base64")}`;
        }
      } catch {}
    }));

    const lb = (lorebookRecord as any)?.data ?? {};

    return NextResponse.json({
      version: 2,
      exportedAt: new Date().toISOString(),
      lorebook: {
        name: lb.name ?? "",
        blurb: lb.blurb ?? "",
        icon: lorebookIcon,
      },
      entryTypes: types.map((t: any) => ({
        id: t.id,
        singularName: t.singularName,
        pluralName: t.pluralName,
        sdkIcon: t.icon || null,
        icon: typeIconMap[t.id] ?? null,
        blurb: t.blurb ?? "",
        parentTypeId: t.parentTypeId || null,
        bgColor: t.bgColor ?? "#334155",
        fgColor: t.fgColor ?? "#f1f5f9",
        sortOrder: t.sortOrder ?? 0,
        isGroup: t.isGroup ?? false,
        allowAliasCreation: t.allowAliasCreation ?? false,
        formLayout: t.formLayout ?? null,
        secondaryFieldId: t.secondaryFieldId || null,
        groupByFieldId: t.groupByFieldId || null,
        // Aliases for this entry type
        aliases: (aliasesByType[t.id] ?? []).map((r: any) => ({
          id: r.id,
          singularName: r.data.singularName,
          pluralName: r.data.pluralName,
          bgColor: r.data.bgColor,
          fgColor: r.data.fgColor,
          blurb: r.data.blurb ?? "",
          visible: r.data.visible !== false,
        })),
        // Sections (structure only; related list membership is stored here)
        sections: (sectionsByType[t.id] ?? [])
          .sort((a: any, b: any) => (a.data.sortOrder ?? 0) - (b.data.sortOrder ?? 0))
          .map((r: any) => ({
            id: r.id,
            name: r.data.name,
            sectionType: r.data.sectionType,
            sortOrder: r.data.sortOrder ?? 0,
            config: r.data.config ?? null,
            relatedItems: (relatedBySection[r.id] ?? []).map((ri: any) => ({
              entryTypeId: ri.data.entryTypeId,
              fieldId: ri.data.fieldId,
            })),
          })),
        // ALL fields for this entry type (flat — includes type-level and section fields)
        // sectionId links each field to its section; null means type-level field
        fields: (fieldsByType[t.id] ?? [])
          .sort((a: any, b: any) => (a.data.sortOrder ?? 0) - (b.data.sortOrder ?? 0))
          .map((r: any) => ({
            id: r.id,
            name: r.data.name,
            fieldType: r.data.fieldType,
            config: r.data.config ?? {},
            sectionId: r.data.sectionId || null,
            aliasIds: r.data.aliasIds ?? [],
            required: r.data.required ?? false,
            tooltip: r.data.tooltip ?? "",
            sortOrder: r.data.sortOrder ?? 0,
          })),
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
