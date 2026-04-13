import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";

export async function GET(req: NextRequest, context: ApiContext) {
  try {
    const user = await context.user();
    const lorebooks = context.recordManager("lorekeeper", "lorebook");
    const members = context.recordManager("lorekeeper", "lorebook_member");

    // Lorebooks user owns
    const ownedResult = await lorebooks.readRecords({
      filters: [{ field: "ownerId", operator: "=", value: user.id }],
      limit: 500,
    });

    // Memberships for this user
    const memberResult = await members.readRecords({
      filters: [{ field: "userId", operator: "=", value: user.id }],
      limit: 500,
    });

    const sharedIds = memberResult.records.map((r: any) => r.data.lorebookId);
    let sharedBooks: any[] = [];
    if (sharedIds.length > 0) {
      const sharedResult = await lorebooks.readRecords({ ids: sharedIds });
      sharedBooks = sharedResult.records;
    }

    // Resolve owner display names and profile pictures
    const allBooks = [...ownedResult.records, ...sharedBooks];
    const ownerIds = [...new Set(allBooks.map((r: any) => r.data.ownerId))];
    const ownerMap: Record<string, { name: string; picture?: string }> = {};
    const userRecords = context.recordManager("system", "users");
    for (const ownerId of ownerIds) {
      try {
        const u = await context.user(ownerId);
        let picture: string | undefined;
        try {
          const userRecord = await userRecords.readRecord(ownerId);
          if (userRecord?.data?.icon) {
            picture = `/api/system/assets/icons/users/${ownerId}`;
          }
        } catch {}
        ownerMap[ownerId] = {
          name: u.display_name || u.username || ownerId,
          picture,
        };
      } catch {}
    }

    const mapBook = (r: any, role: string) => ({
      id: r.id,
      name: r.data.name,
      blurb: r.data.blurb,
      hasIcon: r.data.hasIcon,
      ownerId: r.data.ownerId,
      ownerName: ownerMap[r.data.ownerId]?.name || r.data.ownerId,
      ownerPicture: ownerMap[r.data.ownerId]?.picture,
      role,
    });

    const canCreate = await context.isUserAuthorizedFor(
      "lorekeeper:create-lorebook",
    );

    return NextResponse.json({
      currentUserId: user.id,
      canCreate,
      owned: ownedResult.records.map((r: any) => mapBook(r, "owner")),
      shared: sharedBooks.map((book: any) => {
        const membership = memberResult.records.find(
          (m: any) => m.data.lorebookId === book.id,
        );
        return mapBook(book, membership?.data.role || "view");
      }),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: ApiContext) {
  try {
    const canCreate = await context.isUserAuthorizedFor(
      "lorekeeper:create-lorebook",
    );
    if (!canCreate) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await context.user();
    const body = await req.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const lorebooks = context.recordManager("lorekeeper", "lorebook");
    const table = await lorebooks.getTable();
    const record = await lorebooks.createRecord(table, {
      name: body.name.trim(),
      blurb: body.blurb || "",
      hasIcon: false,
      ownerId: user.id,
    });

    return NextResponse.json(
      { id: record.id, ...record.data },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
