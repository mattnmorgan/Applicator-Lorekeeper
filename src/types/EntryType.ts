export interface EntryType {
  id: string;
  lorebookId: string;
  singularName: string;
  pluralName: string;
  icon: string;
  blurb: string;
  parentTypeId: string;
  bgColor: string;
  fgColor: string;
  sortOrder: number;
}

export interface EntrySection {
  id: string;
  lorebookId: string;
  entryTypeId: string;
  name: string;
  sectionType: "fields" | "related_list";
  sortOrder: number;
}

export type FieldType = "text" | "rich_text" | "picklist" | "toggle" | "number" | "lookup";

export interface PicklistConfig {
  options: Array<{ value: string; label: string }>;
  multiselect: boolean;
  allowCustom: boolean;
}

export interface NumberConfig {
  decimals: number;
  min?: number;
  max?: number;
}

export interface LookupConfig {
  multiselect: boolean;
  targetEntryTypeIds: string[];
  aToB: string;
  bToA: string;
}

export type FieldConfig = PicklistConfig | NumberConfig | LookupConfig | Record<string, never>;

export interface EntryField {
  id: string;
  lorebookId: string;
  entryTypeId: string;
  sectionId: string;
  name: string;
  fieldType: FieldType;
  config: FieldConfig;
  sortOrder: number;
}

export interface RelatedListItem {
  id: string;
  lorebookId: string;
  sectionId: string;
  entryTypeId: string;
  fieldId: string;
  entryTypeName?: string;
  fieldName?: string;
}
