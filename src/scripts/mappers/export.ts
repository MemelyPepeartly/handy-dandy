import type {
  ActionSchemaData,
  ActorSchemaData,
  ActionExecution,
  ItemSchemaData,
  ActorCategory,
  ItemCategory,
  PublicationData,
  Rarity,
} from "../schemas";
import {
  ACTION_EXECUTIONS,
  ACTOR_CATEGORIES,
  ITEM_CATEGORIES,
  LATEST_SCHEMA_VERSION,
  PUBLICATION_DEFAULT,
  RARITIES,
} from "../schemas";

const DEFAULT_SCHEMA_VERSION = LATEST_SCHEMA_VERSION;
const DEFAULT_SYSTEM_ID = "pf2e" as const;

type ActorSpellcastingEntry = NonNullable<ActorSchemaData["spellcasting"]>[number];
type ActorSpellList = ActorSpellcastingEntry["spells"];

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

function normalizePublication(value: unknown, fallbackTitle?: string): PublicationData {
  if (!value || typeof value !== "object") {
    return {
      title: normalizeString(fallbackTitle) ?? PUBLICATION_DEFAULT.title,
      authors: PUBLICATION_DEFAULT.authors,
      license: PUBLICATION_DEFAULT.license,
      remaster: PUBLICATION_DEFAULT.remaster,
    };
  }

  const record = value as { title?: unknown; authors?: unknown; license?: unknown; remaster?: unknown };
  const rawTitle = typeof record.title === "string" ? record.title.trim() : undefined;
  const rawAuthors = typeof record.authors === "string" ? record.authors.trim() : undefined;
  const rawLicense = typeof record.license === "string" ? record.license.trim() : undefined;
  const remaster = typeof record.remaster === "boolean" ? record.remaster : PUBLICATION_DEFAULT.remaster;

  const title = rawTitle !== undefined ? rawTitle : normalizeString(fallbackTitle) ?? PUBLICATION_DEFAULT.title;
  const authors = rawAuthors !== undefined ? rawAuthors : PUBLICATION_DEFAULT.authors;
  const license = rawLicense !== undefined ? rawLicense : PUBLICATION_DEFAULT.license;

  return { title, authors, license, remaster };
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

function collectLanguages(doc: FoundryActor): string[] {
  const sources: unknown[] = [];
  const traitLanguages = doc.system?.traits?.languages;
  if (traitLanguages !== undefined) {
    if (typeof traitLanguages === "object" && traitLanguages !== null && "value" in traitLanguages) {
      sources.push((traitLanguages as { value?: unknown }).value);
    } else {
      sources.push(traitLanguages);
    }
  }

  const detailLanguages = doc.system?.details?.languages;
  if (detailLanguages !== undefined) {
    if (typeof detailLanguages === "object" && detailLanguages !== null && "value" in detailLanguages) {
      sources.push((detailLanguages as { value?: unknown }).value);
    } else {
      sources.push(detailLanguages);
    }
  }

  const languagesList = sources
    .map((source) => normalizeLanguages(source))
    .filter((value): value is string[] => Array.isArray(value) && value.length > 0)
    .flat();

  const result: string[] = [];
  const seen = new Set<string>();
  for (const language of languagesList) {
    const key = language.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(language);
  }
  return result;
}

function extractValueProperty<T>(value: unknown): T | undefined {
  if (value && typeof value === "object" && "value" in value) {
    return (value as { value?: T }).value;
  }
  return undefined;
}

const ACTOR_SIZE_VALUES = new Set(["tiny", "sm", "med", "lg", "huge", "grg"]);

function normalizeActorSize(value: unknown): ActorSchemaData["size"] {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (ACTOR_SIZE_VALUES.has(normalized)) {
      return normalized as ActorSchemaData["size"];
    }
  }
  return "med";
}

function normalizeAlignment(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "object" && value !== null && "value" in value) {
    return normalizeAlignment((value as { value?: unknown }).value ?? null);
  }
  return null;
}

