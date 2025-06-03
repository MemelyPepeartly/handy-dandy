/**
 * Return a mapping of friendly names to Document constructors.
 */
export function listDocumentConstructors(): Record<
  string,
  | typeof foundry.documents.BaseActor
  | typeof foundry.documents.BaseItem
  | typeof foundry.documents.BaseJournalEntry
  | typeof foundry.documents.BaseRollTable
  | typeof foundry.documents.BaseScene
  | typeof foundry.documents.BaseMacro
  | typeof foundry.documents.BasePlaylist
> {
  return {
    Actor: foundry.documents.BaseActor,
    Item: foundry.documents.BaseItem,
    JournalEntry: foundry.documents.BaseJournalEntry,
    RollTable: foundry.documents.BaseRollTable,
    Scene: foundry.documents.BaseScene,
    Macro: foundry.documents.BaseMacro,
    Playlist: foundry.documents.BasePlaylist
  };
}

/**
 * Get the schema for a given document name.
 * @param name - The name of the document type.
 * @returns The schema object or null if not found.
 */
export function getDocumentSchema(name: string): Record<string, any> | null {
  const constructors = listDocumentConstructors();
  const ctor = constructors[name];
  if (!ctor) return null;

  // Access the static schema property
  const schema = (ctor as any).schema;
  return schema ?? null;
}

/**
 * Flatten a nested schema into an array of paths and their corresponding types and details.
 * @param schema - The schema object to flatten.
 * @param base - The base path for recursion.
 * @returns An array of objects containing path, type, and detail.
 */
export function flattenSchema(
  schema: Record<string, any>,
  base: string = "root"
): Array<{ path: string; type: string; detail: string }> {
  const rows: Array<{ path: string; type: string; detail: string }> = [];

  for (const [key, field] of Object.entries(schema)) {
    const path = `${base}.${key}`;
    const type = field?.constructor?.name ?? typeof field;
    const detail = typeof field?.toString === 'function' ? field.toString() : String(field);
    rows.push({ path, type, detail });

    // Recurse into nested schemas
    if (field?.fields && typeof field.fields === 'object') {
      rows.push(...flattenSchema(field.fields, path));
    }
  }

  return rows;
}
