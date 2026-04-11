import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../lib/permissions";

export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; fieldId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const fields = context.recordManager("lorekeeper", "entry_field");
    const record = await fields.readRecord(params.fieldId);
    if (!record || record.data.lorebookId !== params.lorebookId || record.data.entryTypeId !== params.typeId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.config !== undefined) updates.config = body.config;
    if (body.aliasIds !== undefined) updates.aliasIds = body.aliasIds;
    if (body.required !== undefined) updates.required = !!body.required;
    if (body.tooltip !== undefined) updates.tooltip = body.tooltip;

    const table = await fields.getTable();
    const updated = await fields.updateRecord(table, params.fieldId, updates);
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; fieldId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const fields = context.recordManager("lorekeeper", "entry_field");
    const record = await fields.readRecord(params.fieldId);
    if (!record || record.data.lorebookId !== params.lorebookId || record.data.entryTypeId !== params.typeId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await context.withTransaction(async (client) => {
      await context.recordManager("lorekeeper", "record_lookup").deleteFilteredRecords(
        { filters: [{ field: "customFieldId", operator: "=", value: params.fieldId }] },
        { client }
      );

      // Find sections affected by removing this field's related list items
      const relatedItems = context.recordManager("lorekeeper", "related_list_item");
      const affectedItems = await relatedItems.readRecords({
        filters: [{ field: "fieldId", operator: "=", value: params.fieldId }],
        condition: "1",
        limit: 500,
      });
      const affectedSectionIds = [...new Set(affectedItems.records.map((r: any) => r.data.sectionId as string))];

      await relatedItems.deleteFilteredRecords(
        { filters: [{ field: "fieldId", operator: "=", value: params.fieldId }] },
        { client }
      );

      // Delete any related_list sections that are now empty
      if (affectedSectionIds.length > 0) {
        const sections = context.recordManager("lorekeeper", "entry_section");
        for (const sectionId of affectedSectionIds) {
          const remaining = await relatedItems.readRecords({
            filters: [{ field: "sectionId", operator: "=", value: sectionId }],
            condition: "1",
            limit: 1,
          });
          if (remaining.records.length === 0) {
            await sections.deleteRecord(sectionId, { client });
          }
        }
      }

      await fields.deleteRecord(params.fieldId, { client });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
