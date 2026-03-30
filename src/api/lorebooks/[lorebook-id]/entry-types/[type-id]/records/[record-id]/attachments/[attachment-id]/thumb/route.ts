import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess } from "../../../../../../../../../../lib/permissions";
import { attachmentPath, attachmentThumbPath, generateThumbnail } from "../../../../../../../../../../lib/iconStorage";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; recordId: string; attachmentId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const attachments = context.recordManager("lorekeeper", "entry_attachment");
    const record = await attachments.readRecord(params.attachmentId);
    if (!record || record.data.entryRecordId !== params.recordId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const thumbPath = attachmentThumbPath(params.attachmentId);

    // Lazy generate thumb if not yet created
    if (!record.data.hasThumb) {
      const srcPath = attachmentPath(params.recordId, params.attachmentId, record.data.filename);
      try {
        await generateThumbnail(context.appFileManager, srcPath, thumbPath);
        const table = await attachments.getTable();
        await attachments.updateRecord(table, params.attachmentId, { hasThumb: true });
      } catch {
        return NextResponse.json({ error: "Thumbnail not available" }, { status: 404 });
      }
    }

    const exists = await context.appFileManager.exists(thumbPath);
    if (!exists) return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });

    const buffer = await context.appFileManager.readFile(thumbPath);
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
