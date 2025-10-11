import type {
  ActionSchemaData,
  ActorSchemaData,
  ActionExecution,
  ItemSchemaData,
  ActorCategory,
  ItemCategory,
  Rarity
} from "../schemas";
import {
  ACTION_EXECUTIONS,
  ACTOR_CATEGORIES,
  ITEM_CATEGORIES,
  LATEST_SCHEMA_VERSION,
  RARITIES
} from "../schemas";

const DEFAULT_SCHEMA_VERSION = LATEST_SCHEMA_VERSION;
const DEFAULT_SYSTEM_ID = "pf2e" as const;

const ACTION_TYPE_MAP: Record<string, ActionExecution> = {
  one: "one-action",
  "1": "one-action",
  two: "two-actions",
  "2": "two-actions",
  three: "three-actions",
  "3": "three-actions",
  free: "free",
  reaction: "reaction"
};

const ITEM_TYPE_MAP: Record<string, ItemCategory> = {
  armor: "armor",
  shield: "armor",
  weapon: "weapon",
  equipment: "equipment",
  consumable: "consumable",
  feat: "feat",
  spell: "spell",
  wand: "wand",
  staff: "staff"
};

const ACTOR_TYPE_MAP: Record<string, ActorCategory> = {
  character: "character",
  npc: "npc",
  hazard: "hazard",
  vehicle: "vehicle",
  familiar: "familiar"
};

const PLACEHOLDER_IMAGE_PATTERNS = [
  /icons\/svg\/mystery-man\.svg$/i,
  /systems\/pf2e\/icons\/default-icons\//i
];

const HTML_ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'"
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeSlug(doc: { system?: { slug?: string | null }; slug?: string | null; name: string }): string {
  const candidate = doc.system?.slug ?? doc.slug;
  const base = candidate && candidate.trim() ? candidate.trim() : doc.name ?? "";
  const slug = slugify(base);
  return slug || "unnamed";
}

function normalizeImg(img: unknown): string | undefined {
  if (!img || typeof img !== "string") {
    return undefined;
  }

  const trimmed = img.trim();
  if (!trimmed) {
    return undefined;
  }

  if (PLACEHOLDER_IMAGE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return undefined;
  }

  return trimmed;
}

function normalizeSource(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === "object") {
    const candidate = (value as { value?: unknown }).value;
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      return trimmed || undefined;
    }
  }

  return undefined;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/(&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;)/g, (entity) => HTML_ENTITY_MAP[entity] ?? entity);
}

function normalizeHtml(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const decoded = decodeHtmlEntities(value)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?p>/gi, "\n")
    .replace(/<\/?li>/gi, (match) => (match.startsWith("</") ? "\n" : "• "))
    .replace(/<\/?ul>/gi, "\n")
    .replace(/<\/?ol>/gi, "\n")
    .replace(/<[^>]*>/g, "");

  const lines = decoded
    .split(/\r?\n/)
    .map((line) => line.trim());

  const compacted: string[] = [];
  for (const line of lines) {
    if (line) {
      compacted.push(line);
      continue;
    }

    if (compacted.length && compacted[compacted.length - 1] !== "") {
      compacted.push("");
    }
  }

  while (compacted.length && compacted[compacted.length - 1] === "") {
    compacted.pop();
  }

  return compacted.join("\n").trim();
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeRarity(value: unknown): Rarity {
  const rarity = typeof value === "string" ? value.toLowerCase().trim() : undefined;
  if (rarity && (RARITIES as readonly string[]).includes(rarity)) {
    return rarity as Rarity;
  }

  return "common";
}

function normalizeTraits(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const items: string[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim()) {
        items.push(entry.trim());
      }
    }
  } else if (typeof value === "string") {
    items.push(
      ...value
        .split(/[,;\n]/)
        .map((part) => part.trim())
        .filter(Boolean)
    );
  }

  return items.length ? items : undefined;
}

const COIN_VALUES: Record<string, number> = {
  pp: 10,
  gp: 1,
  sp: 0.1,
  cp: 0.01
};

function extractCoinTotal(value: Record<string, unknown>): { total: number; matched: boolean } {
  let total = 0;
  let matched = false;
  for (const [denomination, amount] of Object.entries(value)) {
    if (!Object.hasOwn(COIN_VALUES, denomination)) {
      continue;
    }

    const numericAmount = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(numericAmount)) {
      continue;
    }

    matched = true;
    total += numericAmount * COIN_VALUES[denomination];
  }

  return { total: Math.round(total * 100) / 100, matched };
}