function extractActorAttributes(doc: FoundryActor): ActorSchemaData["attributes"] {
  const attributes = (doc.system?.attributes ?? {}) as Record<string, unknown>;
  const hpSource = (attributes.hp ?? {}) as Record<string, unknown>;
  const acSource = (attributes.ac ?? {}) as Record<string, unknown>;
  const speedSource = (attributes.speed ?? {}) as Record<string, unknown>;
  const savesSource = (doc.system?.saves ?? {}) as Record<string, unknown>;
  const perceptionSource = (doc.system?.perception ?? {}) as Record<string, unknown>;

  const hpValue = coerceNonNegativeInteger(hpSource.value, 1);
  const hpMax = coerceNonNegativeInteger(hpSource.max, hpValue);
  const hpTemp = coerceNonNegativeInteger(hpSource.temp, 0);

  return {
    hp: {
      value: hpValue,
      max: hpMax,
      temp: hpTemp,
      details: coerceOptionalString(hpSource.details),
    },
    ac: {
      value: coerceInteger(hpSource.ac ?? acSource.value, 10),
      details: coerceOptionalString(acSource.details),
    },
    perception: {
      value: coerceInteger(perceptionSource.mod ?? perceptionSource.value, 0),
      details: coerceOptionalString(perceptionSource.details),
      senses: extractSenses(perceptionSource.senses),
    },
    speed: {
      value: coerceNonNegativeInteger(speedSource.value, 0),
      details: coerceOptionalString(speedSource.details),
      other: extractOtherSpeeds(speedSource.otherSpeeds),
    },
    saves: {
      fortitude: {
        value: coerceInteger((savesSource.fortitude as { value?: unknown })?.value, 0),
        details: coerceOptionalString((savesSource.fortitude as { saveDetail?: unknown })?.saveDetail),
      },
      reflex: {
        value: coerceInteger((savesSource.reflex as { value?: unknown })?.value, 0),
        details: coerceOptionalString((savesSource.reflex as { saveDetail?: unknown })?.saveDetail),
      },
      will: {
        value: coerceInteger((savesSource.will as { value?: unknown })?.value, 0),
        details: coerceOptionalString((savesSource.will as { saveDetail?: unknown })?.saveDetail),
      },
    },
    immunities: extractDamageAdjustments(attributes.immunities),
    weaknesses: extractDamageAdjustments(attributes.weaknesses, true) as ActorSchemaData["attributes"]["weaknesses"],
    resistances: extractDamageAdjustments(attributes.resistances, false, true) as ActorSchemaData["attributes"]["resistances"],
  };
}

