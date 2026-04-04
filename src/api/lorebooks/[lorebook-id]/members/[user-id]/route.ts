import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canManageMembers, isOwner } from "../../../../../lib/permissions";

export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; userId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canManageMembers(level)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    // Promote to owner (only current owner can do this)
    if (body.promoteToOwner) {
      if (!isOwner(level)) {
        return NextResponse.json({ error: "Only the owner can transfer ownership" }, { status: 403 });
      }

      const currentUser = await context.user();
      const lorebooks = context.recordManager("lorekeeper", "lorebook");
      const members = context.recordManager("lorekeeper", "lorebook_member");
      const lTable = await lorebooks.getTable();
      const mTable = await members.getTable();

      await context.withTransaction(async (client) => {
        // Transfer ownership
        await lorebooks.updateRecord(lTable, params.lorebookId, { ownerId: params.userId }, { client });

        // Remove the new owner's member record if it exists
        const existing = await members.readRecords({
          filters: [
            { field: "lorebookId", operator: "=", value: params.lorebookId },
            { field: "userId", operator: "=", value: params.userId },
          ],
          condition: "1 AND 2",
          limit: 1,
        });
        if (existing.records.length > 0) {
          await members.deleteRecord(existing.records[0].id, { client });
        }

        // Add old owner as manager
        const oldOwnerMember = await members.readRecords({
          filters: [
            { field: "lorebookId", operator: "=", value: params.lorebookId },
            { field: "userId", operator: "=", value: currentUser.id },
          ],
          condition: "1 AND 2",
          limit: 1,
        });
        if (oldOwnerMember.records.length > 0) {
          await members.updateRecord(mTable, oldOwnerMember.records[0].id, { role: "manager" }, { client });
        } else {
          await members.createRecord(mTable, {
            lorebookId: params.lorebookId,
            userId: currentUser.id,
            role: "manager",
          }, { client });
        }
      });

      return NextResponse.json({ success: true });
    }

    // Update role
    if (body.role) {
      if (!["view", "edit", "manager"].includes(body.role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      const members = context.recordManager("lorekeeper", "lorebook_member");
      const existing = await members.readRecords({
        filters: [
          { field: "lorebookId", operator: "=", value: params.lorebookId },
          { field: "userId", operator: "=", value: params.userId },
        ],
        condition: "1 AND 2",
        limit: 1,
      });

      if (existing.records.length === 0) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
      }

      const table = await members.getTable();
      const updated = await members.updateRecord(table, existing.records[0].id, { role: body.role });
      return NextResponse.json({ id: updated.id, ...updated.data });
    }

    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; userId: string }
) {
  try {
    const currentUser = await context.user();
    const level = await getLorebookAccess(context, params.lorebookId);
    // Allow self-revoke (member removing their own access), otherwise require canManageMembers
    const isSelfRevoke = params.userId === currentUser.id;
    if (!isSelfRevoke && !canManageMembers(level)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const members = context.recordManager("lorekeeper", "lorebook_member");
    const existing = await members.readRecords({
      filters: [
        { field: "lorebookId", operator: "=", value: params.lorebookId },
        { field: "userId", operator: "=", value: params.userId },
      ],
      condition: "1 AND 2",
      limit: 1,
    });

    if (existing.records.length === 0) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    await members.deleteRecord(existing.records[0].id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
