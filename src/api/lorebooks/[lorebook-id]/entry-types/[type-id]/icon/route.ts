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
    const legacyPath = iconPath.replace(/\.png$/, ".jpg");
    let iconBuffer: Buffer | Uint8Array | undefined;
    let contentType = "image/png";
    if (await context.appFileManager.exists(iconPath)) {
      iconBuffer = await context.appFileManager.readFile(iconPath);
    } else if (await context.appFileManager.exists(legacyPath)) {
      iconBuffer = await context.appFileManager.readFile(legacyPath);
      contentType = "image/jpeg";
    }
    if (!iconBuffer) return NextResponse.json({ error: "No icon" }, { status: 404 });

    return new NextResponse(iconBuffer, {
      headers: {
        "Content-Type": contentType,
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
      try { await context.appFileManager.deleteFile(iconPath.replace(/\.png$/, ".jpg")); } catch {}
      await types.updateRecord(table, params.typeId, { hasIcon: false });
      return NextResponse.json({ success: true, hasIcon: false });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
