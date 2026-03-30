import { ApiContext } from "@applicator/sdk/context";
import { LorebookAccessLevel } from "../types/Lorebook";

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