function normalizePrice(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const matches = value.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(pp|gp|sp|cp)/gi);
    let total = 0;
    let matched = false;
    for (const match of matches) {
      matched = true;
      const amount = Number(match[1]);
      const denomination = match[2].toLowerCase();
      if (!Number.isFinite(amount) || !Object.hasOwn(COIN_VALUES, denomination)) {
        continue;
      }
      total += amount * COIN_VALUES[denomination];
    }

    if (matched) {
      return Math.round(total * 100) / 100;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  if (value && typeof value === "object") {
    const priceRecord = (value as { value?: unknown }).value ?? value;
    if (priceRecord && typeof priceRecord === "object") {
      const { total, matched } = extractCoinTotal(priceRecord as Record<string, unknown>);
      if (matched) {
        return total;
      }
    }
  }

  return undefined;
}

function normalizeLanguages(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const languages = value
      .map((lang) => (typeof lang === "string" ? lang.trim() : ""))
      .filter(Boolean);
    return languages.length ? languages : undefined;
  }

  if (typeof value === "string") {
    const languages = value
      .split(/[,;\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
    return languages.length ? languages : undefined;
  }

  return undefined;
}

function resolveActionType(value: unknown): ActionExecution {
  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim();
    if (Object.hasOwn(ACTION_TYPE_MAP, normalized)) {
      return ACTION_TYPE_MAP[normalized];
    }
    if ((ACTION_EXECUTIONS as readonly string[]).includes(normalized)) {
      return normalized as ActionExecution;
    }
  }

  if (typeof value === "number") {
    const mapped = ACTION_TYPE_MAP[String(value)];
    if (mapped) {
      return mapped;
    }
  }

  return "free";
}

function resolveItemType(value: unknown): ItemCategory {
  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim();
    const mapped = ITEM_TYPE_MAP[normalized];
    if (mapped) {
      return mapped;
    }

    if ((ITEM_CATEGORIES as readonly string[]).includes(normalized)) {
      return normalized as ItemCategory;
    }
  }

  return "other";
}

function resolveActorType(value: unknown): ActorCategory {
  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim();
    const mapped = ACTOR_TYPE_MAP[normalized];
    if (mapped) {
      return mapped;
    }

    if ((ACTOR_CATEGORIES as readonly string[]).includes(normalized)) {
      return normalized as ActorCategory;
    }
  }

  return "npc";
}

export interface FoundryBaseDocument {
  name: string;
  slug?: string | null;
  system?: Record<string, unknown>;
  img?: string | null;
}

export type FoundryAction = FoundryBaseDocument & {
  type?: string;
  system?: {
    slug?: string | null;
    description?: { value?: string | null } | string;
    traits?: {
      value?: unknown;
      rarity?: string | null;
    };
    actionType?: { value?: string | null } | string | null;
    actions?: { value?: number | string | null } | number | string | null;
    requirements?: { value?: string | null } | string | null;
    source?: { value?: string | null } | string | null;
  } & Record<string, unknown>;
};

export type FoundryItem = FoundryBaseDocument & {
  type?: string;
  system?: {
    slug?: string | null;
    traits?: {
      value?: unknown;
      rarity?: string | null;
    };
    rarity?: { value?: string | null } | string | null;
    description?: { value?: string | null } | string | null;
    level?: { value?: number | string | null } | number | string | null;
    price?: { value?: unknown } | unknown;
    source?: { value?: string | null } | string | null;
  } & Record<string, unknown>;
};

export type FoundryActor = FoundryBaseDocument & {
  type?: string;
  system?: {
    slug?: string | null;
    traits?: {
      value?: unknown;
      rarity?: string | null;
      traits?: { value?: unknown };
      languages?: { value?: unknown } | unknown;
    };
    details?: {
      level?: { value?: number | string | null } | number | string | null;
      languages?: { value?: unknown } | unknown;
      source?: { value?: string | null } | string | null;
    } & Record<string, unknown>;
  } & Record<string, unknown>;
};

export function fromFoundryAction(doc: FoundryAction): ActionSchemaData {
  const slug = normalizeSlug({ ...doc, system: doc.system });
  const rawDescription =
    typeof doc.system?.description === "string"
      ? normalizeHtml(doc.system.description)
      : normalizeHtml(doc.system?.description?.value);
  const description = rawDescription || doc.name;

  const traitsValue = doc.system?.traits?.value;
  const traits = normalizeTraits(traitsValue);

  const actionTypeRaw =
    (typeof doc.system?.actionType === "string"
      ? doc.system?.actionType
      : doc.system?.actionType?.value) ??
    (typeof doc.system?.actions === "string" || typeof doc.system?.actions === "number"
      ? doc.system?.actions
      : doc.system?.actions?.value);

  const rawRequirements =
    (typeof doc.system?.requirements === "string"
      ? doc.system?.requirements
      : doc.system?.requirements?.value) ?? "";
  const requirements = normalizeHtml(rawRequirements) || "";

  const rarity = normalizeRarity(doc.system?.traits?.rarity);
  const source = normalizeSource(doc.system?.source);

  const result: ActionSchemaData = {
    schema_version: DEFAULT_SCHEMA_VERSION,
    systemId: DEFAULT_SYSTEM_ID,
    type: "action",
    slug,
    name: doc.name,
    actionType: resolveActionType(actionTypeRaw),
    requirements,
    description,
    rarity
  };

  const img = normalizeImg(doc.img);
  if (img) {
    result.img = img;
  }

  if (traits?.length) {
    result.traits = traits;
  }

  if (source) {
    result.source = source;
  }

  return result;
}

