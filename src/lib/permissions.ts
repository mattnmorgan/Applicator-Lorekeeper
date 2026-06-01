import { ApiContext } from "@applicator/sdk/context";
import { LorebookAccessLevel } from "../types/Lorebook";

/**
 * Access check for image-serving GET routes (icons, thumbnails).
 * These are loaded via <img> tags which cannot send custom headers, so
 * context.isGuest is always false for them in a guest session. Instead we
 * allow unauthenticated requests when guestAccessEnabled is true on the lorebook.
 */
export async function checkPublicImageAccess(
  context: ApiContext,
  lorebookId: string,
): Promise<boolean> {
  if (context.isGuest) {
    return getGuestLorebookAccess(context, lorebookId);
  }
  const lorebooks = context.recordManager("lorekeeper", "lorebook");
  const lorebook = await lorebooks.readRecord(lorebookId);
  if (!lorebook) return false;
  if (lorebook.data.guestAccessEnabled) return true;
  try {
    const level = await getLorebookAccess(context, lorebookId);
    return level !== null;
  } catch {
    return false;
  }
}

export async function getGuestLorebookAccess(
  context: ApiContext,
  lorebookId: string
): Promise<boolean> {
  if (!context.isGuest) return false;
  const guestCtx = context.contextGuest;
  if (!guestCtx) return false;
  const data = guestCtx.data as { lorebookId?: string } | null;
  if (data?.lorebookId !== lorebookId) return false;

  const lorebooks = context.recordManager("lorekeeper", "lorebook");
  const lorebook = await lorebooks.readRecord(lorebookId);
  return !!(lorebook?.data.guestAccessEnabled);
}

export async function getLorebookAccess(
  context: ApiContext,
  lorebookId: string
): Promise<LorebookAccessLevel> {
  const user = await context.user();
  const lorebooks = context.recordManager("lorekeeper", "lorebook");
  const lorebook = await lorebooks.readRecord(lorebookId);
  if (!lorebook) return null;

  if (lorebook.data.ownerId === user.id) return "owner";

  const members = context.recordManager("lorekeeper", "lorebook_member");
  const result = await members.readRecords({
    filters: [
      { field: "lorebookId", operator: "=", value: lorebookId },
      { field: "userId", operator: "=", value: user.id },
    ],
    condition: "1 AND 2",
    limit: 1,
  });

  if (result.records.length === 0) return null;
  return result.records[0].data.role as LorebookAccessLevel;
}

export function canView(level: LorebookAccessLevel): boolean {
  return level !== null;
}

export function canEdit(level: LorebookAccessLevel): boolean {
  return level === "owner" || level === "manager" || level === "edit";
}

export function canManageMembers(level: LorebookAccessLevel): boolean {
  return level === "owner" || level === "manager";
}

export function isOwner(level: LorebookAccessLevel): boolean {
  return level === "owner";
}
