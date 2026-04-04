import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canManageMembers } from "../../../../lib/permissions";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const lorebooks = context.recordManager("lorekeeper", "lorebook");
    const lorebook = await lorebooks.readRecord(params.lorebookId);
    if (!lorebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const members = context.recordManager("lorekeeper", "lorebook_member");
    const result = await members.readRecords({
      filters: [{ field: "lorebookId", operator: "=", value: params.lorebookId }],
      limit: 500,
    });

    const userIds = [
      lorebook.data.ownerId,
      ...result.records.map((r: any) => r.data.userId),
    ];
    const userRecords = context.recordManager("system", "users");
    const allUsers = await userRecords.readRecords({ limit: 1000 });
    const userMap: Record<string, any> = {};
    for (const u of allUsers.records) {
      userMap[u.id] = {
        displayName: u.data.display_name || u.data.username,
        username: u.data.username,
        email: u.data.email,
      };
    }

    const owner = {
      userId: lorebook.data.ownerId,
      role: "owner",
      displayName: userMap[lorebook.data.ownerId]?.displayName || lorebook.data.ownerId,
      username: userMap[lorebook.data.ownerId]?.username || "",
      email: userMap[lorebook.data.ownerId]?.email || "",
    };

    const memberList = result.records.map((r: any) => ({
      id: r.id,
      userId: r.data.userId,
      role: r.data.role,
      displayName: userMap[r.data.userId]?.displayName || r.data.userId,
      username: userMap[r.data.userId]?.username || "",
      email: userMap[r.data.userId]?.email || "",
    }));

    return NextResponse.json({ owner, members: memberList });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canManageMembers(level)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    if (!body.userId || !body.role) {
      return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
    }
    if (!["view", "edit", "manager"].includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Check not already a member or owner
    const lorebooks = context.recordManager("lorekeeper", "lorebook");
    const lorebook = await lorebooks.readRecord(params.lorebookId);
    if (lorebook?.data.ownerId === body.userId) {
      return NextResponse.json({ error: "User is already the owner" }, { status: 409 });
    }

    const members = context.recordManager("lorekeeper", "lorebook_member");
    const existing = await members.readRecords({
      filters: [
        { field: "lorebookId", operator: "=", value: params.lorebookId },
        { field: "userId", operator: "=", value: body.userId },
      ],
      condition: "1 AND 2",
      limit: 1,
    });
    if (existing.records.length > 0) {
      return NextResponse.json({ error: "User already has access" }, { status: 409 });
    }

    const table = await members.getTable();
    const record = await members.createRecord(table, {
      lorebookId: params.lorebookId,
      userId: body.userId,
      role: body.role,
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
