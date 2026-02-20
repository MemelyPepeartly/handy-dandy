import type {
  ActionSchemaData,
  ActorGenerationResult,
  ActorSchemaData,
  ItemSchemaData,
  PublicationData,
  SystemId,
} from "../schemas";
import { PUBLICATION_DEFAULT } from "../schemas";
import { getDefaultItemImage } from "../data/item-images";
import { validate, formatError } from "../helpers/validation";
import {
  resolveOfficialItem,
  stripEmbeddedDocumentMetadata,
  type OfficialItemLookup,
  type OfficialItemMatch,
} from "../pf2e/compendium-resolver";
import { toPf2eRichText } from "../text/pf2e-rich-text";

const DEFAULT_ACTION_IMAGE = "systems/pf2e/icons/default-icons/action.svg" as const;
const DEFAULT_ACTOR_IMAGE = "systems/pf2e/icons/default-icons/npc.svg" as const;
const DEFAULT_HAZARD_IMAGE = "systems/pf2e/icons/default-icons/hazard.svg" as const;
const DEFAULT_LOOT_IMAGE = "systems/pf2e/icons/default-icons/loot.svg" as const;
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
type ActorInventoryEntry = NonNullable<ActorSchemaData["inventory"]>[number];

const ACTION_TYPE_MAP: Record<ActionSchemaData["actionType"], { value: string; count: number | null }> = {
  "one-action": { value: "one", count: 1 },
  "two-actions": { value: "two", count: 2 },
  "three-actions": { value: "three", count: 3 },
  free: { value: "free", count: null },
  reaction: { value: "reaction", count: null }
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
  actorId?: string;
  itemId?: string;
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
    description: { value: string; gm: string };
    rules: unknown[];
    _migration: { version: number; lastMigration: number | null };
    traits: { value: string[]; otherTags: string[]; rarity: string };
    publication: { title: string; authors: string; license: string; remaster: boolean };
    level: { value: number };
    quantity: number;
    baseItem: string | null;
    bulk: { value: number | string | null };
    hp: { value: number; max: number };
    hardness: number;
    price: { value: Record<string, number> };
    source: { value: string };
    equipped: { carryType: string; invested: boolean | null; handsHeld?: number | null };
    containerId: string | null;
    size: string;
    material: { type: string | null; grade: string | null };
    identification: {
      status: string;
      unidentified: { name: string; img: string; data: { description: { value: string } } };
      misidentified: Record<string, unknown>;
    };
    usage: { value: string };
    subitems: unknown[];
    category?: string | null;
    group?: string | null;
    bonus?: { value: number };
    damage?: {
      dice: number;
      die: string | null;
      damageType: string | null;
      persistent?: { number: number; faces: number; type: string | null } | null;
    };
    splashDamage?: { value: number };
    range?: number | null;
    expend?: number | null;
    reload?: { value: string | null };
    grade?: string | null;
    runes?: { potency: number; striking: number; property: string[] };
    specific?: unknown;
  };
  effects: unknown[];
  folder: string | null;
  flags: Record<string, unknown>;
  _stats: {
    compendiumSource: string | null;
    duplicateSource: string | null;
    exportSource?: {
      worldId: string;
      uuid: string;
      coreVersion: string;
      systemId: string;
      systemVersion: string;
    };
    coreVersion: string;
    systemId: string;
    systemVersion: string;
    createdTime: number;
    modifiedTime: number;
    lastModifiedBy: string | null;
  };
  ownership: { default: number };
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

type FoundryActorGenericItemSource = {
  _id: string;
  name: string;
  type: string;
  img: string;
  system: Record<string, unknown>;
  effects: unknown[];
  folder: null;
  sort: number;
  flags: Record<string, unknown>;
  _stats?: Record<string, unknown>;
};

type FoundryActorItemSource =
  | FoundryActorStrikeSource
  | FoundryActorActionSource
  | FoundryActorSpellcastingEntrySource
  | FoundryActorSpellSource
  | FoundryActorGenericItemSource;

type FoundrySense = {
  type: string;
  acuity?: "precise" | "imprecise" | "vague";
  range?: number;
};

