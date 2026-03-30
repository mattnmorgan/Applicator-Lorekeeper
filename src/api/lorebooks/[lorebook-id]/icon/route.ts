import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../lib/permissions";
import { lorebookIconPath, saveIconFromDataUrl } from "../../../../lib/iconStorage";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const iconPath = lorebookIconPath(params.lorebookId);
    const exists = await context.appFileManager.exists(iconPath);
    if (!exists) return NextResponse.json({ error: "No icon" }, { status: 404 });

    const buffer = await context.appFileManager.readFile(iconPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
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
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const iconPath = lorebookIconPath(params.lorebookId);

    if (body.iconData) {
      await saveIconFromDataUrl(context.appFileManager, iconPath, body.iconData);
      const lorebooks = context.recordManager("lorekeeper", "lorebook");
      const table = await lorebooks.getTable();
      await lorebooks.updateRecord(table, params.lorebookId, { hasIcon: true });
      return NextResponse.json({ success: true, hasIcon: true });
    } else {
      // Remove icon
      try { await context.appFileManager.deleteFile(iconPath); } catch {}
      const lorebooks = context.recordManager("lorekeeper", "lorebook");
      const table = await lorebooks.getTable();
      await lorebooks.updateRecord(table, params.lorebookId, { hasIcon: false });
      return NextResponse.json({ success: true, hasIcon: false });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
