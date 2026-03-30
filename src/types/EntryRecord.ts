export interface EntryRecord {
  id: string;
  lorebookId: string;
  entryTypeId: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  fieldData: Record<string, any>;
}

export interface RecordLookup {
  id: string;
  lorebookId: string;
  customFieldId: string;
  record1: string;
  record2: string;
  aToB: string;
  bToA: string;
  record1Name?: string;
  record2Name?: string;
}

export interface EntryAttachment {
  id: string;
  lorebookId: string;
  entryRecordId: string;
  filename: string;
  mimeType: string;
  size: number;
  hasThumb: boolean;
}
