type AnyCompendium = CompendiumCollection<CompendiumCollection.Metadata>;

export type OfficialItemKind = "spell" | "action" | "item" | "effect" | "condition";

export interface OfficialItemLookup {
  kind: OfficialItemKind;
  name?: string | null;
  slug?: string | null;
  level?: number | null;
  itemType?: string | null;
}

export interface OfficialItemMatch {
  packId: string;
  documentId: string;
  uuid: string;
  source: Record<string, unknown>;
}

interface PackIndexEntry {
  _id?: string;
  id?: string;
  name?: string;
  type?: string;
  slug?: string | null;
  system?: {
    slug?: string | null;
    level?: { value?: number } | number;
  };
}

const INDEX_FIELDS = ["name", "type", "slug", "system.slug", "system.level.value"] as const;

const PACK_PRIORITY: Record<OfficialItemKind, string[]> = {
  spell: ["pf2e.spells-srd", "pf2e.spells"],
  action: [
    "pf2e.bestiary-ability-glossary-srd",
    "pf2e.bestiary-family-ability-glossary",
    "pf2e.actions",
    "pf2e.action-macros",
  ],
  item: [
    "pf2e.equipment-srd",
    "pf2e.equipment",
    "pf2e.feats-srd",
    "pf2e.feats",
    "pf2e.spells-srd",
    "pf2e.spells",
  ],
  effect: [
    "pf2e.other-effects",
    "pf2e.spell-effects",
    "pf2e.feat-effects",
    "pf2e.equipment-effects",
  ],
  condition: ["pf2e.conditionitems", "pf2e.conditions"],
};

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"`\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getEntryLevel(entry: PackIndexEntry): number | null {
  const systemLevel = entry.system?.level;
  if (typeof systemLevel === "number") {
    return toNumber(systemLevel);
  }
  if (systemLevel && typeof systemLevel === "object") {
    return toNumber(systemLevel.value);
  }
  return null;
}

