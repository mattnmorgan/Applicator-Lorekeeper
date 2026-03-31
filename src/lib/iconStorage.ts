import sharp from "sharp";
import { ApiContext } from "@applicator/sdk/context";

export function lorebookIconPath(lorebookId: string): string {
  return `icons/lorebooks/${lorebookId}.jpg`;
}

export function entryTypeIconPath(typeId: string): string {
  return `icons/entry-types/${typeId}.jpg`;
}

export function recordIconPath(recordId: string): string {
  return `icons/records/${recordId}.jpg`;
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
    .jpeg({ quality: 85 })
    .toBuffer();
  await fileManager.writeFile(iconPath, resized);
}

export async function deleteIconFile(
  fileManager: ApiContext["appFileManager"],
  iconPath: string
): Promise<void> {
  try {
    await fileManager.deleteFile(iconPath);
  } catch {}
}

export async function generateThumbnail(
  fileManager: ApiContext["appFileManager"],
  sourcePath: string,
  thumbPath: string
): Promise<void> {
  const buf = await fileManager.readFile(sourcePath);
  const thumb = await sharp(buf)
    .resize(200, 200, { fit: "cover", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  await fileManager.writeFile(thumbPath, thumb);
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}