type FoundryActorSource = {
  name: string;
  type: string;
  img: string;
  system: Record<string, unknown>;
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

function ensureValidItem(data: ItemSchemaData): void {
  const validation = validate("item", data);
  if (validation.ok) {
    return;
  }

  const messages = validation.errors.map((error) => formatError(error));
  throw new Error(`Item JSON failed validation:\n${messages.join("\n")}`);
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
      /(\d+(?:\.\d+)?)\s*(?:-|\u2013)?\s*(foot|feet|ft|meter|metre|meters|metres|mile|miles|yard|yards)\b/gi,
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

function toRichText(text: string | null | undefined): string {
  return toPf2eRichText(text);
}

function resolveDefaultActorImage(actorType: ActorSchemaData["actorType"]): string {
  switch (actorType) {
    case "hazard":
      return DEFAULT_HAZARD_IMAGE;
    case "loot":
      return DEFAULT_LOOT_IMAGE;
    default:
      return DEFAULT_ACTOR_IMAGE;
  }
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

const ITEM_SIZE_VALUES = new Set(["tiny", "sm", "med", "lg", "huge", "grg"]);

function sanitizeNonNegativeInteger(value: unknown, fallback: number): number {
  const candidate = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(candidate)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(candidate));
}

function sanitizePriceCoins(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return { pp: 0, gp: 0, sp: 0, cp: 0 };
  }

  return {
    pp: sanitizeNonNegativeInteger(value.pp, 0),
    gp: sanitizeNonNegativeInteger(value.gp, 0),
    sp: sanitizeNonNegativeInteger(value.sp, 0),
    cp: sanitizeNonNegativeInteger(value.cp, 0),
  };
}

function ensureCoreItemSystemFields(
  systemData: FoundryItemSource["system"],
  itemType: ItemSchemaData["itemType"],
): void {
  const quantityValue = sanitizeNonNegativeInteger((systemData.quantity as { value?: unknown })?.value ?? systemData.quantity, 1);
  systemData.quantity = Math.max(1, quantityValue);

  const usageCandidate = (systemData.usage as { value?: unknown })?.value;
  const usageValue = typeof usageCandidate === "string" ? usageCandidate.trim() : "";
  systemData.usage = { value: usageValue || resolveItemUsage(itemType) };

  const bulkValue = sanitizeNonNegativeInteger((systemData.bulk as { value?: unknown })?.value, 0);
  systemData.bulk = { value: bulkValue };

  const size = typeof systemData.size === "string" ? systemData.size.trim().toLowerCase() : "";
  systemData.size = ITEM_SIZE_VALUES.has(size) ? size : "med";

  const coinRecord = sanitizePriceCoins((systemData.price as { value?: unknown } | undefined)?.value);
  systemData.price = { value: coinRecord };
}

const ITEM_MIGRATION_VERSION = 0.946;

const ITEM_IDENTIFICATION_DEFAULTS: Record<ItemSchemaData["itemType"], { name: string; img: string }> = {
  armor: { name: "Unusual Armor", img: "systems/pf2e/icons/unidentified_item_icons/armor.webp" },
  weapon: { name: "Unusual Weapon", img: "systems/pf2e/icons/unidentified_item_icons/weapon.webp" },
  equipment: { name: "Unusual Object", img: "systems/pf2e/icons/unidentified_item_icons/adventuring_gear.webp" },
  consumable: { name: "Unusual Consumable", img: "systems/pf2e/icons/unidentified_item_icons/consumable.webp" },
  feat: { name: "Unusual Feat", img: "systems/pf2e/icons/unidentified_item_icons/feat.webp" },
  spell: { name: "Unusual Spell", img: "systems/pf2e/icons/unidentified_item_icons/spell.webp" },
  wand: { name: "Unusual Wand", img: "systems/pf2e/icons/unidentified_item_icons/wand.webp" },
  staff: { name: "Unusual Staff", img: "systems/pf2e/icons/unidentified_item_icons/staff.webp" },
  other: { name: "Unusual Object", img: "systems/pf2e/icons/unidentified_item_icons/adventuring_gear.webp" },
};

const ITEM_USAGE_DEFAULTS: Partial<Record<ItemSchemaData["itemType"], string>> = {
  armor: "worn",
  weapon: "held-in-one-hand",
  equipment: "held-in-one-hand",
  consumable: "held-in-one-hand",
  wand: "held-in-one-hand",
  staff: "held-in-two-hands",
};

const ITEM_CARRY_TYPE_DEFAULTS: Partial<Record<ItemSchemaData["itemType"], string>> = {
  armor: "worn",
  weapon: "worn",
  equipment: "worn",
  consumable: "worn",
  wand: "worn",
  staff: "worn",
};

function sanitizeItemTraits(traits: ItemSchemaData["traits"]): string[] {
  const values = trimArray(traits ?? []);
  if (!values.length) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const trait of values) {
    const key = trait.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

function resolveItemIdentification(itemType: ItemSchemaData["itemType"]): {
  name: string;
  img: string;
} {
  const defaults = ITEM_IDENTIFICATION_DEFAULTS[itemType];
  return defaults ?? ITEM_IDENTIFICATION_DEFAULTS.other;
}

function resolveItemUsage(itemType: ItemSchemaData["itemType"]): string {
  const usage = ITEM_USAGE_DEFAULTS[itemType];
  return usage ?? "";
}

function resolveItemCarryType(itemType: ItemSchemaData["itemType"]): string {
  const carryType = ITEM_CARRY_TYPE_DEFAULTS[itemType];
  return carryType ?? "worn";
}

type FoundryCreatableItemType = "armor" | "weapon" | "equipment" | "consumable" | "feat" | "spell";

function resolveFoundryItemType(itemType: ItemSchemaData["itemType"]): FoundryCreatableItemType {
  switch (itemType) {
    case "wand":
      return "consumable";
    case "staff":
      return "weapon";
    case "other":
      return "equipment";
    default:
      return itemType;
  }
}

function resolveCoreVersion(): string {
  const gameInstance = (globalThis as { game?: Game }).game;
  if (!gameInstance) {
    return "";
  }

  const release = (gameInstance as { release?: { version?: unknown } }).release;
  if (release && typeof release.version === "string") {
    return release.version;
  }

  const version = (gameInstance as { version?: unknown }).version;
  return typeof version === "string" ? version : "";
}

function resolveSystemVersion(): string {
  const gameInstance = (globalThis as { game?: Game }).game;
  const system = gameInstance?.system as { version?: unknown } | undefined;
  if (system && typeof system.version === "string") {
    return system.version;
  }
  return "";
}

function resolveWorldId(): string {
  const gameInstance = (globalThis as { game?: Game }).game;
  const world = gameInstance?.world as
    | { id?: unknown; data?: { id?: unknown; name?: unknown } }
    | undefined;
  if (!world) {
    return "";
  }

  if (typeof world.id === "string") {
    return world.id;
  }

  const dataId = (world as { data?: { id?: unknown } }).data?.id;
  if (typeof dataId === "string") {
    return dataId;
  }

  const name = (world as { data?: { name?: unknown } }).data?.name;
  return typeof name === "string" ? name : "";
}

function resolveCurrentUserId(): string | null {
  const gameInstance = (globalThis as { game?: Game }).game;
  const current = gameInstance?.userId ?? (gameInstance?.user ? gameInstance.user.id : null);
  return typeof current === "string" && current ? current : null;
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

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"`\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type IwrCategory = "immunities" | "weaknesses" | "resistances";

const IWR_DICTIONARY_KEYS: Record<IwrCategory, "immunityTypes" | "weaknessTypes" | "resistanceTypes"> = {
  immunities: "immunityTypes",
  weaknesses: "weaknessTypes",
  resistances: "resistanceTypes",
};

function getIwrLookupMap(category: IwrCategory): Map<string, string> | null {
  const dictionaryKey = IWR_DICTIONARY_KEYS[category];
  const dictionary = (
    globalThis as { CONFIG?: { PF2E?: Record<string, unknown> } }
  ).CONFIG?.PF2E?.[dictionaryKey];
  if (!dictionary || typeof dictionary !== "object") {
    return null;
  }

  const keys = Object.keys(dictionary as Record<string, unknown>);
  if (keys.length === 0) {
    return null;
  }

  const map = new Map<string, string>();
  for (const rawKey of keys) {
    const key = rawKey.trim().toLowerCase();
    if (!key) {
      continue;
    }

    const normalized = normalizeLookupKey(key);
    const collapsed = normalized.replace(/-/g, "");
    if (!map.has(key)) {
      map.set(key, key);
    }
    if (normalized && !map.has(normalized)) {
      map.set(normalized, key);
    }
    if (collapsed && !map.has(collapsed)) {
      map.set(collapsed, key);
    }
  }

  return map.size > 0 ? map : null;
}

function resolveIwrKey(value: unknown, category: IwrCategory): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const normalized = normalizeLookupKey(trimmed);
  if (!normalized) {
    return null;
  }

  const lookup = getIwrLookupMap(category);
  if (!lookup) {
    return normalized;
  }

  return (
    lookup.get(trimmed) ??
    lookup.get(normalized) ??
    lookup.get(normalized.replace(/-/g, "")) ??
    null
  );
}

function sanitizeIwrStringList(values: unknown, category: IwrCategory): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const sanitized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const candidate =
      typeof value === "string"
        ? value
        : (isRecord(value) && typeof value.type === "string")
          ? value.type
          : (isRecord(value) && typeof value.slug === "string")
            ? value.slug
            : null;
    const resolved = resolveIwrKey(candidate, category);
    if (!resolved || seen.has(resolved)) {
      continue;
    }

    seen.add(resolved);
    sanitized.push(resolved);
  }

  return sanitized;
}

