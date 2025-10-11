import type { ActionSchemaData, ActorSchemaData, ItemSchemaData } from "../schemas";
import { validate, formatError } from "../helpers/validation";

const DEFAULT_ACTION_IMAGE = "systems/pf2e/icons/default-icons/action.svg" as const;
const DEFAULT_ITEM_IMAGE = "systems/pf2e/icons/default-icons/item.svg" as const;
const DEFAULT_ACTOR_IMAGE = "systems/pf2e/icons/default-icons/monster.svg" as const;

const ACTION_TYPE_MAP: Record<ActionSchemaData["actionType"], { value: string; count: number | null }> = {
  "one-action": { value: "one", count: 1 },
  "two-actions": { value: "two", count: 2 },
  "three-actions": { value: "three", count: 3 },
  free: { value: "free", count: null },
  reaction: { value: "reaction", count: null }
};

const GLYPH_MAP: Record<string, string> = {
  "one-action": "1",
  "two-actions": "2",
  "three-actions": "3",
  reaction: "r",
  "free-action": "f",
  free: "f"
};

interface PackIndexEntry {
  _id?: string;
  id?: string;
  name?: string;
  slug?: string | null;
  system?: { slug?: string | null };
}

type ImportOptions = {
  packId?: string;
  folderId?: string;
};

type FoundryActionSource = {
  name: string;
  type: "action";
  img: string;
  system: {
    slug: string;
    description: { value: string };
    traits: { value: string[]; rarity: string };
    actionType: { value: string };
    actions: { value: number | null };
    requirements: { value: string };
    source: { value: string };
    rules: unknown[];
  };
  folder?: string;
};

type FoundryItemSource = {
  name: string;
  type: string;
  img: string;
  system: {
    slug: string;
    description: { value: string };
    traits: { value: string[]; rarity: string };
    level: { value: number };
    price: { value: Record<string, number> };
    source: { value: string };
    rules: unknown[];
  };
  folder?: string;
};

type FoundryActorSource = {
  name: string;
  type: string;
  img: string;
  system: {
    slug: string;
    traits: { value: string[]; rarity: string; languages: { value: string[] } };
    details: { level: { value: number }; source: { value: string } };
  };
  folder?: string;
};

function ensureValidAction(data: ActionSchemaData): void {
  const validation = validate("action", data);
  if (validation.ok) {
    return;
  }

  const messages = validation.errors.map((error) => formatError(error));
  throw new Error(`Action JSON failed validation:\n${messages.join("\n")}`);
}

