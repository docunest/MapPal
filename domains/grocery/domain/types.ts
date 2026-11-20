// Data shapes shared by the API, the repository and the phone UI. Pure types.
import type { CategoryInfo } from "./ai";

export type Kind = "GROCERY" | "LONGTERM";

export type CategoryDto = CategoryInfo & { emoji: string; sortOrder: number };

export type EntryDto = {
  id: string;
  productId: string | null;
  name: string;
  categoryId: string;
  kind: Kind;
  qty: string | null;
  note: string | null;
  status: "OPEN" | "BOUGHT";
  via: string;
  addedBy: string | null;
  addedAt: string;
  boughtAt: string | null;
  boughtBy: string | null;
};

export type TripDto = { id: string; startedAt: string; startedBy: string | null } | null;

export type AddInput = {
  id?: string;
  productId?: string | null;
  name: string;
  nameEn?: string | null;
  aliases?: string[];
  categoryId?: string | null;
  kind?: Kind | null;
  qty?: string | null;
  note?: string | null;
};

export type EntryPatch = {
  status?: "OPEN" | "BOUGHT" | "REMOVED";
  qty?: string | null;
  note?: string | null;
  kind?: Kind;
  categoryId?: string;
  name?: string;
};

export type ProductPatch = { name?: string; nameEn?: string | null; aliases?: string[]; categoryId?: string; kind?: Kind; hidden?: boolean; staple?: boolean };
