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

    const [typesRes, sectionsRes, fieldsRes, relatedRes, aliasesRes] = await Promise.all([
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
      rm("entry_type_alias").readRecords({
        filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
        limit: 2000,
      }),
    ]);

    const types = typesRes.records
      .map((r: any) => ({ id: r.id, ...r.data }))
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const idToSingular: Record<string, string> = {};
    types.forEach((t: any) => { idToSingular[t.id] = t.singularName; });

    // Group aliases by entry type
    const aliasesByTypeId: Record<string, any[]> = {};
    for (const r of aliasesRes.records) {
      const typeId = r.data.entryTypeId;
      if (!aliasesByTypeId[typeId]) aliasesByTypeId[typeId] = [];
      aliasesByTypeId[typeId].push({ id: r.id, ...r.data });
    }

    // Read lorebook icon
    let lorebookIcon: string | null = null;
    try {
      const lbIconPath = lorebookIconPath(params.lorebookId);
      const exists = await context.appFileManager.exists(lbIconPath);
      if (exists) {
        const buf = await context.appFileManager.readFile(lbIconPath);
        lorebookIcon = `data:image/jpeg;base64,${buf.toString("base64")}`;
      }
    } catch {}

    // Read entry type icons
    const typeIconMap: Record<string, string> = {};
    for (const t of types) {
      try {
        const iconPath = entryTypeIconPath(params.lorebookId, t.id);
        const exists = await context.appFileManager.exists(iconPath);
        if (exists) {
          const buf = await context.appFileManager.readFile(iconPath);
          typeIconMap[t.id] = `data:image/jpeg;base64,${buf.toString("base64")}`;
        }
      } catch {}
    }

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      icon: lorebookIcon,
      entryTypes: types.map((t: any) => {
        const typeSections = sectionsRes.records
          .filter((s: any) => s.data.entryTypeId === t.id)
          .map((s: any) => ({ id: s.id, ...s.data }))
          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

        const typeAliases = (aliasesByTypeId[t.id] || [])
          .sort((a: any, b: any) => a.pluralName.localeCompare(b.pluralName))
          .map((a: any) => ({
            id: a.id,
            singularName: a.singularName,
            pluralName: a.pluralName,
            bgColor: a.bgColor,
            fgColor: a.fgColor,
            blurb: a.blurb || "",
            visible: a.visible !== false,
          }));

        return {
          singularName: t.singularName,
          pluralName: t.pluralName,
          sdkIcon: t.icon || null,
          icon: typeIconMap[t.id] ?? null,
          blurb: t.blurb,
          parentTypeName: idToSingular[t.parentTypeId] || "",
          bgColor: t.bgColor,
          fgColor: t.fgColor,
          sortOrder: t.sortOrder,
          isGroup: t.isGroup || false,
          allowAliasCreation: t.allowAliasCreation || false,
          formLayout: t.formLayout || null,
          aliases: typeAliases,
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
              config: s.config || null,
              fields: sectionFields.map((f: any) => {
                const config = f.config || {};
                let exportedConfig = { ...config };

                // Resolve lookup targetEntryTypeIds → names for portability
                if (f.fieldType === "lookup" && Array.isArray(config.targetEntryTypeIds)) {
                  exportedConfig = {
                    ...config,
                    targetEntryTypeIds: undefined,
                    targetEntryTypeNames: config.targetEntryTypeIds.map(
                      (id: string) => idToSingular[id] || id
                    ),
                  };
                  delete exportedConfig.targetEntryTypeIds;
                }

                return {
                  id: f.id,
                  name: f.name,
                  fieldType: f.fieldType,
                  config: exportedConfig,
                  aliasIds: f.aliasIds || [],
                  required: f.required || false,
                  tooltip: f.tooltip || "",
                  sortOrder: f.sortOrder,
                };
              }),
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