function sanitizeCanonicalImmunities(
  values: ActorSchemaData["attributes"]["immunities"] | null | undefined,
): Array<{ type: string; exceptions: string[]; notes: string }> {
  const entries = values ?? [];
  const sanitized: Array<{ type: string; exceptions: string[]; notes: string }> = [];

  for (const entry of entries) {
    const type = resolveIwrKey(entry.type, "immunities");
    if (!type) {
      continue;
    }

    sanitized.push({
      type,
      exceptions: sanitizeIwrStringList(entry.exceptions, "immunities"),
      notes: sanitizeText(entry.details),
    });
  }

  return sanitized;
}

function sanitizeCanonicalWeaknesses(
  values: ActorSchemaData["attributes"]["weaknesses"] | null | undefined,
): Array<{ type: string; value: number; exceptions: string[]; notes: string }> {
  const entries = values ?? [];
  const sanitized: Array<{ type: string; value: number; exceptions: string[]; notes: string }> = [];

  for (const entry of entries) {
    const type = resolveIwrKey(entry.type, "weaknesses");
    if (!type) {
      continue;
    }

    sanitized.push({
      type,
      value: Number.isFinite(entry.value) ? Math.trunc(entry.value) : 0,
      exceptions: sanitizeIwrStringList(entry.exceptions, "weaknesses"),
      notes: sanitizeText(entry.details),
    });
  }

  return sanitized;
}

function sanitizeCanonicalResistances(
  values: ActorSchemaData["attributes"]["resistances"] | null | undefined,
): Array<{ type: string; value: number; exceptions: string[]; doubleVs: string[]; notes: string }> {
  const entries = values ?? [];
  const sanitized: Array<{ type: string; value: number; exceptions: string[]; doubleVs: string[]; notes: string }> = [];

  for (const entry of entries) {
    const type = resolveIwrKey(entry.type, "resistances");
    if (!type) {
      continue;
    }

    sanitized.push({
      type,
      value: Number.isFinite(entry.value) ? Math.trunc(entry.value) : 0,
      exceptions: sanitizeIwrStringList(entry.exceptions, "resistances"),
      doubleVs: sanitizeIwrStringList(entry.doubleVs, "resistances"),
      notes: sanitizeText(entry.details),
    });
  }

  return sanitized;
}

function sanitizeGeneratedIwrEntries(
  values: unknown,
  category: IwrCategory,
): Array<Record<string, unknown>> {
  const rawEntries = Array.isArray(values)
    ? values.filter((value): value is Record<string, unknown> => isRecord(value))
    : [];
  const sanitized: Array<Record<string, unknown>> = [];

  for (const entry of rawEntries) {
    const type = resolveIwrKey(entry.type, category);
    if (!type) {
      continue;
    }

    const notes = sanitizeText(
      typeof entry.notes === "string"
        ? entry.notes
        : (typeof entry.details === "string" ? entry.details : ""),
    );
    const exceptions = sanitizeIwrStringList(entry.exceptions, category);

    if (category === "immunities") {
      sanitized.push({
        type,
        exceptions,
        notes,
      });
      continue;
    }

    const numericValue = typeof entry.value === "number" ? entry.value : Number(entry.value);
    const value = Number.isFinite(numericValue) ? Math.trunc(numericValue) : 0;

    if (category === "weaknesses") {
      sanitized.push({
        type,
        value,
        exceptions,
        notes,
      });
      continue;
    }

    sanitized.push({
      type,
      value,
      exceptions,
      doubleVs: sanitizeIwrStringList(entry.doubleVs, category),
      notes,
    });
  }

  return sanitized;
}

function sanitizeGeneratedActorIwr(system: FoundryActorSource["system"]): void {
  if (!isRecord(system.attributes)) {
    return;
  }

  const attributes = system.attributes as Record<string, unknown>;
  attributes.immunities = sanitizeGeneratedIwrEntries(attributes.immunities, "immunities");
  attributes.weaknesses = sanitizeGeneratedIwrEntries(attributes.weaknesses, "weaknesses");
  attributes.resistances = sanitizeGeneratedIwrEntries(attributes.resistances, "resistances");
}

function getEmbeddedItemSlug(item: FoundryActorItemSource): string | null {
  const system = (item as { system?: unknown }).system;
  if (!isRecord(system)) {
    return null;
  }
  const slug = system.slug;
  if (typeof slug !== "string") {
    return null;
  }
  const trimmed = slug.trim();
  return trimmed ? trimmed : null;
}

function getEmbeddedItemName(item: FoundryActorItemSource): string | null {
  const name = (item as { name?: unknown }).name;
  if (typeof name !== "string") {
    return null;
  }
  const trimmed = name.trim();
  return trimmed ? trimmed : null;
}

function getEmbeddedSpellLevel(item: FoundryActorItemSource): number | null {
  const system = (item as { system?: unknown }).system;
  if (!isRecord(system)) {
    return null;
  }
  const level = system.level;
  if (isRecord(level)) {
    const value = level.value;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  } else if (typeof level === "number" && Number.isFinite(level)) {
    return level;
  }
  return null;
}