function extractSenses(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }
        if (typeof entry === "object" && entry !== null) {
          const type = (entry as { type?: unknown }).type;
          if (typeof type === "string") {
            return type.trim();
          }
        }
        return "";
      })
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function extractOtherSpeeds(value: unknown): ActorSchemaData["attributes"]["speed"]["other"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as { type?: unknown; value?: unknown; label?: unknown; details?: unknown };
      const type = typeof record.type === "string" ? record.type.trim() : typeof record.label === "string" ? record.label.trim() : "";
      const distance = coerceNonNegativeInteger(record.value, 0);
      if (!type || !distance) {
        return null;
      }
      return { type: type.toLowerCase(), value: distance, details: coerceOptionalString(record.details) };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function extractDamageAdjustments(
  value: unknown,
  requireValue = false,
  includeDoubleVs = false,
): { type: string; value?: number; exceptions: string[]; doubleVs?: string[]; details?: string | null }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as { type?: unknown; value?: unknown; exceptions?: unknown; doubleVs?: unknown; notes?: unknown; details?: unknown };
      const type = typeof record.type === "string" ? record.type.trim().toLowerCase() : "";
      if (!type) {
        return null;
      }
      const result: { type: string; value?: number; exceptions: string[]; doubleVs?: string[]; details?: string | null } = {
        type,
        exceptions: normalizeLanguages(record.exceptions) ?? [],
        details: coerceOptionalString(record.details ?? record.notes),
      };
      const amount = coerceNonNegativeInteger(record.value, 0);
      if (!requireValue || amount > 0) {
        result.value = amount;
      }
      if (includeDoubleVs) {
        result.doubleVs = normalizeLanguages(record.doubleVs) ?? [];
      }
      return result;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function extractActorAbilities(source: unknown): ActorSchemaData["abilities"] {
  const abilities = (source ?? {}) as Record<string, unknown>;
  return {
    str: extractAbility(abilities.str),
    dex: extractAbility(abilities.dex),
    con: extractAbility(abilities.con),
    int: extractAbility(abilities.int),
    wis: extractAbility(abilities.wis),
    cha: extractAbility(abilities.cha),
  };
}

function extractAbility(value: unknown): number {
  if (typeof value === "number") {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
  if (value && typeof value === "object") {
    const record = value as { mod?: unknown; value?: unknown };
    const mod = extractAbility(record.mod);
    if (mod) {
      return mod;
    }
    return extractAbility(record.value);
  }
  return 0;
}

function extractActorSkills(source: unknown): ActorSchemaData["skills"] {
  if (!source || typeof source !== "object") {
    return [];
  }
  const entries = Object.entries(source as Record<string, unknown>);
  return entries.map(([slug, value]) => {
    const record = (value ?? {}) as { value?: unknown; base?: unknown; mod?: unknown; details?: unknown };
    const modifier = coerceInteger(record.value, coerceInteger(record.base, coerceInteger(record.mod, 0)));
    const normalizedSlug = slug.trim().toLowerCase();
    return {
      slug: normalizedSlug,
      modifier,
      details: coerceOptionalString(record.details),
    } satisfies ActorSchemaData["skills"][number];
  });
}

function extractActorStrikes(items: unknown): ActorSchemaData["strikes"] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .filter((item): item is { type?: string; name?: string; system?: Record<string, unknown> } =>
      !!item && typeof item === "object" && (item as { type?: string }).type === "melee",
    )
    .map((item) => {
      const system = (item.system ?? {}) as Record<string, unknown>;
      const traitsSource = extractValueProperty<unknown>(system.traits) ?? system.traits;
      const traits = normalizeTraits(traitsSource) ?? [];
      const attackBonus = coerceInteger((system.bonus as { value?: unknown })?.value ?? system.bonus, 0);
      const damageRolls = extractDamageRolls(system.damageRolls);
      const effectsSource = extractValueProperty<unknown>(system.attackEffects) ?? system.attackEffects;
      const effects = normalizeLanguages(effectsSource) ?? [];
      const descriptionSource = extractValueProperty<string>(system.description) ?? system.description;
      const description = normalizeHtml(descriptionSource);
      const type = determineStrikeType(traits);
      return {
        name: item.name ?? "Unnamed Strike",
        type,
        attackBonus,
        traits,
        damage: damageRolls,
        effects,
        description: description || null,
      } satisfies ActorSchemaData["strikes"][number];
    });
}

function extractDamageRolls(value: unknown): ActorSchemaData["strikes"][number]["damage"] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const entries = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as { damage?: unknown; damageType?: unknown; category?: unknown };
      const formula = typeof record.damage === "string" ? record.damage.trim() : "";
      if (!formula) {
        return null;
      }
      return {
        formula,
        damageType: typeof record.damageType === "string" ? record.damageType.trim() : null,
        notes: null,
      } satisfies ActorSchemaData["strikes"][number]["damage"][number];
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function determineStrikeType(traits: string[]): ActorSchemaData["strikes"][number]["type"] {
  const rangedTraits = traits.filter((trait) => trait.startsWith("range") || trait.includes("thrown"));
  return rangedTraits.length ? "ranged" : "melee";
}

function extractActorActions(items: unknown): ActorSchemaData["actions"] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .filter((item): item is { type?: string; name?: string; system?: Record<string, unknown> } =>
      !!item && typeof item === "object" && (item as { type?: string }).type === "action",
    )
    .map((item) => {
      const system = (item.system ?? {}) as Record<string, unknown>;
      const actionType = (typeof system.actionType === "string"
        ? system.actionType
        : extractValueProperty<string>(system.actionType)) as string | undefined;
      const actionCountRaw =
        typeof system.actions === "number" || typeof system.actions === "string"
          ? system.actions
          : extractValueProperty<unknown>(system.actions);
      const actionCost = resolveActorActionCost(actionType, actionCountRaw);
      const traitsSource = extractValueProperty<unknown>(system.traits) ?? system.traits;
      const traits = normalizeTraits(traitsSource) ?? [];
      return {
        name: item.name ?? "Unnamed Action",
        actionCost,
        traits,
        description: normalizeHtml(extractValueProperty<string>(system.description) ?? system.description) || "",
        requirements:
          normalizeHtml(extractValueProperty<string>(system.requirements) ?? system.requirements) || null,
        trigger: normalizeHtml(extractValueProperty<string>(system.trigger) ?? system.trigger) || null,
        frequency: normalizeHtml(extractValueProperty<string>(system.frequency) ?? system.frequency) || null,
      } satisfies ActorSchemaData["actions"][number];
    });
}

