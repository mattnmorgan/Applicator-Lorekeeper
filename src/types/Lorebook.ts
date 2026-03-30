export interface Lorebook {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  ownerId: string;
  ownerName?: string;
}

export interface LorebookMember {
  id: string;
  lorebookId: string;
  userId: string;
  role: "view" | "edit" | "manager";
  userName?: string;
  userEmail?: string;
}

export type LorebookAccessLevel = "owner" | "manager" | "edit" | "view" | null;