function buildOfficialLookup(item: FoundryActorItemSource): OfficialItemLookup | null {
  const slug = getEmbeddedItemSlug(item);
  const name = getEmbeddedItemName(item);
  const itemType = (item as { type?: string }).type;

  if (itemType === "spell") {
    return {
      kind: "spell",
      slug,
      name,
      level: getEmbeddedSpellLevel(item),
    };
  }

  if (itemType === "action") {
    return {
      kind: "action",
      slug,
      name,
    };
  }

  if (itemType === "effect") {
    return {
      kind: "effect",
      slug,
      name,
    };
  }

  if (itemType === "condition") {
    return {
      kind: "condition",
      slug,
      name,
    };
  }

  if (itemType === "melee" || itemType === "spellcastingEntry") {
    return null;
  }

  return {
    kind: "item",
    slug,
    name,
    itemType,
  };
}

function setNestedProperty(
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): void {
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const next = cursor[key];
    if (!isRecord(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

function getNestedProperty(source: Record<string, unknown>, path: readonly string[]): unknown {
  let cursor: unknown = source;
  for (const key of path) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[key];
  }
  return cursor;
}

function shouldPreserveOriginalEmbeddedType(originalType: string, resolvedType: string): boolean {
  if (!originalType) {
    return false;
  }

  if (originalType === resolvedType) {
    return true;
  }

  switch (originalType) {
    case "action":
    case "spell":
    case "effect":
    case "condition":
    case "melee":
    case "spellcastingEntry":
      return true;
    default:
      return false;
  }
}

function mergeCompendiumActorItem(
  original: FoundryActorItemSource,
  match: OfficialItemMatch,
): FoundryActorItemSource {
  const base = stripEmbeddedDocumentMetadata(match.source) as Record<string, unknown>;
  const merged = clone(base);

  const originalId = (original as { _id?: unknown })._id;
  if (typeof originalId === "string" && originalId) {
    merged._id = originalId;
  } else if (typeof merged._id !== "string") {
    merged._id = generateId();
  }

  const originalSort = (original as { sort?: unknown }).sort;
  if (typeof originalSort === "number" && Number.isFinite(originalSort)) {
    merged.sort = originalSort;
  } else if (typeof merged.sort !== "number") {
    merged.sort = 0;
  }

  merged.folder = null;

  const originalFlags = (original as { flags?: unknown }).flags;
  const mergedFlags = isRecord(merged.flags) ? merged.flags : {};
  if (isRecord(originalFlags)) {
    merged.flags = { ...mergedFlags, ...clone(originalFlags) };
  } else if (!isRecord(merged.flags)) {
    merged.flags = {};
  }

  const originalName = getEmbeddedItemName(original);
  const mergedName = typeof merged.name === "string" ? merged.name : "";
  if (originalName && normalizeLookupKey(originalName) !== normalizeLookupKey(mergedName)) {
    merged.name = originalName;
  }

  const originalType = (original as { type?: unknown }).type;
  const resolvedType = typeof merged.type === "string" ? merged.type : "";
  if (
    typeof originalType === "string" &&
    originalType &&
    shouldPreserveOriginalEmbeddedType(originalType, resolvedType)
  ) {
    merged.type = originalType;
  }

  const originalSystem = isRecord((original as { system?: unknown }).system)
    ? ((original as { system: Record<string, unknown> }).system)
    : null;
  const mergedSystem = isRecord(merged.system) ? merged.system : {};
  merged.system = mergedSystem;

  if (originalType === "spell" && originalSystem) {
    const originalLocation = getNestedProperty(originalSystem, ["location"]);
    if (originalLocation !== undefined) {
      setNestedProperty(mergedSystem, ["location"], clone(originalLocation));
    }
  }

  if (originalType === "action" && originalSystem) {
    const originalDescription = getNestedProperty(originalSystem, ["description", "value"]);
    const mergedDescription = getNestedProperty(mergedSystem, ["description", "value"]);
    if (
      typeof originalDescription === "string" &&
      originalDescription.trim().length > 0 &&
      (typeof mergedDescription !== "string" || mergedDescription.trim().length === 0)
    ) {
      setNestedProperty(mergedSystem, ["description", "value"], originalDescription);
    }

    const originalFrequency = getNestedProperty(originalSystem, ["frequency"]);
    const mergedFrequency = getNestedProperty(mergedSystem, ["frequency"]);
    if (originalFrequency !== undefined && mergedFrequency === undefined) {
      setNestedProperty(mergedSystem, ["frequency"], clone(originalFrequency));
    }
  }

  if (!Array.isArray((merged as { effects?: unknown }).effects)) {
    merged.effects = [];
  }

  return merged as FoundryActorItemSource;
}

function mapEmbeddedItemTypeToCategory(itemType: string): ItemSchemaData["itemType"] {
  switch (itemType) {
    case "armor":
    case "weapon":
    case "equipment":
    case "consumable":
    case "feat":
    case "spell":
    case "wand":
    case "staff":
      return itemType;
    case "shield":
      return "armor";
    default:
      return "other";
  }
}

function resolveEmbeddedItemFallbackImage(item: FoundryActorItemSource): string {
  const itemType = (item as { type?: unknown }).type;
  if (typeof itemType === "string") {
    switch (itemType) {
      case "melee":
        return DEFAULT_STRIKE_IMAGE;
      case "action":
        return DEFAULT_ACTION_IMAGE;
      case "spell":
        return DEFAULT_SPELL_IMAGE;
      case "spellcastingEntry":
        return DEFAULT_SPELLCASTING_IMAGE;
      default:
        return getDefaultItemImage(mapEmbeddedItemTypeToCategory(itemType));
    }
  }

  return getDefaultItemImage("other");
}

function ensureEmbeddedItemImage(item: FoundryActorItemSource): FoundryActorItemSource {
  const currentImg = typeof item.img === "string" ? item.img.trim() : "";
  const fallback = resolveEmbeddedItemFallbackImage(item);

  if (currentImg.length === 0) {
    return {
      ...item,
      img: fallback,
    };
  }

  if (NON_ITEM_EMBEDDED_IMAGE_PATTERNS.some((pattern) => pattern.test(currentImg))) {
    return {
      ...item,
      img: fallback,
    };
  }

  const isPf2eDefaultIcon = /systems\/pf2e\/icons\/default-icons\//i.test(currentImg);
  if (isPf2eDefaultIcon && currentImg !== fallback) {
    return {
      ...item,
      img: fallback,
    };
  }

  return item;
}

function ensureAllEmbeddedItemImages(items: FoundryActorItemSource[]): FoundryActorItemSource[] {
  return items.map((item) => ensureEmbeddedItemImage(item));
}

async function resolveActorItems(items: FoundryActorItemSource[]): Promise<FoundryActorItemSource[]> {
  if (!items.length) {
    return items;
  }

  const resolved: FoundryActorItemSource[] = [];
  for (const item of items) {
    resolved.push(await resolveItemFromCompendium(item));
  }

  return ensureAllEmbeddedItemImages(resolved);
}

async function resolveItemFromCompendium(
  item: FoundryActorItemSource,
): Promise<FoundryActorItemSource> {
  const lookup = buildOfficialLookup(item);
  if (!lookup) {
    return ensureEmbeddedItemImage(item);
  }

  const resolved = await resolveOfficialItem(lookup);
  if (!resolved) {
    return ensureEmbeddedItemImage(item);
  }

  return ensureEmbeddedItemImage(mergeCompendiumActorItem(item, resolved));
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
  const traits = sanitizeItemTraits(item.traits);
  const description = toRichText(item.description);
  const source = sanitizeText(item.source);
  const publication = normalizePublicationDetails(item.publication, source);
  const usage = resolveItemUsage(item.itemType);
  const carryType = resolveItemCarryType(item.itemType);
  const identification = resolveItemIdentification(item.itemType);
  const img = item.img?.trim() || getDefaultItemImage(item.itemType);
  const type = resolveFoundryItemType(item.itemType);
  const coins = priceToCoins(item.price);
  const coreVersion = resolveCoreVersion();
  const systemVersion = resolveSystemVersion();
  const timestamp = Date.now();
  const userId = resolveCurrentUserId();
  const worldId = resolveWorldId();

  const systemData: FoundryItemSource["system"] = {
    slug: item.slug,
    description: { value: description, gm: "" },
    rules: [],
    _migration: { version: ITEM_MIGRATION_VERSION, lastMigration: null },
    traits: { value: traits, otherTags: [], rarity: item.rarity },
    publication,
    level: { value: item.level },
    quantity: 1,
    baseItem: null,
    bulk: { value: 0 },
    hp: { value: 0, max: 0 },
    hardness: 0,
    price: { value: coins },
    source: { value: source },
    equipped: { carryType, invested: null },
    containerId: null,
    size: "med",
    material: { type: null, grade: null },
    identification: {
      status: "identified",
      unidentified: {
        name: identification.name,
        img: identification.img,
        data: { description: { value: "" } },
      },
      misidentified: {},
    },
    usage: { value: usage },
    subitems: [],
  };

  if (type === "weapon") {
    systemData.category = "simple";
    systemData.group = null;
    systemData.bonus = { value: 0 };
    systemData.damage = {
      dice: 1,
      die: "d4",
      damageType: null,
      persistent: null,
    };
    systemData.splashDamage = { value: 0 };
    systemData.range = 0;
    systemData.expend = null;
    systemData.reload = { value: "0" };
    systemData.grade = null;
    systemData.runes = { potency: 0, striking: 0, property: [] };
    systemData.specific = null;
    systemData.equipped = { ...systemData.equipped, handsHeld: 0 };
  }

  if (item.itemType === "wand" && type === "consumable") {
    systemData.category = "wand";
  }

  ensureCoreItemSystemFields(systemData, item.itemType);

  const stats: FoundryItemSource["_stats"] = {
    compendiumSource: null,
    duplicateSource: null,
    coreVersion,
    systemId: item.systemId,
    systemVersion,
    createdTime: timestamp,
    modifiedTime: timestamp,
    lastModifiedBy: userId,
  };

  if (worldId && coreVersion && systemVersion) {
    stats.exportSource = {
      worldId,
      uuid: `Item.${generateId()}`,
      coreVersion,
      systemId: item.systemId,
      systemVersion,
    };
  }

  return {
    name: item.name,
    type,
    img,
    system: systemData,
    effects: [],
    folder: null,
    flags: {},
    _stats: stats,
    ownership: { default: 0 },
  };
}

function prepareActorSource(actor: ActorSchemaData): FoundryActorSource {
  if (actor.actorType === "loot") {
    return prepareLootActorSource(actor);
  }

  if (actor.actorType === "hazard") {
    return prepareHazardActorSource(actor);
  }

  return prepareCreatureActorSource(actor);
}

function prepareCreatureActorSource(actor: ActorSchemaData): FoundryActorSource {
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
  const inventoryItems = actor.inventory?.map((entry, index) => createInventoryItem(actor, entry, index)) ?? [];

  const items: FoundryActorItemSource[] = [...strikes, ...actions];
  if (spellcastingItems.length) {
    items.push(...spellcastingItems);
  }
  if (inventoryItems.length) {
    items.push(...inventoryItems);
  }

  return {
    name: actor.name,
    type: actor.actorType,
    img: actor.img?.trim() || resolveDefaultActorImage(actor.actorType),
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
        immunities: sanitizeCanonicalImmunities(actor.attributes.immunities),
        weaknesses: sanitizeCanonicalWeaknesses(actor.attributes.weaknesses),
        resistances: sanitizeCanonicalResistances(actor.attributes.resistances),
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

function prepareLootActorSource(actor: ActorSchemaData): FoundryActorSource {
  const description = toRichText(actor.description);
  const settings = actor.loot ?? null;
  const lootSheetType = settings?.lootSheetType === "Merchant" ? "Merchant" : "Loot";
  const hiddenWhenEmpty = settings?.hiddenWhenEmpty === true;
  const inventoryItems = actor.inventory?.map((entry, index) => createInventoryItem(actor, entry, index, { lootOnly: true })) ?? [];

  return {
    name: actor.name,
    type: "loot",
    img: actor.img?.trim() || resolveDefaultActorImage("loot"),
    system: {
      slug: actor.slug,
      details: {
        description,
        level: { value: Math.max(0, actor.level) },
      },
      lootSheetType,
      hiddenWhenEmpty,
      _migration: {
        version: null,
        previous: null,
      },
    },
    prototypeToken: buildPrototypeToken(actor, { hpBarAttribute: null }),
    items: inventoryItems,
    effects: [],
    folder: null,
    flags: {},
  };
}

function prepareHazardActorSource(actor: ActorSchemaData): FoundryActorSource {
  const traits = trimArray(actor.traits).map((value) => value.toLowerCase());
  const source = sanitizeText(actor.source);
  const publication = normalizePublicationDetails(actor.publication, source);
  const description = toRichText(actor.description);
  const hazard = actor.hazard ?? null;
  const stealthBonus = typeof hazard?.stealthBonus === "number" && Number.isFinite(hazard.stealthBonus)
    ? Math.trunc(hazard.stealthBonus)
    : actor.attributes.perception.value;
  const stealthDetails = sanitizeText(hazard?.stealthDetails ?? actor.attributes.perception.details);
  const hardness = typeof hazard?.hardness === "number" && Number.isFinite(hazard.hardness)
    ? Math.max(0, Math.trunc(hazard.hardness))
    : 0;
  const disable = toRichText(hazard?.disable ?? "");
  const routine = toRichText(hazard?.routine ?? "");
  const reset = toRichText(hazard?.reset ?? "");
  const emitsSound = normalizeHazardEmitsSound(hazard?.emitsSound);
  const strikes = actor.strikes.map((strike, index) => createStrikeItem(actor, strike, index));
  const actions = actor.actions.map((action, index) => createActionItem(actor, action, index));
  const saves = {
    fortitude: normalizeHazardSave(actor.attributes.saves.fortitude),
    reflex: normalizeHazardSave(actor.attributes.saves.reflex),
    will: normalizeHazardSave(actor.attributes.saves.will),
  };

  return {
    name: actor.name,
    type: "hazard",
    img: actor.img?.trim() || resolveDefaultActorImage("hazard"),
    system: {
      slug: actor.slug,
      traits: {
        value: traits,
        rarity: actor.rarity,
        size: { value: actor.size },
      },
      attributes: {
        hp: {
          value: actor.attributes.hp.value,
          max: actor.attributes.hp.max,
          temp: actor.attributes.hp.temp ?? 0,
          details: sanitizeText(actor.attributes.hp.details),
        },
        ac: { value: actor.attributes.ac.value },
        hardness,
        stealth: {
          value: stealthBonus,
          details: stealthDetails,
        },
        immunities: sanitizeHazardImmunities(actor.attributes.immunities),
        weaknesses: sanitizeHazardWeaknesses(actor.attributes.weaknesses),
        resistances: sanitizeHazardResistances(actor.attributes.resistances),
        emitsSound,
      },
      details: {
        description,
        level: { value: actor.level },
        isComplex: hazard?.isComplex === true,
        disable,
        routine,
        reset,
        publication,
      },
      saves,
      statusEffects: [],
      _migration: {
        version: null,
        previous: null,
      },
    },
    prototypeToken: buildPrototypeToken(actor),
    items: [...strikes, ...actions],
    effects: [],
    folder: null,
    flags: {},
  };
}

function normalizeHazardEmitsSound(value: NonNullable<ActorSchemaData["hazard"]>["emitsSound"] | undefined): boolean | "encounter" {
  if (value === true || value === false) {
    return value;
  }
  return "encounter";
}

function normalizeHazardSave(save: ActorSchemaData["attributes"]["saves"]["fortitude"]): {
  value: number | null;
  saveDetail: string;
} {
  const value = Number.isFinite(save.value) ? Math.trunc(save.value) : 0;
  const saveDetail = sanitizeText(save.details);
  return {
    value: value === 0 && !saveDetail ? null : value,
    saveDetail,
  };
}

function sanitizeHazardImmunities(
  values: ActorSchemaData["attributes"]["immunities"] | null | undefined,
): Array<{ type: string; exceptions: string[] }> {
  if (!values?.length) {
    return [];
  }

  const sanitized: Array<{ type: string; exceptions: string[] }> = [];
  for (const entry of values) {
    if (!entry?.type) {
      continue;
    }
    sanitized.push({
      type: entry.type,
      exceptions: sanitizeIwrStringList(entry.exceptions, "immunities"),
    });
  }

  return sanitized;
}

function sanitizeHazardWeaknesses(
  values: ActorSchemaData["attributes"]["weaknesses"] | null | undefined,
): Array<{ type: string; value: number; exceptions: string[] }> {
  if (!values?.length) {
    return [];
  }

  const sanitized: Array<{ type: string; value: number; exceptions: string[] }> = [];
  for (const entry of values) {
    if (!entry?.type) {
      continue;
    }
    sanitized.push({
      type: entry.type,
      value: Number.isFinite(entry.value) ? Math.max(1, Math.trunc(entry.value)) : 1,
      exceptions: sanitizeIwrStringList(entry.exceptions, "weaknesses"),
    });
  }

  return sanitized;
}

function sanitizeHazardResistances(
  values: ActorSchemaData["attributes"]["resistances"] | null | undefined,
): Array<{ type: string; value: number; exceptions: string[]; doubleVs: string[] }> {
  if (!values?.length) {
    return [];
  }

  const sanitized: Array<{ type: string; value: number; exceptions: string[]; doubleVs: string[] }> = [];
  for (const entry of values) {
    if (!entry?.type) {
      continue;
    }
    sanitized.push({
      type: entry.type,
      value: Number.isFinite(entry.value) ? Math.max(1, Math.trunc(entry.value)) : 1,
      exceptions: sanitizeIwrStringList(entry.exceptions, "resistances"),
      doubleVs: sanitizeIwrStringList(entry.doubleVs, "resistances"),
    });
  }

  return sanitized;
}

function prepareGeneratedActorSource(actor: ActorGenerationResult): FoundryActorSource {
  const sanitizedItems = sanitizeGeneratedActorItemsForImport(actor.items);
  const system = clone((actor.system ?? {}) as FoundryActorSource["system"]);
  system.slug = actor.slug;
  sanitizeGeneratedActorIwr(system);

  return {
    name: actor.name,
    type: actor.type,
    img: actor.img?.trim() || resolveDefaultActorImage(actor.type),
    system,
    prototypeToken: clone(actor.prototypeToken ?? {}),
    items: sanitizedItems,
    effects: Array.isArray(actor.effects) ? clone(actor.effects) : [],
    folder: actor.folder ?? null,
    flags: clone((actor.flags ?? {}) as Record<string, unknown>),
  };
}

function normalizeGeneratedStrikeEffectValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidates: unknown[] = [
    value.slug,
    value.label,
    value.name,
    value.value,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function sanitizeGeneratedMeleeItemForImport(item: FoundryActorItemSource): FoundryActorItemSource {
  if (item.type !== "melee" || !isRecord(item.system)) {
    return item;
  }

  const system = clone(item.system) as Record<string, unknown>;
  const attackEffectsSource = isRecord(system.attackEffects) && Array.isArray(system.attackEffects.value)
    ? system.attackEffects.value
    : Array.isArray(system.attackEffects)
      ? system.attackEffects
      : [];

  const normalizedEffects = attackEffectsSource
    .map((effect) => normalizeGeneratedStrikeEffectValue(effect))
    .filter((effect): effect is string => typeof effect === "string");

  const { attackEffects, descriptionAdditions } = splitStrikeEffects(normalizedEffects);
  const existingDescription = isRecord(system.description)
    ? (typeof system.description.value === "string" ? system.description.value : "")
    : (typeof system.description === "string" ? system.description : "");
  const existingDescriptionGm = isRecord(system.description)
    ? (typeof system.description.gm === "string" ? system.description.gm : "")
    : "";

  system.attackEffects = { value: attackEffects };
  if (descriptionAdditions.length > 0) {
    system.description = {
      value: formatStrikeDescription(existingDescription, descriptionAdditions),
      gm: existingDescriptionGm,
    };
  } else if (!isRecord(system.description)) {
    system.description = {
      value: formatStrikeDescription(existingDescription, []),
      gm: existingDescriptionGm,
    };
  }

  return {
    ...item,
    system: system as FoundryActorItemSource["system"],
  };
}

function sanitizeGeneratedActorItemsForImport(items: unknown): FoundryActorItemSource[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const clonedItems = clone(items) as FoundryActorItemSource[];
  return clonedItems.map((item) => sanitizeGeneratedMeleeItemForImport(item));
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

const HTML_TAG_DETECTION_PATTERN = /<\/?[a-z][^>]*>/i;
const INLINE_MACRO_PATTERN = /@[A-Za-z]+\[/;
const SLUG_EFFECT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const LINKABLE_CONDITION_EFFECTS = new Set([
  "blinded",
  "clumsy",
  "concealed",
  "confused",
  "controlled",
  "dazzled",
  "deafened",
  "doomed",
  "drained",
  "enfeebled",
  "fascinated",
  "fatigued",
  "fleeing",
  "frightened",
  "grabbed",
  "hidden",
  "immobilized",
  "invisible",
  "off-guard",
  "paralyzed",
  "petrified",
  "prone",
  "quickened",
  "restrained",
  "sickened",
  "slowed",
  "stunned",
  "stupefied",
  "unconscious",
  "wounded",
  "flat-footed",
]);

const KNOWN_ATTACK_EFFECT_SLUGS = new Set([
  "grab",
  "improved-grab",
  "constrict",
  "greater-constrict",
  "knockdown",
  "improved-knockdown",
  "push",
  "improved-push",
  "trip",
]);

function isKnownAttackEffectSlug(value: string): boolean {
  const slug = value.trim().toLowerCase();
  if (!slug) {
    return false;
  }

  if (KNOWN_ATTACK_EFFECT_SLUGS.has(slug)) {
    return true;
  }

  const attackEffects = (globalThis as { CONFIG?: { PF2E?: { attackEffects?: unknown } } }).CONFIG?.PF2E?.attackEffects;
  if (!attackEffects || typeof attackEffects !== "object") {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(attackEffects, slug);
}

function resolveLinkableConditionEffect(value: string): string | null {
  const normalized = normalizeLookupKey(value).replace(/-\d+$/, "");
  return LINKABLE_CONDITION_EFFECTS.has(normalized) ? normalized : null;
}

function isLinkableConditionEffect(value: string): boolean {
  return resolveLinkableConditionEffect(value) !== null;
}

function splitStrikeEffects(
  effects: readonly string[],
): { attackEffects: string[]; descriptionAdditions: string[] } {
  const attackEffects: string[] = [];
  const descriptionAdditions: string[] = [];
  const seen = new Set<string>();

  for (const rawEffect of effects) {
    const effect = rawEffect.trim();
    if (!effect) {
      continue;
    }

    const dedupeKey = effect.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    if (HTML_TAG_DETECTION_PATTERN.test(effect) || INLINE_MACRO_PATTERN.test(effect)) {
      descriptionAdditions.push(effect);
      continue;
    }

    const linkableCondition = resolveLinkableConditionEffect(effect);
    if (linkableCondition) {
      descriptionAdditions.push(effect);
      continue;
    }

    if (SLUG_EFFECT_PATTERN.test(effect)) {
      const slug = effect.toLowerCase();
      if (isKnownAttackEffectSlug(slug)) {
        attackEffects.push(slug);
      } else {
        descriptionAdditions.push(effect);
      }
      continue;
    }

    descriptionAdditions.push(effect);
  }

  return { attackEffects, descriptionAdditions };
}

function formatStrikeDescription(
  description: string | null | undefined,
  additions: readonly string[],
): string {
  const parts = [description ?? "", ...additions]
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (parts.length === 0) {
    return "";
  }

  return parts.map((part) => toRichText(part)).filter((part) => part.length > 0).join("");
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
  const { attackEffects, descriptionAdditions } = splitStrikeEffects(strike.effects ?? []);
  const description = formatStrikeDescription(strike.description, descriptionAdditions);

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
      description: { value: description, gm: "" },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      attackEffects: { value: attackEffects },
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
      list.push(spell.name + (spell.description ? ` - ${spell.description}` : ""));
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

const NON_ITEM_EMBEDDED_IMAGE_PATTERNS = [
  /icons\/svg\/mystery-man\.svg$/i,
  /systems\/pf2e\/icons\/default-icons\/npc\.svg$/i,
];

const INVENTORY_DEFAULT_IMAGE_OVERRIDE_PATTERNS = [
  ...NON_ITEM_EMBEDDED_IMAGE_PATTERNS,
  /icons\/svg\/[^/]+\.svg$/i,
  /^https?:\/\//i,
  /^data:image\//i,
];

function inferInventoryItemTypeFromText(text: string): ItemSchemaData["itemType"] | null {
  if (!text) {
    return null;
  }

  const normalized = text.toLowerCase();
  if (/\b(wand|magic wand)\b/.test(normalized)) return "wand";
  if (/\b(staff|stave|quarterstaff)\b/.test(normalized)) return "staff";
  if (/\b(spell|cantrip|ritual)\b/.test(normalized)) return "spell";
  if (/\b(feat|ability)\b/.test(normalized)) return "feat";
  if (/\b(potion|elixir|bomb|poison|talisman|scroll|mutagen|consumable|ammunition|ammo)\b/.test(normalized)) {
    return "consumable";
  }
  if (/\b(weapon|sword|axe|bow|crossbow|spear|dagger|mace|hammer|flail|staff sling)\b/.test(normalized)) {
    return "weapon";
  }
  if (/\b(armor|armour|shield|mail|breastplate|plate|helm|gauntlet)\b/.test(normalized)) {
    return "armor";
  }
  if (/\b(tool|kit|gear|equipment)\b/.test(normalized)) return "equipment";
  return null;
}

function mapInventoryItemType(
  value: unknown,
  fallbackName?: string | null,
  fallbackDescription?: string | null,
): ItemSchemaData["itemType"] {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
      case "armor":
      case "weapon":
      case "equipment":
      case "consumable":
      case "feat":
      case "spell":
      case "wand":
      case "staff":
      case "other":
        return normalized;
      default:
        break;
    }
  }

  const inferred = inferInventoryItemTypeFromText(
    [fallbackName, fallbackDescription]
      .filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
      .join(" "),
  );

  return inferred ?? "equipment";
}

function normalizeInventoryEntryImage(
  img: string | null | undefined,
  itemType: ItemSchemaData["itemType"],
): string | null {
  const trimmed = typeof img === "string" ? img.trim() : "";
  if (!trimmed) {
    return null;
  }

  if (INVENTORY_DEFAULT_IMAGE_OVERRIDE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return getDefaultItemImage(itemType);
  }

  const expectedDefault = getDefaultItemImage(itemType);
  const isPf2eDefaultIcon = /systems\/pf2e\/icons\/default-icons\//i.test(trimmed);
  if (isPf2eDefaultIcon && trimmed !== expectedDefault) {
    return expectedDefault;
  }

  return trimmed;
}

function coerceLootInventoryItemType(itemType: ItemSchemaData["itemType"]): ItemSchemaData["itemType"] {
  switch (itemType) {
    case "feat":
    case "spell":
      return "equipment";
    default:
      return itemType;
  }
}

function createInventoryItem(
  actor: ActorSchemaData,
  entry: ActorInventoryEntry,
  index: number,
  options: { lootOnly?: boolean } = {},
): FoundryActorGenericItemSource {
  const mappedType = mapInventoryItemType(entry.itemType, entry.name, entry.description);
  const itemType = options.lootOnly ? coerceLootInventoryItemType(mappedType) : mappedType;
  const slug = entry.slug?.trim() || toSlug(entry.name) || toSlug(generateId());
  const normalizedImg = normalizeInventoryEntryImage(entry.img ?? null, itemType);
  const source = prepareItemSource({
    schema_version: actor.schema_version,
    systemId: actor.systemId,
    type: "item",
    slug,
    name: entry.name,
    itemType,
    rarity: "common",
    level: entry.level ?? 0,
    price: null,
    traits: [],
    description: entry.description ?? "",
    img: normalizedImg,
    source: actor.source,
    publication: actor.publication,
  });

  const system = clone(source.system) as Record<string, unknown>;
  const quantity = typeof entry.quantity === "number" && Number.isFinite(entry.quantity) && entry.quantity > 0
    ? Math.floor(entry.quantity)
    : 1;
  system.quantity = quantity;

  return {
    _id: generateStableId(`inventory:${actor.slug || actor.name}:${index}`),
    name: source.name,
    type: source.type,
    img: source.img,
    system,
    effects: [],
    folder: null,
    sort: 2_000_000 + index * 10_000,
    flags: clone(source.flags),
    _stats: clone(source._stats),
  };
}

type FoundryActorSkillMap = Record<string, { value: number; base: number; details: string }>;

function buildSkillMap(
  skills: ActorSchemaData["skills"],
): FoundryActorSkillMap {
  const result: FoundryActorSkillMap = {};
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

function buildPrototypeToken(
  actor: ActorSchemaData,
  options: { hpBarAttribute?: string | null } = {},
): Record<string, unknown> {
  const img = actor.img?.trim() || resolveDefaultActorImage(actor.actorType);
  const tokenSize = TOKEN_SIZE_MAP[actor.size] ?? 1;
  const hpBarAttribute = Object.hasOwn(options, "hpBarAttribute") ? options.hpBarAttribute ?? null : "attributes.hp";
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
    bar1: { attribute: hpBarAttribute },
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

export async function toFoundryActorDataWithCompendium(
  actor: ActorSchemaData,
  options: { resolveOfficialContent?: boolean } = {},
): Promise<FoundryActorSource> {
  const source = prepareActorSource(actor);
  if (options.resolveOfficialContent !== false) {
    source.items = await resolveActorItems(source.items);
  }
  return source;
}

export async function importActor(
  json: ActorGenerationResult,
  options: ImportOptions = {},
): Promise<Actor> {
  assertSystemCompatibility(json.systemId);
  const source = prepareGeneratedActorSource(json);
  source.items = await resolveActorItems(source.items);
  const { packId, folderId, actorId } = options;

  if (folderId) {
    source.folder = folderId;
  }

  if (actorId) {
    const targeted = (game.actors as Collection<Actor> | undefined)?.get(actorId);
    if (targeted) {
      await updateActorDocument(targeted, source, folderId);
      return targeted;
    }
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

export async function importItem(
  json: ItemSchemaData,
  options: ImportOptions = {},
): Promise<Item> {
  assertSystemCompatibility(json.systemId);
  ensureValidItem(json);
  const source = prepareItemSource(json);
  const { packId, folderId, itemId } = options;

  if (folderId) {
    source.folder = folderId;
  }

  if (itemId) {
    const targeted = (game.items as Collection<Item> | undefined)?.get(itemId);
    if (targeted) {
      const updateData = { ...source } as Record<string, unknown>;
      if (folderId) {
        updateData.folder = folderId;
      }

      await targeted.update(updateData as any);
      return targeted;
    }
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
      throw new Error(`Failed to import item "${json.name}" into pack ${pack.collection}`);
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
    throw new Error(`Failed to create item "${json.name}" in the world.`);
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