export function fromFoundryItem(doc: FoundryItem): ItemSchemaData {
  const slug = normalizeSlug({ ...doc, system: doc.system });
  const rawDescription =
    typeof doc.system?.description === "string"
      ? normalizeHtml(doc.system.description)
      : normalizeHtml(doc.system?.description?.value);
  const description = rawDescription || undefined;

  const levelRaw =
    typeof doc.system?.level === "number" || typeof doc.system?.level === "string"
      ? doc.system?.level
      : doc.system?.level?.value;

  const level = Number(levelRaw ?? 0);

  const traitsValue = doc.system?.traits?.value;
  const traits = normalizeTraits(traitsValue);

  const rarityValue = doc.system?.traits?.rarity ??
    (typeof doc.system?.rarity === "string" ? doc.system.rarity : doc.system?.rarity?.value);
  const priceValue = doc.system?.price;
  const source = normalizeSource(doc.system?.source);

  const result: ItemSchemaData = {
    schema_version: DEFAULT_SCHEMA_VERSION,
    systemId: DEFAULT_SYSTEM_ID,
    type: "item",
    slug,
    name: doc.name,
    itemType: resolveItemType(doc.type),
    rarity: normalizeRarity(rarityValue),
    level: Number.isFinite(level) ? Number(level) : 0
  };

  const price = normalizePrice(priceValue);
  if (typeof price === "number") {
    result.price = price;
  }

  if (traits?.length) {
    result.traits = traits;
  }

  if (source) {
    result.source = source;
  }

  if (description) {
    result.description = description;
  }

  const img = normalizeImg(doc.img);
  if (img) {
    result.img = img;
  }

  return result;
}

export function fromFoundryActor(doc: FoundryActor): ActorSchemaData {
  const slug = normalizeSlug({ ...doc, system: doc.system });

  const levelRaw =
    typeof doc.system?.details?.level === "number" || typeof doc.system?.details?.level === "string"
      ? doc.system?.details?.level
      : doc.system?.details?.level?.value;
  const level = Number(levelRaw ?? 0);

  const traitSource =
    doc.system?.traits?.traits?.value ?? doc.system?.traits?.value ?? doc.system?.traits;
  const traits = normalizeTraits(traitSource) ?? [];

  const rarityValue = doc.system?.traits?.rarity;

  const languagesSources: unknown[] = [];
  const languagesSource = doc.system?.traits?.languages;
  const traitLanguages =
    typeof languagesSource === "object" && languagesSource !== null && "value" in languagesSource
      ? (languagesSource as { value?: unknown }).value
      : languagesSource;
  if (traitLanguages !== undefined) {
    languagesSources.push(traitLanguages);
  }

  const detailLanguages =
    doc.system?.details?.languages &&
    typeof doc.system?.details?.languages === "object" &&
    doc.system?.details?.languages !== null &&
    "value" in doc.system?.details?.languages
      ? (doc.system?.details?.languages as { value?: unknown }).value
      : doc.system?.details?.languages;
  if (detailLanguages !== undefined) {
    languagesSources.push(detailLanguages);
  }

  const languagesList = languagesSources
    .map((source) => normalizeLanguages(source))
    .filter((value): value is string[] => Array.isArray(value) && value.length > 0)
    .flat();

  const languages: string[] = [];
  const seenLanguages = new Set<string>();
  for (const language of languagesList) {
    const key = language.toLowerCase();
    if (seenLanguages.has(key)) {
      continue;
    }
    seenLanguages.add(key);
    languages.push(language);
  }

  const source = normalizeSource(doc.system?.details?.source ?? doc.system?.source) ?? "";
  const img = normalizeImg(doc.img) ?? null;

  const result: ActorSchemaData = {
    schema_version: DEFAULT_SCHEMA_VERSION,
    systemId: DEFAULT_SYSTEM_ID,
    type: "actor",
    slug,
    name: doc.name,
    actorType: resolveActorType(doc.type),
    rarity: normalizeRarity(rarityValue),
    level: Number.isFinite(level) ? Number(level) : 0,
    traits,
    languages,
    img,
    source
  };

  return result;
}
