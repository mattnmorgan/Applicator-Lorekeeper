import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getLorebookAccess, canEdit } from "../../../../../../../../lib/permissions";
import {
  attachmentPath,
  attachmentThumbPath,
  generateThumbnail,
  isImageMime,
} from "../../../../../../../../lib/iconStorage";

export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; recordId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!level) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const attachments = context.recordManager("lorekeeper", "entry_attachment");
    const result = await attachments.readRecords({
      filters: [{ field: "entryRecordId", operator: "=", value: params.recordId }],
      limit: 500,
    });

    return NextResponse.json({
      attachments: result.records.map((r: any) => ({ id: r.id, ...r.data })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { lorebookId: string; typeId: string; recordId: string }
) {
  try {
    const level = await getLorebookAccess(context, params.lorebookId);
    if (!canEdit(level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const attachments = context.recordManager("lorekeeper", "entry_attachment");
    const table = await attachments.getTable();

    // Create record first to get ID
    const record = await attachments.createRecord(table, {
      lorebookId: params.lorebookId,
      entryRecordId: params.recordId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: buffer.length,
      hasThumb: false,
    });

    const filePath = attachmentPath(params.recordId, record.id, file.name);
    await context.appFileManager.writeFile(filePath, buffer);

    // Generate thumbnail for images
    let hasThumb = false;
    if (isImageMime(file.type || "")) {
      try {
        await generateThumbnail(context.appFileManager, filePath, attachmentThumbPath(record.id));
        hasThumb = true;
        await attachments.updateRecord(table, record.id, { hasThumb: true });
      } catch {}
    }

    return NextResponse.json({ id: record.id, ...record.data, hasThumb }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
