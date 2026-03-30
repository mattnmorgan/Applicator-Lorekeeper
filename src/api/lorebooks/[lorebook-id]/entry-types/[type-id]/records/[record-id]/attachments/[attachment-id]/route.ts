import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../../../lib/permissions";
import { attachmentPath, attachmentThumbPath } from "../../../../../../../../../lib/iconStorage";

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

    const filePath = attachmentPath(params.recordId, params.attachmentId, record.data.filename);
    const exists = await context.appFileManager.exists(filePath);
    if (!exists) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const buffer = await context.appFileManager.readFile(filePath);
    const filename = record.data.filename;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": record.data.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; recordId: string; attachmentId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const attachments = context.recordManager("lorekeeper", "entry_attachment");
    const record = await attachments.readRecord(params.attachmentId);
    if (!record || record.data.entryRecordId !== params.recordId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const filePath = attachmentPath(params.recordId, params.attachmentId, record.data.filename);
    try { await context.appFileManager.deleteFile(filePath); } catch {}
    if (record.data.hasThumb) {
      try { await context.appFileManager.deleteFile(attachmentThumbPath(params.attachmentId)); } catch {}
    }

    await attachments.deleteRecord(params.attachmentId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
