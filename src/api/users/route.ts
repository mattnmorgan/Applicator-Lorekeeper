import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";

export async function GET(req: NextRequest, context: ApiContext) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";

    const userManager = context.recordManager("system", "users");
    const result = await userManager.readRecords({ limit: 500 });

    const currentUser = await context.user();
    let users = result.records
      .filter((r: any) => r.id !== currentUser.id)
      .map((r: any) => ({
        id: r.id,
        displayName: r.data.display_name || r.data.username,
        username: r.data.username,
        email: r.data.email,
      }));

    if (query) {
      const q = query.toLowerCase();
      users = users.filter(
        (u: any) =>
          u.displayName?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ users });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