function resolveActorActionCost(actionType: string | undefined, count: unknown): ActorSchemaData["actions"][number]["actionCost"] {
  const normalizedType = typeof actionType === "string" ? actionType.trim().toLowerCase() : "";
  const numericCount = coerceInteger(count, 0);
  if (normalizedType === "reaction") {
    return "reaction";
  }
  if (normalizedType === "free") {
    return "free";
  }
  if (normalizedType === "passive") {
    return "passive";
  }
  if (numericCount >= 3) {
    return "three-actions";
  }
  if (numericCount === 2) {
    return "two-actions";
  }
  if (numericCount === 1) {
    return "one-action";
  }
  return "passive";
}

function extractActorSpellcasting(items: unknown): ActorSpellcastingEntry[] {
  if (!Array.isArray(items)) {
    return [];
  }
  const entries = items.filter((item): item is { type?: string; name?: string; system?: Record<string, unknown> } =>
    !!item && typeof item === "object" && (item as { type?: string }).type === "spellcastingEntry",
  );

  return entries.map((item) => {
    const system = (item.system ?? {}) as Record<string, unknown>;
    const traditionRaw = extractValueProperty<unknown>(system.tradition) ?? system.tradition;
    const castingTypeRaw =
      extractValueProperty<unknown>(system.prepared) ??
      system.prepared ??
      extractValueProperty<unknown>(system.castingType) ??
      system.castingType;
    const attackBonus = coerceInteger((system.spellAttack as { value?: unknown })?.value ?? system.spellAttack, 0);
    const saveDCRecord = (system.spelldc as { value?: unknown; dc?: unknown }) ?? {};
    const saveDC = coerceInteger(saveDCRecord.dc ?? saveDCRecord.value, 0);
    const spells = extractSpellList(system.slots);
    return {
      name: item.name ?? "Spellcasting",
      tradition: typeof traditionRaw === "string" ? traditionRaw.trim().toLowerCase() : "arcane",
      castingType: typeof castingTypeRaw === "string"
        ? (castingTypeRaw.trim().toLowerCase() as ActorSpellcastingEntry["castingType"])
        : "innate",
      attackBonus,
      saveDC,
      notes: null,
      spells,
    } satisfies ActorSpellcastingEntry;
  });
}

