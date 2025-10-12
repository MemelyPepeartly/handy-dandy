import type {
  ActionSchemaData,
  ActorGenerationResult,
  ActorSchemaData,
  ItemSchemaData,
  PublicationData,
  SystemId,
} from "../schemas";
import { PUBLICATION_DEFAULT } from "../schemas";
import { validate, formatError } from "../helpers/validation";

const DEFAULT_ACTION_IMAGE = "systems/pf2e/icons/default-icons/action.svg" as const;
const DEFAULT_ITEM_IMAGE = "systems/pf2e/icons/default-icons/item.svg" as const;
const DEFAULT_ACTOR_IMAGE = "systems/pf2e/icons/default-icons/npc.svg" as const;
const DEFAULT_STRIKE_IMAGE = "systems/pf2e/icons/default-icons/melee.svg" as const;
const DEFAULT_SPELL_IMAGE = "systems/pf2e/icons/default-icons/spell.svg" as const;
const DEFAULT_SPELLCASTING_IMAGE = "systems/pf2e/icons/default-icons/spellcastingEntry.svg" as const;

type Pf2eFrequencyInterval = "round" | "turn" | "PT1M" | "PT10M" | "PT1H" | "day";

const PF2E_FREQUENCY_INTERVALS = new Set<Pf2eFrequencyInterval>([
  "round",
  "turn",
  "PT1M",
  "PT10M",
  "PT1H",
  "day",
]);

function normalizeTraitKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getPf2eActionTraits(): Set<string> {
  const config = (globalThis as { CONFIG?: unknown }).CONFIG;
  const pf2eConfig = (config as { PF2E?: unknown })?.PF2E;
  const traitSource = (pf2eConfig as { actionTraits?: unknown })?.actionTraits;

  const traits = new Set<string>();

  const collect = (value: unknown): void => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") {
          const normalized = normalizeTraitKey(entry);
          if (normalized) traits.add(normalized);
        }
      }
      return;
    }
    if (value instanceof Map) {
      for (const key of value.keys()) {
        if (typeof key === "string") {
          const normalized = normalizeTraitKey(key);
          if (normalized) traits.add(normalized);
        }
      }
      return;
    }
    if (typeof value === "object") {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        const normalized = normalizeTraitKey(key);
        if (normalized) traits.add(normalized);
      }
    }
  };

  collect(traitSource);

  return traits;
}

type ActorSpellcastingEntry = NonNullable<ActorSchemaData["spellcasting"]>[number];

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

function generateId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = typeof globalThis.crypto?.getRandomValues === "function" ? new Uint32Array(16) : undefined;
  if (bytes) {
    globalThis.crypto.getRandomValues(bytes);
    let id = "";
    for (const byte of bytes) {
      id += alphabet[byte % alphabet.length];
    }
    return id;
  }
  let id = "";
  for (let index = 0; index < 16; index += 1) {
    const random = Math.floor(Math.random() * alphabet.length);
    id += alphabet[random];
  }
  return id;
}

const generatedIdCache = new Map<string, string>();

function generateStableId(key: string): string {
  let id = generatedIdCache.get(key);
  if (!id) {
    id = generateId();
    generatedIdCache.set(key, id);
  }
  return id;
}

interface PackIndexEntry {
  _id?: string;
  id?: string;
  name?: string;
  slug?: string | null;
  system?: { slug?: string | null };
}

export type ImportOptions = {
  packId?: string;
  folderId?: string;
};

type ItemCompendium = CompendiumCollection<CompendiumCollection.Metadata & { type: "Item" }>;
type ActorCompendium = CompendiumCollection<CompendiumCollection.Metadata & { type: "Actor" }>;

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
    publication: { title: string; authors: string; license: string; remaster: boolean };
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
    publication: { title: string; authors: string; license: string; remaster: boolean };
    rules: unknown[];
  };
  folder?: string;
};

type FoundryActorStrikeSource = {
  _id: string;
  name: string;
  type: "melee";
  img: string;
  system: {
    slug: string;
    bonus: { value: number };
    damageRolls: Record<string, { damage: string; damageType: string | null; category: string | null }>;
    traits: { value: string[]; otherTags: string[] };
    rules: unknown[];
    description: { value: string; gm: string };
    publication: { title: string; authors: string; license: string; remaster: boolean };
    attackEffects: { value: string[] };
  };
  effects: unknown[];
  folder: null;
  sort: number;
  flags: Record<string, unknown>;
};

type FoundryActorActionSource = {
  _id: string;
  name: string;
  type: "action";
  img: string;
  system: {
    actionType: { value: string };
    actions: { value: number | null };
    category: string;
    traits: { value: string[]; otherTags: string[] };
    description: { value: string; gm: string };
    requirements: { value: string };
    trigger: { value: string };
    frequency: FoundryFrequencySource | null;
    rules: unknown[];
    publication: { title: string; authors: string; license: string; remaster: boolean };
  };
  effects: unknown[];
  folder: null;
  sort: number;
  flags: Record<string, unknown>;
};

type FoundryFrequencySource = {
  value?: number;
  max: number;
  per: Pf2eFrequencyInterval;
};

