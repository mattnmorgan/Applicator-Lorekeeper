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
    if (!canManageMembers(level)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const lorebooks = context.recordManager("lorekeeper", "lorebook");
    const lorebook = await lorebooks.readRecord(params.lorebookId);
    if (!lorebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const caManager = context.contextualAuthorityManager;
    const cas = await caManager.getContextualAuthorities("lorekeeper", `lorebook-${params.lorebookId}`);

    if (!lorebook.data.guestAccessEnabled || cas.length === 0) {
      return NextResponse.json({ enabled: false, hasPassword: false, shareUrl: null, contextId: null });
    }

    const ca = cas[0];
    const ctxData = ca.data.context ? JSON.parse(ca.data.context) : {};
    return NextResponse.json({
      enabled: true,
      hasPassword: !!ctxData.hasPassword,
      shareUrl: `/app/guest/lorekeeper?context=${encodeURIComponent(ca.id)}`,
      contextId: ca.id,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
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
    const { enabled, password } = body as { enabled: boolean; password?: string };
    const user = await context.user();

    const lorebooks = context.recordManager("lorekeeper", "lorebook");
    const table = await lorebooks.getTable();
    const caManager = context.contextualAuthorityManager;
    const recordId = `lorebook-${params.lorebookId}`;

    // Remove existing CAs for this lorebook
    const existing = await caManager.getContextualAuthorities("lorekeeper", recordId);
    for (const ca of existing) {
      await caManager.deleteContextualAuthority(ca.id);
    }

    if (!enabled) {
      await lorebooks.updateRecord(table, params.lorebookId, { guestAccessEnabled: false });
      return NextResponse.json({ enabled: false, hasPassword: false, shareUrl: null, contextId: null });
    }

    const hasPassword = typeof password === "string" && password.length > 0;
    const ca = await caManager.createPasswordContextualAuthority({
      app: "lorekeeper",
      recordId,
      permission: "lorekeeper:lorebook-guest",
      ...(hasPassword ? { password } : {}),
      createdBy: user.id,
      context: JSON.stringify({ lorebookId: params.lorebookId, hasPassword }),
    });

    await lorebooks.updateRecord(table, params.lorebookId, { guestAccessEnabled: true });

    return NextResponse.json({
      enabled: true,
      hasPassword,
      shareUrl: `/app/guest/lorekeeper?context=${encodeURIComponent(ca.id)}`,
      contextId: ca.id,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