function getEntrySlug(entry: PackIndexEntry): string | null {
  const value = entry.system?.slug ?? entry.slug;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getEntryName(entry: PackIndexEntry): string | null {
  if (typeof entry.name !== "string") return null;
  const trimmed = entry.name.trim();
  return trimmed ? trimmed : null;
}

function getEntryId(entry: PackIndexEntry): string | null {
  const id = entry._id ?? entry.id;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed ? trimmed : null;
}

function getEntryType(entry: PackIndexEntry): string | null {
  if (typeof entry.type !== "string") return null;
  const trimmed = entry.type.trim();
  return trimmed ? trimmed : null;
}

function extractPacks(collection: unknown): AnyCompendium[] {
  if (!collection) {
    return [];
  }

  if (Array.isArray(collection)) {
    return collection as AnyCompendium[];
  }

  const packs = collection as {
    values?: () => Iterable<AnyCompendium>;
    contents?: unknown;
  };

  if (typeof packs.values === "function") {
    return Array.from(packs.values());
  }

  if (Array.isArray(packs.contents)) {
    return packs.contents as AnyCompendium[];
  }

  return [];
}

function getAllPacks(): AnyCompendium[] {
  const currentGame = (globalThis as { game?: Game }).game;
  return extractPacks(currentGame?.packs);
}

function getPackCollection(pack: AnyCompendium): string {
  const candidate = pack as { collection?: unknown; metadata?: { id?: unknown } };
  if (typeof candidate.collection === "string") {
    return candidate.collection;
  }
  const metadataId = candidate.metadata?.id;
  if (typeof metadataId === "string") {
    return metadataId;
  }
  return "";
}

function isItemPack(pack: AnyCompendium): boolean {
  const candidate = pack as {
    documentName?: unknown;
    metadata?: { type?: unknown; entity?: unknown };
  };

  if (typeof candidate.documentName === "string") {
    return candidate.documentName === "Item";
  }

  const type = candidate.metadata?.type;
  if (typeof type === "string") {
    return type === "Item";
  }

  const entity = candidate.metadata?.entity;
  return typeof entity === "string" ? entity === "Item" : true;
}

function getPf2eItemPacks(): AnyCompendium[] {
  return getAllPacks()
    .filter((pack) => isItemPack(pack))
    .filter((pack) => {
      const collection = getPackCollection(pack);
      return collection.startsWith("pf2e.");
    });
}

function getPrioritizedPacks(kind: OfficialItemKind): AnyCompendium[] {
  const packs = getPf2eItemPacks();
  if (!packs.length) {
    return [];
  }

  const priorities = PACK_PRIORITY[kind] ?? [];
  const byId = new Map<string, AnyCompendium>();
  for (const pack of packs) {
    const collection = getPackCollection(pack);
    if (collection) {
      byId.set(collection, pack);
    }
  }

  const ordered: AnyCompendium[] = [];
  const seen = new Set<AnyCompendium>();

  for (const id of priorities) {
    const pack = byId.get(id);
    if (pack && !seen.has(pack)) {
      ordered.push(pack);
      seen.add(pack);
    }
  }

  for (const pack of packs) {
    if (!seen.has(pack)) {
      ordered.push(pack);
      seen.add(pack);
    }
  }

  return ordered;
}

async function getPackIndex(pack: AnyCompendium): Promise<PackIndexEntry[]> {
  if (typeof pack.getIndex === "function") {
    const index = await pack.getIndex({ fields: [...INDEX_FIELDS] as any });
    return extractIndexEntries(index);
  }

  return extractIndexEntries((pack as { index?: unknown }).index);
}

function extractIndexEntries(index: unknown): PackIndexEntry[] {
  if (!index) {
    return [];
  }
  if (Array.isArray(index)) {
    return index as PackIndexEntry[];
  }

  const entries: PackIndexEntry[] = [];
  const candidate = index as {
    values?: () => Iterable<unknown>;
    contents?: unknown;
  };

  if (typeof candidate.values === "function") {
    for (const value of candidate.values()) {
      entries.push(value as PackIndexEntry);
    }
    return entries;
  }

  if (Array.isArray(candidate.contents)) {
    return candidate.contents as PackIndexEntry[];
  }

  return entries;
}

function isTypeCompatible(kind: OfficialItemKind, entryType: string | null): boolean {
  if (!entryType) {
    return true;
  }

  switch (kind) {
    case "spell":
      return entryType === "spell";
    case "action":
      return entryType === "action";
    case "effect":
      return entryType === "effect";
    case "condition":
      return entryType === "condition";
    case "item":
    default:
      return true;
  }
}

function matchBySlug(
  entries: PackIndexEntry[],
  slug: string,
  kind: OfficialItemKind,
): PackIndexEntry | null {
  const normalizedSlug = normalizeKey(slug);
  if (!normalizedSlug) return null;

  for (const entry of entries) {
    const candidate = getEntrySlug(entry);
    if (!candidate) continue;
    if (!isTypeCompatible(kind, getEntryType(entry))) continue;
    if (normalizeKey(candidate) === normalizedSlug) {
      return entry;
    }
  }

  return null;
}

function matchByName(
  entries: PackIndexEntry[],
  name: string,
  kind: OfficialItemKind,
  level: number | null,
): PackIndexEntry | null {
  const normalizedName = normalizeKey(name);
  if (!normalizedName) return null;

  let fallback: PackIndexEntry | null = null;

  for (const entry of entries) {
    const candidate = getEntryName(entry);
    if (!candidate) continue;
    if (!isTypeCompatible(kind, getEntryType(entry))) continue;
    if (normalizeKey(candidate) !== normalizedName) continue;

    if (level === null || kind !== "spell") {
      return entry;
    }

    const entryLevel = getEntryLevel(entry);
    if (entryLevel === null) {
      fallback ??= entry;
      continue;
    }

    if (entryLevel === level) {
      return entry;
    }

    fallback ??= entry;
  }

  return fallback;
}

function buildCompendiumUuid(packCollection: string, documentId: string): string {
  return `Compendium.${packCollection}.Item.${documentId}`;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureCompendiumSource(
  source: Record<string, unknown>,
  uuid: string,
): Record<string, unknown> {
  const next = clone(source);
  const stats = (next._stats && typeof next._stats === "object")
    ? { ...(next._stats as Record<string, unknown>) }
    : {};
  stats.compendiumSource = uuid;
  next._stats = stats;
  return next;
}

async function getDocumentSource(
  pack: AnyCompendium,
  entry: PackIndexEntry,
): Promise<OfficialItemMatch | null> {
  const documentId = getEntryId(entry);
  if (!documentId || typeof pack.getDocument !== "function") {
    return null;
  }

  const document = await pack.getDocument(documentId);
  if (!document) {
    return null;
  }

  const rawSource = (document as { toObject?: () => Record<string, unknown> }).toObject?.();
  const base = rawSource && typeof rawSource === "object" ? rawSource : clone(document as unknown as Record<string, unknown>);
  const collection = getPackCollection(pack);
  const uuid = (document as { uuid?: unknown }).uuid;
  const resolvedUuid = typeof uuid === "string" && uuid ? uuid : buildCompendiumUuid(collection, documentId);

  return {
    packId: collection,
    documentId,
    uuid: resolvedUuid,
    source: ensureCompendiumSource(base, resolvedUuid),
  };
}

export async function resolveOfficialItem(
  lookup: OfficialItemLookup,
): Promise<OfficialItemMatch | null> {
  const slug = lookup.slug?.trim() ?? "";
  const name = lookup.name?.trim() ?? "";
  const level = toNumber(lookup.level ?? null);

  if (!slug && !name) {
    return null;
  }

  const packs = getPrioritizedPacks(lookup.kind);
  for (const pack of packs) {
    const index = await getPackIndex(pack);
    if (!index.length) {
      continue;
    }

    let entry: PackIndexEntry | null = null;
    if (slug) {
      entry = matchBySlug(index, slug, lookup.kind);
    }
    if (!entry && name) {
      entry = matchByName(index, name, lookup.kind, level);
    }
    if (!entry) {
      continue;
    }

    const resolved = await getDocumentSource(pack, entry);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function stripEmbeddedDocumentMetadata(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const next = clone(source);
  delete next.folder;
  delete next.ownership;
  delete next.sort;
  return next;
}