type FoundryActorSpellcastingEntrySource = {
  _id: string;
  name: string;
  type: "spellcastingEntry";
  img: string;
  system: {
    description: { value: string; gm: string };
    rules: unknown[];
    slug: string | null;
    _migration: { version: number; lastMigration: number | null };
    traits: { otherTags: string[] };
    publication: { title: string; authors: string; license: string; remaster: boolean };
    ability: { value: string };
    spelldc: { value: number; dc: number };
    tradition: { value: string };
    prepared: { value: string };
    showSlotlessLevels: { value: boolean };
    proficiency: { value: number };
    slots: Record<string, { prepared: unknown[]; value: number; max: number }>;
    autoHeightenLevel: { value: number | null };
  };
  effects: unknown[];
  folder: null;
  sort: number;
  flags: Record<string, unknown>;
};

type FoundryActorSpellSource = {
  _id: string;
  name: string;
  type: "spell";
  img: string;
  system: {
    description: { value: string; gm: string };
    rules: unknown[];
    slug: string | null;
    _migration: { version: number; lastMigration: number | null };
    traits: {
      otherTags: string[];
      value: string[];
      rarity: string;
      traditions: string[];
    };
    publication: { title: string; authors: string; license: string; remaster: boolean };
    level: { value: number };
    requirements: string;
    target: { value: string };
    range: { value: string };
    area: { value: number | null; type: string | null };
    time: { value: string };
    duration: { value: string; sustained: boolean };
    damage: Record<string, unknown>;
    defense: {
      passive: { statistic: string };
      save: { statistic: string; basic: boolean };
    };
    cost: { value: string };
    location: { value: string };
    counteraction: boolean;
    heightening: {
      type: string | null;
      interval: number | null;
      damage: Record<string, unknown>;
      area: number | null;
    };
  };
  effects: unknown[];
  folder: null;
  sort: number;
  flags: Record<string, unknown>;
};

type FoundryActorItemSource =
  | FoundryActorStrikeSource
  | FoundryActorActionSource
  | FoundryActorSpellcastingEntrySource
  | FoundryActorSpellSource;

type FoundrySense = {
  type: string;
  acuity?: "precise" | "imprecise" | "vague";
  range?: number;
};

type FoundryActorSource = {
  name: string;
  type: string;
  img: string;
  system: {
    slug: string;
    traits: {
      value: string[];
      rarity: string;
      size: { value: string };
      otherTags: string[];
    };
    details: {
      level: { value: number };
      alignment: { value: string };
      publicNotes: string;
      privateNotes: string;
      blurb: string;
      languages: { value: string[]; details: string };
      source: { value: string };
      publication: { title: string; authors: string; license: string; remaster: boolean };
    };
    initiative: { statistic: string };
    attributes: {
      hp: { value: number; max: number; temp: number; details: string };
      ac: { value: number; details: string };
      speed: {
        value: number;
        details: string;
        otherSpeeds: { type: string; value: number; details: string }[];
      };
      immunities: { type: string; exceptions: string[]; notes: string }[];
      weaknesses: { type: string; value: number; exceptions: string[]; notes: string }[];
      resistances: { type: string; value: number; exceptions: string[]; doubleVs: string[]; notes: string }[];
      allSaves: { value: string };
    };
    resources: Record<string, unknown>;
    _migration: {
      version: number;
      previous: { schema: number; foundry: string; system: string };
    };
    perception: { mod: number; details: string; senses: FoundrySense[]; vision: boolean };
    saves: {
      fortitude: { value: number; saveDetail: string };
      reflex: { value: number; saveDetail: string };
      will: { value: number; saveDetail: string };
    };
    abilities: Record<string, { mod: number }>;
    skills: Record<string, { value: number; base: number; details: string }>;
  };
  prototypeToken: Record<string, unknown>;
  items: FoundryActorItemSource[];
  effects: unknown[];
  folder: string | null;
  flags: Record<string, unknown>;
};

function ensureValidAction(data: ActionSchemaData): void {
  const validation = validate("action", data);
  if (validation.ok) {
    return;
  }

  const messages = validation.errors.map((error) => formatError(error));
  throw new Error(`Action JSON failed validation:\n${messages.join("\n")}`);
}