function trimArray(values: readonly string[] | undefined): string[] {
  if (!values?.length) {
    return [];
  }

  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function applyInlineFormatting(text: string): string {
  const glyphPattern = /\[(one-action|two-actions|three-actions|reaction|free-action|free)\]/gi;
  const boldPattern = /\*\*(.+?)\*\*/g;
  const italicPattern = /(^|[^*])\*(?!\s)([^*]+?)\*/g;
  const codePattern = /`([^`]+?)`/g;

  let formatted = text;
  formatted = formatted.replace(glyphPattern, (_match, group: string) => {
    const token = group.toLowerCase();
    const glyph = GLYPH_MAP[token];
    return glyph ? `<span class="pf2-icon">${glyph}</span>` : _match;
  });

  formatted = formatted.replace(boldPattern, "<strong>$1</strong>");
  formatted = formatted.replace(italicPattern, (_match, prefix: string, content: string) => `${prefix}<em>${content}</em>`);
  formatted = formatted.replace(codePattern, "<code>$1</code>");

  return formatted;
}

function buildParagraph(lines: string[]): string {
  const content = lines.map((line) => applyInlineFormatting(line)).join("<br />");
  return `<p>${content}</p>`;
}

function buildList(items: string[]): string {
  const entries = items.map((item) => `<li>${applyInlineFormatting(item)}</li>`).join("");
  return `<ul>${entries}</ul>`;
}

function toRichText(text: string | undefined): string {
  const value = text?.trim();
  if (!value) {
    return "";
  }

  const lines = value.split(/\r?\n/);
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }

    blocks.push(buildParagraph(paragraph));
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) {
      return;
    }

    blocks.push(buildList(listItems));
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const bulletMatch = line.match(/^(?:[-*•]\s+)(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      listItems.push(bulletMatch[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.join("");
}

function priceToCoins(price: number | undefined): Record<string, number> {
  if (!price || price <= 0) {
    return { pp: 0, gp: 0, sp: 0, cp: 0 }; 
  }

  const copperTotal = Math.round(price * 100);
  const pp = Math.floor(copperTotal / 1000);
  let remainder = copperTotal % 1000;
  const gp = Math.floor(remainder / 100);
  remainder %= 100;
  const sp = Math.floor(remainder / 10);
  remainder %= 10;
  const cp = remainder;

  return { pp, gp, sp, cp };
}

function matchesSlug(candidate: unknown, slug: string): boolean {
  if (!candidate) {
    return false;
  }

  const doc = candidate as { system?: { slug?: string | null }; slug?: string | null };
  const value = doc.system?.slug ?? doc.slug;
  return typeof value === "string" && value === slug;
}

function extractIndexEntries(index: unknown): PackIndexEntry[] {
  if (!index) {
    return [];
  }

  if (Array.isArray(index)) {
    return index as PackIndexEntry[];
  }

  const result: PackIndexEntry[] = [];
  const candidate = index as { values?: () => Iterable<unknown>; contents?: unknown };

  if (typeof candidate.values === "function") {
    for (const entry of candidate.values() as Iterable<PackIndexEntry>) {
      result.push(entry);
    }
    return result;
  }

  const contents = (candidate as { contents?: unknown }).contents;
  if (Array.isArray(contents)) {
    return contents as PackIndexEntry[];
  }

  if (contents && typeof (contents as { values?: () => Iterable<unknown> }).values === "function") {
    for (const entry of (contents as { values: () => Iterable<unknown> }).values() as Iterable<PackIndexEntry>) {
      result.push(entry);
    }
  }

  return result;
}

async function findPackDocument(pack: CompendiumCollection<Item>, slug: string): Promise<Item | undefined> {
  const indexEntries = extractIndexEntries(pack.index);
  let entry = indexEntries.find((item) => matchesSlug(item, slug));

  if (!entry && typeof pack.getIndex === "function") {
    const index = await pack.getIndex({ fields: ["slug", "system.slug"] });
    const candidates = extractIndexEntries(index);
    entry = candidates.find((item) => matchesSlug(item, slug));
  }

  if (!entry) {
    return undefined;
  }

  const id = entry._id ?? entry.id;
  if (!id) {
    return undefined;
  }

  const existing = await pack.getDocument(id);
  return existing ?? undefined;
}

function findWorldItem(slug: string): Item | undefined {
  const collection = (game as Game).items as unknown;
  if (!collection) {
    return undefined;
  }

  const items = Array.isArray(collection)
    ? collection
    : (collection as { contents?: unknown; values?: () => Iterable<unknown>; find?: (predicate: (item: Item) => boolean) => Item | undefined });

  if (typeof items.find === "function") {
    const found = items.find((item: Item) => matchesSlug(item, slug));
    if (found) {
      return found;
    }
  }

  const contentsCandidate = (items as { contents?: unknown }).contents;
  if (Array.isArray(contentsCandidate)) {
    for (const item of contentsCandidate as Item[]) {
      if (matchesSlug(item, slug)) {
        return item;
      }
    }
  } else if (contentsCandidate && typeof (contentsCandidate as { values?: () => Iterable<Item> }).values === "function") {
    for (const item of (contentsCandidate as { values: () => Iterable<Item> }).values()) {
      if (matchesSlug(item, slug)) {
        return item;
      }
    }
  }

  if (typeof (items as { values?: () => Iterable<Item> }).values === "function") {
    for (const item of (items as { values: () => Iterable<Item> }).values()!) {
      if (matchesSlug(item, slug)) {
        return item;
      }
    }
  }

  return undefined;
}

function prepareActionSource(action: ActionSchemaData): FoundryActionSource {
  const actionType = ACTION_TYPE_MAP[action.actionType];
  const traits = trimArray(action.traits);
  const description = toRichText(action.description);
  const requirements = toRichText(action.requirements);

  return {
    name: action.name,
    type: "action",
    img: action.img?.trim() || DEFAULT_ACTION_IMAGE,
    system: {
      slug: action.slug,
      description: { value: description },
      traits: { value: traits, rarity: action.rarity ?? "common" },
      actionType: { value: actionType.value },
      actions: { value: actionType.count },
      requirements: { value: requirements },
      source: { value: "" },
      rules: []
    }
  };
}

function prepareItemSource(item: ItemSchemaData): FoundryItemSource {
  const traits = trimArray(item.traits);
  const description = toRichText(item.description);

  return {
    name: item.name,
    type: item.itemType,
    img: item.img?.trim() || DEFAULT_ITEM_IMAGE,
    system: {
      slug: item.slug,
      description: { value: description },
      traits: { value: traits, rarity: item.rarity },
      level: { value: item.level },
      price: { value: priceToCoins(item.price) },
      source: { value: "" },
      rules: []
    }
  };
}

function prepareActorSource(actor: ActorSchemaData): FoundryActorSource {
  const traits = trimArray(actor.traits);
  const languages = trimArray(actor.languages);

  return {
    name: actor.name,
    type: actor.actorType,
    img: actor.img?.trim() || DEFAULT_ACTOR_IMAGE,
    system: {
      slug: actor.slug,
      traits: {
        value: traits,
        rarity: actor.rarity,
        languages: { value: languages }
      },
      details: {
        level: { value: actor.level },
        source: { value: "" }
      }
    }
  };
}

export function toFoundryActionData(action: ActionSchemaData): FoundryActionSource {
  return prepareActionSource(action);
}

export function toFoundryItemData(item: ItemSchemaData): FoundryItemSource {
  return prepareItemSource(item);
}

export function toFoundryActorData(actor: ActorSchemaData): FoundryActorSource {
  return prepareActorSource(actor);
}

export async function importAction(
  json: ActionSchemaData,
  options: ImportOptions = {}
): Promise<Item> {
  ensureValidAction(json);
  const source = prepareActionSource(json);
  const { packId, folderId } = options;

  if (folderId) {
    source.folder = folderId;
  }

  if (packId) {
    const pack = game.packs?.get(packId) as CompendiumCollection<Item> | undefined;
    if (!pack) {
      throw new Error(`Pack with id "${packId}" was not found.`);
    }

    const existing = await findPackDocument(pack, json.slug);
    if (existing) {
      const updateData = { ...source } as Record<string, unknown>;
      if (folderId) {
        updateData.folder = folderId;
      }

      await existing.update(updateData);
      return existing;
    }

    const imported = await pack.importDocument(source, { keepId: true });
    if (!imported) {
      throw new Error(`Failed to import action "${json.name}" into pack ${pack.collection}`);
    }

    return imported;
  }

  const existing = findWorldItem(json.slug);
  if (existing) {
    const updateData = { ...source } as Record<string, unknown>;
    if (folderId) {
      updateData.folder = folderId;
    }

    await existing.update(updateData);
    return existing;
  }

  const created = await Item.create(source, { keepId: true });
  if (!created) {
    throw new Error(`Failed to create action "${json.name}" in the world.`);
  }

  return created;
}
