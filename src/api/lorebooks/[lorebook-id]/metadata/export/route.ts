import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess } from "../../../../../lib/permissions";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rm = (t: string) => context.recordManager("lorekeeper", t);

    const [typesRes, sectionsRes, fieldsRes, relatedRes] = await Promise.all([
      rm("entry_type").readRecords({
        filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
        limit: 500,
      }),
      rm("entry_section").readRecords({
        filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
        limit: 2000,
      }),
      rm("entry_field").readRecords({
        filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
        limit: 5000,
      }),
      rm("related_list_item").readRecords({
        filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
        limit: 2000,
      }),
    ]);

    const types = typesRes.records
      .map((r: any) => ({ id: r.id, ...r.data }))
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const idToSingular: Record<string, string> = {};
    types.forEach((t: any) => { idToSingular[t.id] = t.singularName; });

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entryTypes: types.map((t: any) => {
        const typeSections = sectionsRes.records
          .filter((s: any) => s.data.entryTypeId === t.id)
          .map((s: any) => ({ id: s.id, ...s.data }))
          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

        return {
          singularName: t.singularName,
          pluralName: t.pluralName,
          icon: t.icon,
          blurb: t.blurb,
          parentTypeName: idToSingular[t.parentTypeId] || "",
          bgColor: t.bgColor,
          fgColor: t.fgColor,
          sortOrder: t.sortOrder,
          sections: typeSections.map((s: any) => {
            const sectionFields = fieldsRes.records
              .filter((f: any) => f.data.sectionId === s.id)
              .map((f: any) => ({ id: f.id, ...f.data }))
              .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

            const relatedItems = relatedRes.records
              .filter((ri: any) => ri.data.sectionId === s.id)
              .map((ri: any) => ({
                entryTypeName: idToSingular[ri.data.entryTypeId] || ri.data.entryTypeId,
                fieldName: sectionFields.find((f: any) => f.id === ri.data.fieldId)?.name || ri.data.fieldId,
              }));

            return {
              name: s.name,
              sectionType: s.sectionType,
              sortOrder: s.sortOrder,
              fields: sectionFields.map((f: any) => ({
                name: f.name,
                fieldType: f.fieldType,
                config: f.config,
                sortOrder: f.sortOrder,
              })),
              relatedItems,
            };
          }),
        };
      }),
    };

    return NextResponse.json(exportData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