function trimArray(values: readonly string[] | null | undefined): string[] {
  if (!values?.length) {
    return [];
  }

  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function sanitizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizePublicationDetails(
  publication: PublicationData | null | undefined,
  fallbackTitle: string,
): PublicationData {
  const fallback = sanitizeText(fallbackTitle);
  const titleValue = typeof publication?.title === "string" ? publication.title.trim() : undefined;
  const authorsValue = typeof publication?.authors === "string" ? publication.authors.trim() : undefined;
  const licenseValue = typeof publication?.license === "string" ? publication.license.trim() : undefined;
  const remasterValue = typeof publication?.remaster === "boolean" ? publication.remaster : undefined;

  return {
    title: titleValue !== undefined ? titleValue : fallback || PUBLICATION_DEFAULT.title,
    authors: authorsValue !== undefined ? authorsValue : PUBLICATION_DEFAULT.authors,
    license: licenseValue !== undefined ? licenseValue : PUBLICATION_DEFAULT.license,
    remaster: remasterValue ?? PUBLICATION_DEFAULT.remaster,
  };
}

const SENSE_ACUITIES = new Set<NonNullable<FoundrySense["acuity"]>>([
  "precise",
  "imprecise",
  "vague",
]);

function buildActorSenses(
  senses: readonly (string | { type?: unknown; acuity?: unknown; range?: unknown })[] | null | undefined,
): FoundrySense[] {
  if (!senses?.length) {
    return [];
  }

  return senses
    .map((sense) => normalizeSenseEntry(sense))
    .filter((entry): entry is FoundrySense => entry !== null);
}

function normalizeSenseEntry(sense: unknown): FoundrySense | null {
  if (!sense) {
    return null;
  }

  if (typeof sense === "object") {
    const record = sense as { type?: unknown; acuity?: unknown; range?: unknown };
    const type = normalizeSenseType(record.type);
    if (!type) {
      return null;
    }

    const normalized: FoundrySense = { type };
    const acuity = normalizeSenseAcuity(record.acuity);
    if (acuity) {
      normalized.acuity = acuity;
    }

    const range = normalizeSenseRange(record.range);
    if (range !== null) {
      normalized.range = range;
    }

    return normalized;
  }

  if (typeof sense !== "string") {
    return null;
  }

  let text = sense.trim();
  if (!text) {
    return null;
  }

  let acuity: FoundrySense["acuity"] | undefined;
  let range: number | undefined;

  for (const match of text.matchAll(/\(([^)]+)\)/g)) {
    const inner = match[1];
    if (!acuity) {
      acuity = normalizeSenseAcuity(inner);
    }
    if (range === undefined) {
      range = normalizeSenseRange(inner) ?? undefined;
    }
  }

  text = text.replace(/\([^)]*\)/g, " ").trim();

  if (!acuity) {
    const prefixMatch = text.match(/^(precise|imprecise|vague)\s+/i);
    if (prefixMatch) {
      acuity = normalizeSenseAcuity(prefixMatch[1]);
      text = text.slice(prefixMatch[0].length);
    }
  }

  if (range === undefined) {
    range = normalizeSenseRange(text) ?? undefined;
  }

  text = text
    .replace(
      /(\d+(?:\.\d+)?)\s*(?:-|–)?\s*(foot|feet|ft|meter|metre|meters|metres|mile|miles|yard|yards)\b/gi,
      " ",
    )
    .replace(/\d+(?:\.\d+)?/g, " ")
    .trim();

  const type = normalizeSenseType(text);
  if (!type) {
    return null;
  }

  const normalized: FoundrySense = { type };
  if (acuity) {
    normalized.acuity = acuity;
  }
  if (typeof range === "number" && Number.isFinite(range) && range > 0) {
    normalized.range = Math.round(range);
  }

  return normalized;
}

function normalizeSenseType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const slug = trimmed
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length ? slug : null;
}

function normalizeSenseAcuity(value: unknown): FoundrySense["acuity"] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (SENSE_ACUITIES.has(normalized as NonNullable<FoundrySense["acuity"]>)) {
    return normalized as FoundrySense["acuity"];
  }

  return undefined;
}

