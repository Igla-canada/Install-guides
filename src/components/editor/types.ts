// Client-side shape of the canonical guild document (serialized loadGuildDoc).
/* eslint-disable @typescript-eslint/no-explicit-any */

export type ClientBlock = {
  id: string;
  order: number;
  type: string;
  content: any;
};

export type ClientSection = {
  id: string;
  order: number;
  title: string;
  type: string;
  collapsedDefault: boolean;
  blocks: ClientBlock[];
};

export type ClientDoc = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  /** Overrides publish for dealer/API compatibility list visibility. */
  hideFromCompatibility?: boolean;
  properties: Record<string, string> | null;
  regionId: string;
  makeId: string;
  modelId: string;
  generationId: string;
  trimId: string | null;
  iglaProductId: string;
  coverImageId: string | null;
  region: { name: string };
  make: { name: string };
  model: { name: string };
  generation: { name: string; yearStart: number; yearEnd: number | null };
  trim: { name: string } | null;
  iglaProduct: { name: string; productLine: { name: string } };
  products: Array<{
    iglaProductId: string;
    iglaProduct: { name: string; productLine: { name: string } };
  }>;
  altMakes?: Array<{ makeId: string; make: { name: string } }>;
  altModelAliases?: Array<{ name: string }>;
  sections: ClientSection[];
  updatedAt: string;
};

export type ClientVersion = {
  id: string;
  versionNo: number;
  note: string | null;
  createdAt: string;
  createdBy: { name: string };
};

export type ClientQuickPick = {
  id: string;
  scope: string;
  kind: string;
  label: string;
  payload: any;
  useCount: number;
};