function extractSpellList(value: unknown): ActorSpellList {
  if (!value || typeof value !== "object") {
    return [];
  }
  const slots = value as Record<string, unknown>;
  const result: ActorSpellList = [];
  for (const [key, slotValue] of Object.entries(slots)) {
    const match = key.match(/slot(\d+)/i);
    if (!match) {
      continue;
    }
    const level = Number(match[1] ?? 0);
    const preparedSource = (slotValue as { prepared?: unknown }).prepared;
    const prepared = Array.isArray(preparedSource)
      ? preparedSource
      : extractValueProperty<unknown>(preparedSource) ?? preparedSource;
    if (!Array.isArray(prepared)) {
      continue;
    }
    for (const entry of prepared) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as { spell?: { name?: string; system?: { description?: { value?: string } } }; id?: string };
      const name = record.spell?.name ?? "";
      if (!name) {
        continue;
      }
      const description = normalizeHtml(record.spell?.system?.description?.value ?? "");
      result.push({
        level,
        name,
        description: description || null,
        tradition: null,
      });
    }
  }
  return result;
}

function coerceOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coerceInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return fallback;
}

function coerceNonNegativeInteger(value: unknown, fallback: number): number {
  const result = coerceInteger(value, fallback);
  return result < 0 ? fallback : result;
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
    publication?: {
      title?: string | null;
      authors?: string | null;
      license?: string | null;
      remaster?: boolean | null;
    };
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
    publication?: {
      title?: string | null;
      authors?: string | null;
      license?: string | null;
      remaster?: boolean | null;
    };
  } & Record<string, unknown>;
};

export type FoundryActorItem = {
  type?: string;
  name?: string;
  system?: Record<string, unknown>;
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
      size?: { value?: string | null } | string | null;
    };
    details?: {
      level?: { value?: number | string | null } | number | string | null;
      languages?: { value?: unknown } | unknown;
      source?: { value?: string | null } | string | null;
      publication?: {
        title?: string | null;
        authors?: string | null;
        license?: string | null;
        remaster?: boolean | null;
      };
    } & Record<string, unknown>;
  } & Record<string, unknown>;
  items?: FoundryActorItem[] | null;
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
  const publication = normalizePublication(doc.system?.publication, source);

  const result: ActionSchemaData = {
    schema_version: DEFAULT_SCHEMA_VERSION,
    systemId: DEFAULT_SYSTEM_ID,
    type: "action",
    slug,
    name: doc.name,
    actionType: resolveActionType(actionTypeRaw),
    requirements,
    description,
    rarity,
    publication,
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
  const publication = normalizePublication(doc.system?.publication, source);

  const result: ItemSchemaData = {
    schema_version: DEFAULT_SCHEMA_VERSION,
    systemId: DEFAULT_SYSTEM_ID,
    type: "item",
    slug,
    name: doc.name,
    itemType: resolveItemType(doc.type),
    rarity: normalizeRarity(rarityValue),
    level: Number.isFinite(level) ? Number(level) : 0,
    publication,
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

  const languages = collectLanguages(doc);
  const source = normalizeSource(doc.system?.details?.source ?? doc.system?.source) ?? "";
  const publication = normalizePublication(doc.system?.details?.publication, source);
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
    size: normalizeActorSize(
      typeof doc.system?.traits?.size === "string"
        ? doc.system.traits.size
        : extractValueProperty<string>(doc.system?.traits?.size),
    ),
    traits,
    alignment: normalizeAlignment(doc.system?.details?.alignment),
    languages,
    attributes: extractActorAttributes(doc),
    abilities: extractActorAbilities(doc.system?.abilities),
    skills: extractActorSkills(doc.system?.skills),
    strikes: extractActorStrikes(doc.items),
    actions: extractActorActions(doc.items),
    spellcasting: extractActorSpellcasting(doc.items),
    description: normalizeHtml(doc.system?.details?.publicNotes),
    recallKnowledge: normalizeHtml(doc.system?.details?.privateNotes),
    img,
    source,
    publication,
  };

  if (!result.spellcasting?.length) {
    delete result.spellcasting;
  }

  return result;
}