function normalizeSenseRange(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const rangeMatch = value.match(/(\d+(?:\.\d+)?)/);
  if (!rangeMatch) {
    return null;
  }

  const amount = Number.parseFloat(rangeMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unitMatch = value.match(
    /(foot|feet|ft|meter|metre|meters|metres|mile|miles|yard|yards)/i,
  );
  const unit = unitMatch?.[1]?.toLowerCase();

  const conversion: Record<string, number> = {
    foot: 1,
    feet: 1,
    ft: 1,
    yard: 3,
    yards: 3,
    meter: 3.28084,
    metres: 3.28084,
    metre: 3.28084,
    meters: 3.28084,
    mile: 5280,
    miles: 5280,
  };

  const factor = unit ? conversion[unit] ?? 1 : 1;
  return Math.round(amount * factor);
}

function resolveActiveSystemId(): string | undefined {
  const system = (game as Game | undefined)?.system as
    | { id?: unknown; data?: { id?: unknown } }
    | undefined;
  if (!system) {
    return undefined;
  }

  if (typeof system.id === "string") {
    return system.id;
  }

  const legacyId = (system as { data?: { id?: unknown } }).data?.id;
  return typeof legacyId === "string" ? legacyId : undefined;
}

function assertSystemCompatibility(expected: SystemId): void {
  const active = resolveActiveSystemId();
  if (active && active !== expected) {
    throw new Error(
      `System ID mismatch: payload targets "${expected}" but the active system is "${active}".`,
    );
  }
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

function toRichText(text: string | null | undefined): string {
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

function priceToCoins(price: number | null | undefined): Record<string, number> {
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

async function findPackDocument(pack: ItemCompendium, slug: string): Promise<Item | undefined> {
  const indexEntries = extractIndexEntries(pack.index);
  let entry = indexEntries.find((item) => matchesSlug(item, slug));

  if (!entry && typeof pack.getIndex === "function") {
    const index = await pack.getIndex({ fields: ["slug", "system.slug"] as any });
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

  const existing = (await pack.getDocument(id)) as Item | null | undefined;
  return existing ?? undefined;
}

async function findActorPackDocument(pack: ActorCompendium, slug: string): Promise<Actor | undefined> {
  const indexEntries = extractIndexEntries(pack.index);
  let entry = indexEntries.find((item) => matchesSlug(item, slug));

  if (!entry && typeof pack.getIndex === "function") {
    const index = await pack.getIndex({ fields: ["slug", "system.slug"] as any });
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

  const existing = (await pack.getDocument(id)) as Actor | null | undefined;
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

function findWorldActor(slug: string): Actor | undefined {
  const collection = (game as Game).actors as unknown;
  if (!collection) {
    return undefined;
  }

  const actors = Array.isArray(collection)
    ? collection
    : (collection as { contents?: unknown; values?: () => Iterable<unknown>; find?: (predicate: (actor: Actor) => boolean) => Actor | undefined });

  if (typeof actors.find === "function") {
    const found = actors.find((actor: Actor) => matchesSlug(actor, slug));
    if (found) {
      return found;
    }
  }

  const contentsCandidate = (actors as { contents?: unknown }).contents;
  if (Array.isArray(contentsCandidate)) {
    for (const actor of contentsCandidate as Actor[]) {
      if (matchesSlug(actor, slug)) {
        return actor;
      }
    }
  } else if (contentsCandidate && typeof (contentsCandidate as { values?: () => Iterable<Actor> }).values === "function") {
    for (const actor of (contentsCandidate as { values: () => Iterable<Actor> }).values()) {
      if (matchesSlug(actor, slug)) {
        return actor;
      }
    }
  }

  if (typeof (actors as { values?: () => Iterable<Actor> }).values === "function") {
    for (const actor of (actors as { values: () => Iterable<Actor> }).values()!) {
      if (matchesSlug(actor, slug)) {
        return actor;
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
  const source = action.source?.trim() ?? "";
  const publication = normalizePublicationDetails(action.publication, source);

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
      source: { value: source },
      publication,
      rules: []
    }
  };
}

function prepareItemSource(item: ItemSchemaData): FoundryItemSource {
  const traits = trimArray(item.traits);
  const description = toRichText(item.description);
  const source = item.source?.trim() ?? "";
  const publication = normalizePublicationDetails(item.publication, source);

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
      source: { value: source },
      publication,
      rules: []
    }
  };
}

function prepareActorSource(actor: ActorSchemaData): FoundryActorSource {
  const traits = trimArray(actor.traits).map((value) => value.toLowerCase());
  const languages = trimArray(actor.languages).map((value) => value.toLowerCase());
  const source = sanitizeText(actor.source);
  const publication = normalizePublicationDetails(actor.publication, source);
  const description = toRichText(actor.description);
  const privateNotes = toRichText(actor.recallKnowledge);
  const alignment = sanitizeText(actor.alignment);

  const strikes = actor.strikes.map((strike, index) => createStrikeItem(actor, strike, index));
  const actions = actor.actions.map((action, index) => createActionItem(actor, action, index));
  const spellcastingItems =
    actor.spellcasting?.flatMap((entry, index) => createSpellcastingItems(actor, entry, index)) ?? [];

  const items: FoundryActorItemSource[] = [...strikes, ...actions];
  if (spellcastingItems.length) {
    items.push(...spellcastingItems);
  }

  return {
    name: actor.name,
    type: actor.actorType === "npc" ? "npc" : actor.actorType,
    img: actor.img?.trim() || DEFAULT_ACTOR_IMAGE,
    system: {
      slug: actor.slug,
      traits: {
        value: traits,
        rarity: actor.rarity,
        size: { value: actor.size },
        otherTags: [],
      },
      details: {
        level: { value: actor.level },
        alignment: { value: alignment },
        publicNotes: description,
        privateNotes,
        blurb: "",
        languages: { value: languages, details: "" },
        source: { value: source },
        publication,
      },
      initiative: { statistic: "perception" },
      attributes: {
        hp: {
          value: actor.attributes.hp.value,
          max: actor.attributes.hp.max,
          temp: actor.attributes.hp.temp ?? 0,
          details: sanitizeText(actor.attributes.hp.details),
        },
        ac: {
          value: actor.attributes.ac.value,
          details: sanitizeText(actor.attributes.ac.details),
        },
        speed: {
          value: actor.attributes.speed.value,
          details: sanitizeText(actor.attributes.speed.details),
          otherSpeeds: (actor.attributes.speed.other ?? []).map((entry) => ({
            type: entry.type,
            value: entry.value,
            details: sanitizeText(entry.details),
          })),
        },
        immunities: (actor.attributes.immunities ?? []).map((entry) => ({
          type: entry.type,
          exceptions: trimArray(entry.exceptions).map((value) => value.toLowerCase()),
          notes: sanitizeText(entry.details),
        })),
        weaknesses: (actor.attributes.weaknesses ?? []).map((entry) => ({
          type: entry.type,
          value: entry.value,
          exceptions: trimArray(entry.exceptions).map((value) => value.toLowerCase()),
          notes: sanitizeText(entry.details),
        })),
        resistances: (actor.attributes.resistances ?? []).map((entry) => ({
          type: entry.type,
          value: entry.value,
          exceptions: trimArray(entry.exceptions).map((value) => value.toLowerCase()),
          doubleVs: trimArray(entry.doubleVs).map((value) => value.toLowerCase()),
          notes: sanitizeText(entry.details),
        })),
        allSaves: { value: "" },
      },
      resources: {},
      _migration: {
        version: 0.943,
        previous: { schema: 0.942, foundry: "13.348", system: "7.5.2" },
      },
      perception: {
        mod: actor.attributes.perception.value,
        details: sanitizeText(actor.attributes.perception.details),
        senses: buildActorSenses(actor.attributes.perception.senses),
        vision: true,
      },
      saves: {
        fortitude: {
          value: actor.attributes.saves.fortitude.value,
          saveDetail: sanitizeText(actor.attributes.saves.fortitude.details),
        },
        reflex: {
          value: actor.attributes.saves.reflex.value,
          saveDetail: sanitizeText(actor.attributes.saves.reflex.details),
        },
        will: {
          value: actor.attributes.saves.will.value,
          saveDetail: sanitizeText(actor.attributes.saves.will.details),
        },
      },
      abilities: {
        str: { mod: actor.abilities.str },
        dex: { mod: actor.abilities.dex },
        con: { mod: actor.abilities.con },
        int: { mod: actor.abilities.int },
        wis: { mod: actor.abilities.wis },
        cha: { mod: actor.abilities.cha },
      },
      skills: buildSkillMap(actor.skills),
    },
    prototypeToken: buildPrototypeToken(actor),
    items,
    effects: [],
    folder: null,
    flags: {},
  };
}

function prepareGeneratedActorSource(actor: ActorGenerationResult): FoundryActorSource {
  const system = clone((actor.system ?? {}) as FoundryActorSource["system"]);
  system.slug = actor.slug;

  return {
    name: actor.name,
    type: actor.type,
    img: actor.img?.trim() || DEFAULT_ACTOR_IMAGE,
    system,
    prototypeToken: clone(actor.prototypeToken ?? {}),
    items: Array.isArray(actor.items)
      ? (clone(actor.items) as FoundryActorItemSource[])
      : [],
    effects: Array.isArray(actor.effects) ? clone(actor.effects) : [],
    folder: actor.folder ?? null,
    flags: clone((actor.flags ?? {}) as Record<string, unknown>),
  };
}

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ACTION_COST_SYSTEM_MAP: Record<ActorSchemaData["actions"][number]["actionCost"], { type: string; value: number | null }> = {
  "one-action": { type: "action", value: 1 },
  "two-actions": { type: "action", value: 2 },
  "three-actions": { type: "action", value: 3 },
  free: { type: "free", value: null },
  reaction: { type: "reaction", value: null },
  passive: { type: "passive", value: null },
};

const FREQUENCY_NUMBER_WORDS: Record<string, number> = {
  once: 1,
  twice: 2,
  thrice: 3,
  single: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function sanitizeActionTraits(
  traits: ActorSchemaData["actions"][number]["traits"],
): { value: string[]; otherTags: string[] } {
  if (!Array.isArray(traits)) {
    return { value: [], otherTags: [] };
  }

  const allowed: string[] = [];
  const extra: string[] = [];
  const seenAllowed = new Set<string>();
  const seenExtra = new Set<string>();
  const pf2eTraits = getPf2eActionTraits();
  const allowUnknown = pf2eTraits.size === 0;

  for (const value of traits) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = normalizeTraitKey(value);

    if (!normalized) {
      continue;
    }

    if (allowUnknown || pf2eTraits.has(normalized)) {
      if (!seenAllowed.has(normalized)) {
        allowed.push(normalized);
        seenAllowed.add(normalized);
      }
      continue;
    }

    if (!seenExtra.has(normalized)) {
      extra.push(normalized);
      seenExtra.add(normalized);
    }
  }

  return { value: allowed, otherTags: extra };
}

function parseFrequencyCount(token: string): number | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const known = FREQUENCY_NUMBER_WORDS[trimmed];
  if (known !== undefined) {
    return known;
  }
  const numeric = Number.parseInt(trimmed, 10);
  return Number.isNaN(numeric) ? null : numeric;
}

function normalizeFrequencyUnit(text: string): Pf2eFrequencyInterval | null {
  const cleaned = text.split(/[()]/)[0]?.trim();
  if (!cleaned) {
    return null;
  }
  const normalized = cleaned.replace(/\s+/g, " ");
  if (/round/.test(normalized)) {
    return "round";
  }
  if (/turn/.test(normalized)) {
    return "turn";
  }
  if (/10\s*-?\s*minute/.test(normalized)) {
    return "PT10M";
  }
  if (/minute/.test(normalized)) {
    return "PT1M";
  }
  if (/hour/.test(normalized)) {
    return "PT1H";
  }
  if (/day/.test(normalized)) {
    return "day";
  }
  return null;
}

function parseActionFrequency(raw: unknown): FoundryFrequencySource | null {
  if (typeof raw !== "string") {
    return null;
  }

  const normalized = raw.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  let count: number | null = null;
  let unitText: string | null = null;

  const slashMatch = normalized.match(/(\d+)\s*\/\s*(round|turn|day|hour|minute|minutes|10\s*minutes)/);
  if (slashMatch) {
    count = Number.parseInt(slashMatch[1], 10);
    unitText = slashMatch[2];
  } else {
    const perMatch = normalized.match(
      /(once|twice|thrice|single|one|two|three|four|five|six|seven|eight|nine|ten|\d+)(?:\s+times?)?\s+(?:per|each|every)\s+([a-z0-9\s-]+)/,
    );
    if (perMatch) {
      count = parseFrequencyCount(perMatch[1]);
      unitText = perMatch[2];
    }
  }

  if (!unitText) {
    return null;
  }

  const per = normalizeFrequencyUnit(unitText);
  if (!per || !PF2E_FREQUENCY_INTERVALS.has(per)) {
    return null;
  }

  const uses = count ?? 1;
  const max = Math.max(1, uses);
  return {
    value: max,
    max,
    per,
  };
}


function createStrikeItem(
  actor: ActorSchemaData,
  strike: ActorSchemaData["strikes"][number],
  index: number,
): FoundryActorStrikeSource {
  const damageRolls: FoundryActorStrikeSource["system"]["damageRolls"] = {};
  const actorKey = actor.slug || actor.name;
  for (const [damageIndex, damage] of strike.damage.entries()) {
    const id = generateStableId(`strike-damage:${actorKey}:${index}:${damageIndex}`);
    damageRolls[id] = {
      damage: damage.formula,
      damageType: damage.damageType ? damage.damageType.toLowerCase() : null,
      category: null,
    };
  }

  const slug = toSlug(strike.name) || toSlug(generateId());

  return {
    _id: generateStableId(`strike:${actorKey}:${index}`),
    name: strike.name,
    type: "melee",
    img: DEFAULT_STRIKE_IMAGE,
    system: {
      slug,
      bonus: { value: strike.attackBonus },
      damageRolls,
      traits: {
        value: (strike.traits ?? []).map((trait) => trait.toLowerCase()),
        otherTags: [],
      },
      rules: [],
      description: { value: toRichText(strike.description), gm: "" },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      attackEffects: { value: (strike.effects ?? []).map((effect) => effect.toLowerCase()) },
    },
    effects: [],
    folder: null,
    sort: 0,
    flags: {},
  };
}

function createActionItem(
  actor: ActorSchemaData,
  action: ActorSchemaData["actions"][number],
  index: number,
): FoundryActorActionSource {
  const { type, value } = ACTION_COST_SYSTEM_MAP[action.actionCost];
  const traits = sanitizeActionTraits(action.traits);
  const frequency = parseActionFrequency(action.frequency);
  const details: string[] = [];
  if (action.requirements) {
    details.push(`**Requirements** ${action.requirements}`);
  }
  if (action.trigger) {
    details.push(`**Trigger** ${action.trigger}`);
  }
  if (action.frequency) {
    details.push(`**Frequency** ${action.frequency}`);
  }
  details.push(action.description);
  const description = toRichText(details.join("\n"));

  return {
    _id: generateStableId(`action:${actor.slug || actor.name}:${index}`),
    name: action.name,
    type: "action",
    img: DEFAULT_ACTION_IMAGE,
    system: {
      actionType: { value: type },
      actions: { value },
      category: "offensive",
      traits: {
        value: traits.value,
        otherTags: traits.otherTags,
      },
      description: { value: description, gm: "" },
      requirements: { value: action.requirements ?? "" },
      trigger: { value: action.trigger ?? "" },
      frequency: frequency,
      rules: [],
      publication: { title: "", authors: "", license: "OGL", remaster: false },
    },
    effects: [],
    folder: null,
    sort: 0,
    flags: {},
  };
}

function createSpellcastingItems(
  actor: ActorSchemaData,
  entry: ActorSpellcastingEntry,
  index: number,
): FoundryActorItemSource[] {
  const lines: string[] = [];
  if (entry.notes) {
    lines.push(entry.notes);
  }
  if (entry.attackBonus !== undefined && entry.attackBonus !== null) {
    lines.push(`**Spell Attack** ${entry.attackBonus}`);
  }
  if (entry.saveDC !== undefined && entry.saveDC !== null) {
    lines.push(`**Spell DC** ${entry.saveDC}`);
  }
  if (entry.spells.length) {
    const grouped = new Map<number, string[]>();
    for (const spell of entry.spells) {
      const list = grouped.get(spell.level) ?? [];
      list.push(spell.name + (spell.description ? ` — ${spell.description}` : ""));
      grouped.set(spell.level, list);
    }
    const levels = Array.from(grouped.keys()).sort((a, b) => a - b);
    for (const level of levels) {
      const spells = grouped.get(level)!;
      lines.push(`**Level ${level}** ${spells.join("; ")}`);
    }
  }
  if (!lines.length) {
    lines.push(`${entry.name} spellcasting`);
  }

  const description = toRichText(lines.join("\n"));
  const tradition = entry.tradition.toLowerCase();
  const actorKey = actor.slug || actor.name;
  const entryId = generateStableId(`spellcasting-entry:${actorKey}:${index}`);

  const spellcastingEntry: FoundryActorSpellcastingEntrySource = {
    _id: entryId,
    name: `${entry.name} Spellcasting`,
    type: "spellcastingEntry",
    img: DEFAULT_SPELLCASTING_IMAGE,
    system: {
      description: { value: description, gm: "" },
      rules: [],
      slug: null,
      _migration: { version: 0.946, lastMigration: null },
      traits: { otherTags: [] },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      ability: { value: mapTraditionToAbility(tradition) },
      spelldc: { value: entry.saveDC ?? 10, dc: entry.saveDC ?? 10 },
      tradition: { value: tradition },
      prepared: { value: entry.castingType },
      showSlotlessLevels: { value: entry.castingType !== "prepared" && entry.castingType !== "spontaneous" },
      proficiency: { value: 1 },
      slots: buildEmptySpellSlots(),
      autoHeightenLevel: { value: null },
    },
    effects: [],
    folder: null,
    sort: 0,
    flags: {},
  };

  const spells = entry.spells.map((spell, spellIndex) =>
    createSpellItem(actorKey, index, spell, spellIndex, tradition, entryId),
  );

  return [spellcastingEntry, ...spells];
}

function buildEmptySpellSlots(): Record<string, { prepared: unknown[]; value: number; max: number }> {
  const slots: Record<string, { prepared: unknown[]; value: number; max: number }> = {};
  for (let level = 0; level <= 11; level += 1) {
    slots[`slot${level}`] = { prepared: [], value: 0, max: 0 };
  }
  return slots;
}

function mapTraditionToAbility(tradition: string): string {
  const abilityMap: Record<string, string> = {
    arcane: "int",
    divine: "wis",
    occult: "cha",
    primal: "wis",
  };
  return abilityMap[tradition] ?? "cha";
}

function createSpellItem(
  actorKey: string,
  entryIndex: number,
  spell: ActorSpellcastingEntry["spells"][number],
  spellIndex: number,
  defaultTradition: string,
  entryId: string,
): FoundryActorSpellSource {
  const description = toRichText(spell.description ?? "");
  const tradition = (spell.tradition ?? defaultTradition).toLowerCase();

  return {
    _id: generateStableId(`spell:${actorKey}:${entryIndex}:${spellIndex}`),
    name: spell.name,
    type: "spell",
    img: DEFAULT_SPELL_IMAGE,
    system: {
      description: { value: description, gm: "" },
      rules: [],
      slug: null,
      _migration: { version: 0.946, lastMigration: null },
      traits: {
        otherTags: [],
        value: [],
        rarity: "common",
        traditions: tradition ? [tradition] : [],
      },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      level: { value: spell.level },
      requirements: "",
      target: { value: "" },
      range: { value: "" },
      area: { value: null, type: null },
      time: { value: "" },
      duration: { value: "", sustained: false },
      damage: {},
      defense: { passive: { statistic: "" }, save: { statistic: "", basic: false } },
      cost: { value: "" },
      location: { value: entryId },
      counteraction: false,
      heightening: { type: null, interval: null, damage: {}, area: null },
    },
    effects: [],
    folder: null,
    sort: 0,
    flags: {},
  };
}

function buildSkillMap(
  skills: ActorSchemaData["skills"],
): FoundryActorSource["system"]["skills"] {
  const result: FoundryActorSource["system"]["skills"] = {};
  for (const skill of skills) {
    result[skill.slug] = {
      value: skill.modifier,
      base: skill.modifier,
      details: sanitizeText(skill.details),
    };
  }
  return result;
}

const TOKEN_SIZE_MAP: Record<ActorSchemaData["size"], number> = {
  tiny: 1,
  sm: 1,
  med: 1,
  lg: 2,
  huge: 3,
  grg: 4,
};

function buildPrototypeToken(actor: ActorSchemaData): Record<string, unknown> {
  const img = actor.img?.trim() || DEFAULT_ACTOR_IMAGE;
  const tokenSize = TOKEN_SIZE_MAP[actor.size] ?? 1;
  return {
    name: actor.name,
    displayName: 20,
    actorLink: false,
    width: tokenSize,
    height: tokenSize,
    texture: {
      src: img,
      anchorX: 0.5,
      anchorY: 0.5,
      offsetX: 0,
      offsetY: 0,
      fit: "contain",
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      tint: "#ffffff",
      alphaThreshold: 0.75,
    },
    lockRotation: true,
    rotation: 0,
    alpha: 1,
    disposition: -1,
    displayBars: 20,
    bar1: { attribute: "attributes.hp" },
    bar2: { attribute: null },
    light: {
      negative: false,
      priority: 0,
      alpha: 0.5,
      angle: 360,
      bright: 0,
      color: null,
      coloration: 1,
      dim: 0,
      attenuation: 0.5,
      luminosity: 0.5,
      saturation: 0,
      contrast: 0,
      shadows: 0,
      animation: { type: null, speed: 5, intensity: 5, reverse: false },
      darkness: { min: 0, max: 1 },
    },
    sight: {
      enabled: false,
      range: 0,
      angle: 360,
      visionMode: "basic",
      color: null,
      attenuation: 0.1,
      brightness: 0,
      saturation: 0,
      contrast: 0,
    },
    detectionModes: [],
    occludable: { radius: 0 },
    ring: {
      enabled: false,
      colors: { ring: null, background: null },
      effects: 0,
      subject: { scale: 1, texture: null },
    },
    turnMarker: { mode: 1, animation: null, src: null, disposition: false },
    movementAction: null,
    flags: {
      healthEstimate: {
        dontMarkDead: false,
        hideHealthEstimate: false,
        hideName: false,
      },
    },
    randomImg: false,
    appendNumber: false,
    prependAdjective: false,
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

export async function importActor(
  json: ActorGenerationResult,
  options: ImportOptions = {},
): Promise<Actor> {
  assertSystemCompatibility(json.systemId);
  const source = prepareGeneratedActorSource(json);
  const { packId, folderId } = options;

  if (folderId) {
    source.folder = folderId;
  }

  if (packId) {
    const pack = game.packs?.get(packId) as ActorCompendium | undefined;
    if (!pack) {
      throw new Error(`Pack with id "${packId}" was not found.`);
    }

    const existing = await findActorPackDocument(pack, json.slug);
    if (existing) {
      await updateActorDocument(existing, source, folderId);
      return existing;
    }

    const imported = (await pack.importDocument(clone(source) as any, { keepId: true } as any)) as Actor | null | undefined;
    if (!imported) {
      throw new Error(`Failed to import actor "${json.name}" into pack ${pack.collection}`);
    }

    return imported;
  }

  const existing = findWorldActor(json.slug);
  if (existing) {
    await updateActorDocument(existing, source, folderId);
    return existing;
  }

  const created = (await Actor.create(clone(source) as any, { keepId: true } as any)) as Actor | null | undefined;
  if (!created) {
    throw new Error(`Failed to create actor "${json.name}" in the world.`);
  }

  return created;
}

export async function importAction(
  json: ActionSchemaData,
  options: ImportOptions = {}
): Promise<Item> {
  assertSystemCompatibility(json.systemId);
  ensureValidAction(json);
  const source = prepareActionSource(json);
  const { packId, folderId } = options;

  if (folderId) {
    source.folder = folderId;
  }

  if (packId) {
    const pack = game.packs?.get(packId) as ItemCompendium | undefined;
    if (!pack) {
      throw new Error(`Pack with id "${packId}" was not found.`);
    }

    const existing = await findPackDocument(pack, json.slug);
    if (existing) {
      const updateData = { ...source } as Record<string, unknown>;
      if (folderId) {
        updateData.folder = folderId;
      }

      await existing.update(updateData as any);
      return existing;
    }

    const imported = (await pack.importDocument(source as any, { keepId: true } as any)) as Item | null | undefined;
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

    await existing.update(updateData as any);
    return existing;
  }

  const created = await Item.create(source as any, { keepId: true } as any);
  if (!created) {
    throw new Error(`Failed to create action "${json.name}" in the world.`);
  }

  return created;
}

async function updateActorDocument(
  actor: Actor,
  source: FoundryActorSource,
  folderId: string | undefined,
): Promise<void> {
  const updateData = buildActorUpdateData(source, folderId);
  await actor.update(updateData as any, { diff: false } as any);
  await replaceActorItems(actor, source.items);
  await replaceActorEffects(actor, source.effects);
}

function buildActorUpdateData(
  source: FoundryActorSource,
  folderId: string | undefined,
): Record<string, unknown> {
  const updateData: Record<string, unknown> = {
    name: source.name,
    type: source.type,
    img: source.img,
    system: clone(source.system),
    prototypeToken: clone(source.prototypeToken),
    flags: clone(source.flags ?? {}),
  };

  if (folderId !== undefined) {
    updateData.folder = folderId;
  } else if (source.folder !== undefined) {
    updateData.folder = source.folder;
  }

  return updateData;
}

async function replaceActorItems(actor: Actor, items: FoundryActorItemSource[]): Promise<void> {
  const existingItems = collectEmbeddedDocuments<Item>(actor.items);
  const ids = existingItems
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (ids.length) {
    await actor.deleteEmbeddedDocuments("Item", ids);
  }

  if (items.length) {
    const payload = (clone(items) as FoundryActorItemSource[]).map((item) => ({ ...item, folder: null }));
    await actor.createEmbeddedDocuments("Item", payload as any[]);
  }
}

async function replaceActorEffects(actor: Actor, effects: unknown[]): Promise<void> {
  const existingEffects = collectEmbeddedDocuments<ActiveEffect>(actor.effects);
  const ids = existingEffects
    .map((effect) => effect.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (ids.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  if (effects.length) {
    const payload = clone(effects);
    await actor.createEmbeddedDocuments("ActiveEffect", payload as any[]);
  }
}

function collectEmbeddedDocuments<T extends ClientDocument>(collection: unknown): T[] {
  if (!collection) {
    return [];
  }

  if (Array.isArray(collection)) {
    return collection as T[];
  }

  const candidate = collection as { contents?: unknown; values?: () => Iterable<unknown> };

  if (Array.isArray(candidate.contents)) {
    return candidate.contents as T[];
  }

  if (typeof candidate.values === "function") {
    return Array.from(candidate.values() as Iterable<T>);
  }

  return [];
}

function clone<T>(value: T): T {
  const foundryUtils = (globalThis as {
    foundry?: { utils?: { deepClone?: <U>(input: U) => U } };
  }).foundry?.utils;
  if (foundryUtils?.deepClone) {
    return foundryUtils.deepClone(value);
  }

  const structured = (globalThis as { structuredClone?: <U>(input: U) => U }).structuredClone;
  if (structured) {
    return structured(value);
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (error) {
    console.warn("Handy Dandy | Fallback clone failed", error);
    return value;
  }
}
