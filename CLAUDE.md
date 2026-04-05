# Lorekeeper — Development Notes

## Data Model Changes

When the data model changes (new fields, renamed fields, new tables, etc.), **always update both the metadata export and import routes** to reflect those changes:

- Export: `src/api/lorebooks/[lorebook-id]/metadata/export/route.ts`
- Import: `src/api/lorebooks/[lorebook-id]/metadata/import/route.ts`

This ensures lorebook metadata can be correctly round-tripped between instances.

## Export/Import Field Conventions

- Lorebook icon: exported as `icon` (data URL or `null`).
- Entry type custom image: exported as `icon` (data URL or `null`). SDK icon name exported as `sdkIcon`.
- Lookup field `targetEntryTypeIds` is resolved to `targetEntryTypeNames` on export and reversed on import for portability.
- Aliases are included per entry type under the `aliases` array.
