import sharp from "sharp";
import { ApiContext } from "@applicator/sdk/context";

export function lorebookIconPath(lorebookId: string): string {
  return `${lorebookId}/icon.png`;
}

export function entryTypeIconPath(lorebookId: string, typeId: string): string {
  return `${lorebookId}/${typeId}.png`;
}

export function recordIconPath(recordId: string): string {
  return `icons/records/${recordId}.png`;
}

export function attachmentPath(recordId: string, attachmentId: string, filename: string): string {
  return `attachments/${recordId}/${attachmentId}-${filename}`;
}

export function attachmentThumbPath(attachmentId: string): string {
  return `attachments/thumbs/${attachmentId}.jpg`;
}

export async function saveIconFromDataUrl(
  fileManager: ApiContext["appFileManager"],
  iconPath: string,
  dataUrl: string
): Promise<void> {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const buf = Buffer.from(base64, "base64");
  const resized = await sharp(buf)
    .resize(64, 64, { fit: "cover", withoutEnlargement: true })
    .png({ compressionLevel: 6 })
    .toBuffer();
  await fileManager.writeFile(iconPath, resized);
}

export async function deleteIconFile(
  fileManager: ApiContext["appFileManager"],
  iconPath: string
): Promise<void> {
  try { await fileManager.deleteFile(iconPath); } catch {}
  // Also remove legacy .jpg if present
  try { await fileManager.deleteFile(iconPath.replace(/\.png$/, ".jpg")); } catch {}
}

export async function generateThumbnail(
  fileManager: ApiContext["appFileManager"],
  sourcePath: string,
  thumbPath: string
): Promise<void> {
  const raw = await fileManager.readFile(sourcePath);
  const buf = raw instanceof Buffer ? raw : Buffer.from(raw);
  const { hasAlpha } = await sharp(buf).metadata();
  const thumb = hasAlpha
    ? await sharp(buf).resize(200, 200, { fit: "cover", withoutEnlargement: true }).png({ compressionLevel: 6 }).toBuffer()
    : await sharp(buf).resize(200, 200, { fit: "cover", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  await fileManager.writeFile(thumbPath, thumb);
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}
