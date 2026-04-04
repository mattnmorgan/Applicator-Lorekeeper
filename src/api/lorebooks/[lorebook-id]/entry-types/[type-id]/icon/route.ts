import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../lib/permissions";
import { entryTypeIconPath, saveIconFromDataUrl } from "../../../../../../lib/iconStorage";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const iconPath = entryTypeIconPath(params.lorebookId, params.typeId);
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
  params: { lorebookId: string; typeId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const iconPath = entryTypeIconPath(params.lorebookId, params.typeId);
    const types = context.recordManager("lorekeeper", "entry_type");
    const table = await types.getTable();

    if (body.iconData) {
      await saveIconFromDataUrl(context.appFileManager, iconPath, body.iconData);
      await types.updateRecord(table, params.typeId, { hasIcon: true });
      return NextResponse.json({ success: true, hasIcon: true });
    } else {
      try { await context.appFileManager.deleteFile(iconPath); } catch {}
      await types.updateRecord(table, params.typeId, { hasIcon: false });
      return NextResponse.json({ success: true, hasIcon: false });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
