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
  isGroup?: boolean;
  allowAliasCreation?: boolean;
  formLayout?: FormLayout;
}

export interface EntrySection {
  id: string;
  lorebookId: string;
  entryTypeId: string;
  name: string;
  sectionType: "fields" | "related_list";
  sortOrder: number;
  config?: { aliasIds?: string[] };
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
  targetAliasIds?: string[];
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
  aliasIds?: string[];
  required?: boolean;
  tooltip?: string;
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

// Form layout types — shared with FormEditor/FormViewer SDK components

export interface FormColumn {
  id: string;
  /** Width as a percentage of the row (all columns in a row must sum to 100) */
  width: number;
  /** ID of the EntryField assigned to this slot, or null for empty */
  fieldId: string | null;
}

export interface FormRow {
  id: string;
  columns: FormColumn[];
}

export interface FormLayoutSection {
  id: string;
  name: string;
  /** Empty array = shown for all aliases; non-empty = only shown when activeAliasId is in list */
  aliasIds: string[];
  rows: FormRow[];
}

export interface FormLayout {
  sections: FormLayoutSection[];
}
