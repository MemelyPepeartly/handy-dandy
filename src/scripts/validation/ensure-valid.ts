import type { ErrorObject } from "ajv";
import {
  ACTION_EXECUTIONS,
  ACTOR_CATEGORIES,
  ACTOR_SIZES,
  ENTITY_TYPES,
  LATEST_SCHEMA_VERSION,
  ITEM_CATEGORIES,
  RARITIES,
  SYSTEM_IDS,
  schemas,
  validators,
  type ActionSchemaData,
  type ActorSchemaData,
  type ItemSchemaData,
  type PackEntrySchemaData,
  type SchemaDataFor,
  type SchemaMap,
  type ValidatorKey,
} from "../schemas";
import { formatError } from "../helpers/validation";
import type { JsonSchemaDefinition, GPTClient } from "../gpt/client";
import { getDeveloperConsole } from "../dev/state";
import type { ValidationLogPayload } from "../dev/developer-console";
import { getTraitSlugSet } from "../data/trait-dictionaries";

export type { SchemaDataFor, ValidatorKey } from "../schemas";

export interface EnsureValidDiagnostics<K extends ValidatorKey> {
  attempt: number;
  errors: ErrorObject[];
  payload: unknown;
  normalized: unknown;
}

export interface EnsureValidPromptContext<K extends ValidatorKey> {
  type: K;
  attempt: number;
  maxAttempts: number;
  errors: ErrorObject[];
  payload: unknown;
  normalized: unknown;
  diagnostics: EnsureValidDiagnostics<K>[];
}

export interface EnsureValidOptions<K extends ValidatorKey> {
  type: K;
  payload: unknown;
  maxAttempts?: number;
  gptClient?: Pick<GPTClient, "generateWithSchema">;
  promptBuilder?: (context: EnsureValidPromptContext<K>) => string;
  schema?: JsonSchemaDefinition;
}

export interface EnsureValidRepairOptions<K extends ValidatorKey> {
  payload?: unknown;
  maxAttempts?: number;
  gptClient?: Pick<GPTClient, "generateWithSchema">;
  promptBuilder?: (context: EnsureValidPromptContext<K>) => string;
  schema?: JsonSchemaDefinition;
}

type ActorSpellcastingEntry = NonNullable<ActorSchemaData["spellcasting"]>[number];
type ActorSpellcastingList = ActorSpellcastingEntry[];
type ActorSpellList = ActorSpellcastingEntry["spells"];

export class EnsureValidError<K extends ValidatorKey> extends Error {
  public readonly diagnostics: EnsureValidDiagnostics<K>[];
  public readonly originalPayload: unknown;
  public readonly lastPayload: unknown;
  public readonly type: K;
  public readonly repair: (overrides?: EnsureValidRepairOptions<K>) => Promise<SchemaDataFor<K>>;

  constructor(
    message: string,
    diagnostics: EnsureValidDiagnostics<K>[],
    originalPayload: unknown,
    lastPayload: unknown,
    context: {
      type: K;
      repair: (overrides?: EnsureValidRepairOptions<K>) => Promise<SchemaDataFor<K>>;
    },
  ) {
    super(message);
    this.name = "EnsureValidError";
    this.diagnostics = diagnostics;
    this.originalPayload = originalPayload;
    this.lastPayload = lastPayload;
    this.type = context.type;
    this.repair = context.repair;
  }
}

const DEFAULT_MAX_ATTEMPTS = 3;

const ACTION_TYPE_LOOKUP = createEnumLookup(ACTION_EXECUTIONS, {
  one: "one-action",
  "1": "one-action",
  two: "two-actions",
  "2": "two-actions",
  three: "three-actions",
  "3": "three-actions",
});

const ITEM_TYPE_LOOKUP = createEnumLookup(ITEM_CATEGORIES, {
  shield: "armor",
});

const ACTOR_TYPE_LOOKUP = createEnumLookup(ACTOR_CATEGORIES);
const ACTOR_SIZE_LOOKUP = createEnumLookup(ACTOR_SIZES);
const RARITY_LOOKUP = createEnumLookup(RARITIES);
const SYSTEM_ID_LOOKUP = createEnumLookup(SYSTEM_IDS);
const ENTITY_TYPE_LOOKUP = createEnumLookup(ENTITY_TYPES);

export async function ensureValid<K extends ValidatorKey>(
  options: EnsureValidOptions<K>,
): Promise<SchemaDataFor<K>> {
  const { type, payload, gptClient, promptBuilder } = options;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const validator = validators[type];
  const schemaDefinition =
    options.schema ?? createSchemaDefinition(type, schemas[type]);
  const diagnostics: EnsureValidDiagnostics<K>[] = [];

  let attemptPayload = clone(payload);
  const originalPayload = clone(payload);
  let lastNormalized: unknown = attemptPayload;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const normalized = normalizePayload(type, attemptPayload);
    const candidate = clone(normalized);
    const valid = validator(candidate);

    if (valid) {
      return candidate as SchemaDataFor<K>;
    }

    const errors = cloneErrors(validator.errors ?? []);
    diagnostics.push({
      attempt,
      errors,
      payload: clone(attemptPayload),
      normalized: clone(candidate),
    });

    lastNormalized = clone(candidate);

    if (!gptClient || attempt === maxAttempts) {
      break;
    }

    const context: EnsureValidPromptContext<K> = {
      type,
      attempt,
      maxAttempts,
      errors,
      payload: clone(attemptPayload),
      normalized: clone(candidate),
      diagnostics: diagnostics.slice(),
    };

    const prompt = promptBuilder
      ? promptBuilder(context)
      : buildDefaultPrompt(context);

    attemptPayload = await gptClient.generateWithSchema<Record<string, unknown>>(
      prompt,
      schemaDefinition,
    );
  }

  const developerConsole = getDeveloperConsole();
  if (developerConsole) {
    const payload: ValidationLogPayload = {
      type,
      attempts: diagnostics.length,
    };

    if (developerConsole.shouldDumpInvalidJson()) {
      payload.invalidJson = stringifyForConsole(lastNormalized ?? originalPayload);
    }

    if (developerConsole.shouldDumpAjvErrors()) {
      const lastErrors = diagnostics.at(-1)?.errors ?? [];
      payload.errors = lastErrors.map((error) => formatError(error));
    }

    developerConsole.recordValidationFailure(payload);
  }

  throw new EnsureValidError(
    `Failed to validate ${type} payload after ${maxAttempts} attempts`,
    diagnostics,
    originalPayload,
    lastNormalized,
    {
      type,
      repair: async (overrides: EnsureValidRepairOptions<K> = {}) => {
        const payloadSource = Object.hasOwn(overrides, "payload")
          ? overrides.payload
          : lastNormalized ?? originalPayload;

        const retryPayload = clone(payloadSource);

        return ensureValid({
          type,
          payload: retryPayload,
          maxAttempts: overrides.maxAttempts ?? maxAttempts,
          gptClient: overrides.gptClient ?? gptClient,
          promptBuilder: overrides.promptBuilder ?? promptBuilder,
          schema: overrides.schema ?? schemaDefinition,
        });
      },
    },
  );
}

function stringifyForConsole(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return `<<unable to serialise: ${(error as Error).message}>>`;
  }
}

function buildDefaultPrompt<K extends ValidatorKey>(
  context: EnsureValidPromptContext<K>,
): string {
  const header = `Repair the following ${context.type} JSON so that it matches the Handy Dandy schema.`;
  const formattedErrors = context.errors
    .map((error) => `- ${formatError(error)}`)
    .join("\n");

  const diagnostics = formattedErrors
    ? `Validation errors:\n${formattedErrors}`
    : "Validation failed without detailed errors.";

  const json = JSON.stringify(context.normalized, null, 2);

  return [
    header,
    diagnostics,
    "Current JSON:",
    json,
  ].join("\n\n");
}

function createSchemaDefinition<K extends ValidatorKey>(
  type: K,
  schema: SchemaMap[K],
): JsonSchemaDefinition {
  const name = typeof schema === "object" && schema !== null && "$id" in schema
    ? String((schema as { $id?: unknown }).$id ?? `${type}-schema`)
    : `${type}-schema`;

  return {
    name,
    schema: schema as unknown as Record<string, unknown>,
    description: `Schema for ${type} entries`,
  };
}

function normalizePayload<K extends ValidatorKey>(
  type: K,
  payload: unknown,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return {} as Record<string, unknown>;
  }

  const schema = schemas[type];
  const normalized = clone(payload) as Record<string, unknown>;

  pruneUnknownFields(normalized, schema);
  coerceSchemaVersion(normalized);
  coerceSystemId(normalized);
  coerceSlug(normalized);
  coerceName(normalized);

  switch (type) {
    case "action":
      coerceAction(normalized);
      break;
    case "item":
      coerceItem(normalized);
      break;
    case "actor":
      coerceActor(normalized);
      break;
    case "packEntry":
      coercePackEntry(normalized);
      break;
  }

  return normalized;
}

function pruneUnknownFields(
  value: Record<string, unknown>,
  schema: SchemaMap[keyof SchemaMap],
): void {
  if (!schema || typeof schema !== "object") return;
  const properties = (schema as { properties?: Record<string, unknown> }).properties;
  if (!properties) return;
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(properties, key)) {
      delete value[key];
    }
  }
}

function coerceSchemaVersion(value: Record<string, unknown>): void {
  value.schema_version = LATEST_SCHEMA_VERSION;
}

function coerceSystemId(value: Record<string, unknown>): void {
  const coerced = coerceEnum(value.systemId, SYSTEM_ID_LOOKUP);
  if (coerced) {
    value.systemId = coerced;
  } else if (value.systemId == null) {
    delete value.systemId;
  }
}

function coerceSlug(value: Record<string, unknown>): void {
  if (!Object.hasOwn(value, "slug")) return;
  const coerced = coerceString(value.slug);
  if (coerced !== undefined) {
    value.slug = coerced;
  } else {
    delete value.slug;
  }
}

function coerceName(value: Record<string, unknown>): void {
  if (!Object.hasOwn(value, "name")) return;
  const coerced = coerceString(value.name);
  if (coerced !== undefined) {
    value.name = coerced;
  } else {
    delete value.name;
  }
}

function coerceAction(value: Record<string, unknown>): void {
  value.type = "action";
  assignEnum(value, "actionType", ACTION_TYPE_LOOKUP);
  const traits = normalizeTraitArray(value.traits);
  if (traits.length > 0) {
    value.traits = traits;
  } else {
    delete value.traits;
  }
  assignOptionalString(value, "requirements");
  assignRequiredString(value, "description");
  assignOptionalString(value, "img", { allowEmpty: true });
  assignEnum(value, "rarity", RARITY_LOOKUP);
  assignOptionalString(value, "source", { allowEmpty: true });
}

function coerceItem(value: Record<string, unknown>): void {
  value.type = "item";
  assignEnum(value, "itemType", ITEM_TYPE_LOOKUP);
  assignEnum(value, "rarity", RARITY_LOOKUP);
  assignInteger(value, "level");
  assignNumber(value, "price");
  const traits = normalizeTraitArray(value.traits);
  if (traits.length > 0) {
    value.traits = traits;
  } else {
    delete value.traits;
  }
  assignOptionalString(value, "description");
  assignOptionalString(value, "img", { allowEmpty: true });
  assignOptionalString(value, "source", { allowEmpty: true });
}

function coerceActor(value: Record<string, unknown>): void {
  value.type = "actor";
  assignEnum(value, "actorType", ACTOR_TYPE_LOOKUP);
  assignEnum(value, "rarity", RARITY_LOOKUP);
  assignInteger(value, "level");
  assignEnum(value, "size", ACTOR_SIZE_LOOKUP);
  assignOptionalString(value, "alignment");
  assignOptionalString(value, "img", { allowEmpty: true });
  assignOptionalString(value, "source", { allowEmpty: true });
  assignOptionalString(value, "description");
  assignOptionalString(value, "recallKnowledge");

  if (typeof value.size !== "string") {
    value.size = "med";
  }

  value.traits = normalizeTraitArray(value.traits);
  value.languages = normalizeStringArray(value.languages);
  value.alignment = normalizeNullableString(value.alignment);
  value.img = normalizeImage(value.img);
  value.source = normalizeOptionalText(value.source);
  value.description = normalizeNullableString(value.description);
  value.recallKnowledge = normalizeNullableString(value.recallKnowledge);

  value.attributes = normalizeActorAttributes(value.attributes);
  value.abilities = normalizeActorAbilityScores(value.abilities);
  value.skills = normalizeActorSkills(value.skills);
  value.strikes = normalizeActorStrikes(value.strikes);
  value.actions = normalizeActorActions(value.actions);
  const spellcasting = normalizeSpellcastingEntries(value.spellcasting);
  if (spellcasting.length) {
    value.spellcasting = spellcasting;
  } else {
    delete value.spellcasting;
  }

  const inventory = normalizeActorInventory(value.inventory);
  if (inventory.length) {
    value.inventory = inventory;
  } else {
    delete value.inventory;
  }
}

function normalizeActorAttributes(raw: unknown): ActorSchemaData["attributes"] {
  const source = isRecord(raw) ? raw : {};
  const hpSource = isRecord(source.hp) ? source.hp : {};
  const acSource = isRecord(source.ac) ? source.ac : {};
  const perceptionSource = isRecord(source.perception) ? source.perception : {};
  const speedSource = isRecord(source.speed) ? source.speed : {};
  const savesSource = isRecord(source.saves) ? source.saves : {};

  const hpValue = normalizeNonNegativeInteger(hpSource.value, 1);
  const hpMax = normalizeNonNegativeInteger(hpSource.max, hpValue);
  const hpTemp = normalizeNonNegativeInteger(hpSource.temp, 0);

  const result: ActorSchemaData["attributes"] = {
    hp: {
      value: hpValue,
      max: hpMax,
      temp: hpTemp,
      details: normalizeNullableString(hpSource.details),
    },
    ac: {
      value: normalizeInteger(acSource.value, 10),
      details: normalizeNullableString(acSource.details),
    },
    perception: {
      value: normalizeInteger(perceptionSource.value, 0),
      details: normalizeNullableString(perceptionSource.details),
      senses: normalizeLowercaseArray(perceptionSource.senses),
    },
    speed: {
      value: normalizeNonNegativeInteger(speedSource.value, 0),
      details: normalizeNullableString(speedSource.details),
      other: normalizeSpeedEntries(speedSource.other),
    },
    saves: {
      fortitude: normalizeSave(savesSource.fortitude),
      reflex: normalizeSave(savesSource.reflex),
      will: normalizeSave(savesSource.will),
    },
    immunities: normalizeImmunities(source.immunities),
    weaknesses: normalizeWeaknesses(source.weaknesses),
    resistances: normalizeResistances(source.resistances),
  };

  return result;
}

function normalizeSave(raw: unknown): ActorSchemaData["attributes"]["saves"]["fortitude"] {
  const source = isRecord(raw) ? raw : {};
  return {
    value: normalizeInteger(source.value, 0),
    details: normalizeNullableString(source.details ?? source.saveDetail),
  };
}

function normalizeImmunities(raw: unknown): ActorSchemaData["attributes"]["immunities"] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: NonNullable<ActorSchemaData["attributes"]["immunities"]> = [];
  for (const entry of raw) {
    const item = isRecord(entry) ? entry : {};
    const type = normalizeKeyString(item.type);
    if (!type) continue;
    result.push({
      type,
      exceptions: normalizeLowercaseArray(item.exceptions),
      details: normalizeNullableString(item.details),
    });
  }
  return result;
}

function normalizeWeaknesses(raw: unknown): ActorSchemaData["attributes"]["weaknesses"] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: NonNullable<ActorSchemaData["attributes"]["weaknesses"]> = [];
  for (const entry of raw) {
    const item = isRecord(entry) ? entry : {};
    const type = normalizeKeyString(item.type);
    const value = normalizeNonNegativeInteger(item.value, 0);
    if (!type || value <= 0) continue;
    result.push({
      type,
      value,
      exceptions: normalizeLowercaseArray(item.exceptions),
      details: normalizeNullableString(item.details),
    });
  }
  return result;
}

function normalizeResistances(raw: unknown): ActorSchemaData["attributes"]["resistances"] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: NonNullable<ActorSchemaData["attributes"]["resistances"]> = [];
  for (const entry of raw) {
    const item = isRecord(entry) ? entry : {};
    const type = normalizeKeyString(item.type);
    const value = normalizeNonNegativeInteger(item.value, 0);
    if (!type || value <= 0) continue;
    result.push({
      type,
      value,
      exceptions: normalizeLowercaseArray(item.exceptions),
      doubleVs: normalizeLowercaseArray(item.doubleVs),
      details: normalizeNullableString(item.details),
    });
  }
  return result;
}

function normalizeSpeedEntries(raw: unknown): ActorSchemaData["attributes"]["speed"]["other"] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: NonNullable<ActorSchemaData["attributes"]["speed"]["other"]> = [];
  for (const entry of raw) {
    const item = isRecord(entry) ? entry : {};
    const type = normalizeKeyString(item.type);
    const value = normalizeNonNegativeInteger(item.value, 0);
    if (!type || value <= 0) continue;
    result.push({
      type,
      value,
      details: normalizeNullableString(item.details),
    });
  }
  return result;
}

function normalizeActorAbilityScores(raw: unknown): ActorSchemaData["abilities"] {
  const source = isRecord(raw) ? raw : {};
  return {
    str: normalizeAbilityScore(source.str),
    dex: normalizeAbilityScore(source.dex),
    con: normalizeAbilityScore(source.con),
    int: normalizeAbilityScore(source.int),
    wis: normalizeAbilityScore(source.wis),
    cha: normalizeAbilityScore(source.cha),
  };
}

function normalizeAbilityScore(raw: unknown): number {
  if (isRecord(raw)) {
    const mod = normalizeOptionalInteger(raw.mod);
    if (mod !== null) {
      return mod;
    }
    const value = normalizeOptionalInteger(raw.value);
    if (value !== null) {
      return value;
    }
  }
  return normalizeInteger(raw, 0);
}

function normalizeActorSkills(raw: unknown): ActorSchemaData["skills"] {
  const result: ActorSchemaData["skills"] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const skill = normalizeSkillEntry(entry);
      if (skill) {
        result.push(skill);
      }
    }
    return result;
  }

  if (isRecord(raw)) {
    for (const [slug, entry] of Object.entries(raw)) {
      const skill = normalizeSkillEntry({ slug, ...((isRecord(entry) ? entry : {}) as Record<string, unknown>) });
      if (skill) {
        result.push(skill);
      }
    }
  }

  return result;
}

function normalizeSkillEntry(raw: unknown): ActorSchemaData["skills"][number] | null {
  const source = isRecord(raw) ? raw : {};
  const slug = normalizeKeyString(source.slug ?? source.name);
  const modifier = normalizeInteger(source.modifier ?? source.value ?? source.base, 0);
  if (!slug) {
    return null;
  }
  return {
    slug,
    modifier,
    details: normalizeNullableString(source.details ?? source.note ?? source.notes),
  };
}

const STRIKE_TYPE_LOOKUP = createEnumLookup(["melee", "ranged"], {
  close: "melee",
  reach: "melee",
  thrown: "ranged",
});

function normalizeActorStrikes(raw: unknown): ActorSchemaData["strikes"] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: ActorSchemaData["strikes"] = [];
  for (const entry of raw) {
    const strike = isRecord(entry) ? entry : {};
    const name = normalizeTitle(strike.name ?? strike.label);
    const type = coerceEnum(strike.type ?? strike.category, STRIKE_TYPE_LOOKUP) ?? "melee";
    const attackBonus = normalizeInteger(strike.attackBonus ?? strike.bonus ?? strike.modifier, 0);
    const damage = normalizeStrikeDamage(strike.damage ?? strike.damageRolls ?? strike.formulae);
    if (!name || damage.length === 0) {
      continue;
    }
    result.push({
      name,
      type: type as "melee" | "ranged",
      attackBonus,
      traits: normalizeTraitArray(strike.traits ?? strike.tags),
      damage,
      effects: normalizeStrikeEffects(strike.effects ?? strike.special ?? strike.additionalEffects),
      description: normalizeNullableString(strike.description ?? strike.note ?? strike.notes),
    });
  }
  return result;
}

function normalizeStrikeDamage(raw: unknown): ActorSchemaData["strikes"][number]["damage"] {
  const result: ActorSchemaData["strikes"][number]["damage"] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const normalized = normalizeDamageEntry(entry);
      if (normalized) {
        result.push(normalized);
      }
    }
    return result;
  }

  if (isRecord(raw)) {
    const entries = Array.isArray(raw.list)
      ? raw.list
      : Object.values(raw);
    for (const entry of entries) {
      const normalized = normalizeDamageEntry(entry);
      if (normalized) {
        result.push(normalized);
      }
    }
  }

  return result;
}

function normalizeDamageEntry(raw: unknown): ActorSchemaData["strikes"][number]["damage"][number] | null {
  const source = isRecord(raw) ? raw : {};
  const formula = normalizeFormula(source.formula ?? source.damage ?? source.value);
  if (!formula) {
    return null;
  }
  return {
    formula,
    damageType: normalizeKeyString(source.damageType ?? source.type),
    notes: normalizeNullableString(source.notes ?? source.description),
  };
}

const ACTOR_ACTION_COST_LOOKUP = createEnumLookup([...ACTION_EXECUTIONS, "passive"]);

function normalizeActorActions(raw: unknown): ActorSchemaData["actions"] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: ActorSchemaData["actions"] = [];
  for (const entry of raw) {
    const source = isRecord(entry) ? entry : {};
    const name = normalizeTitle(source.name ?? source.title);
    if (!name) {
      continue;
    }
    const actionCost =
      coerceEnum(source.actionCost ?? source.actions ?? source.cost, ACTOR_ACTION_COST_LOOKUP) ?? "passive";
    const descriptionRaw = normalizeTextBlock(source.description ?? source.details ?? source.text);
    const description = descriptionRaw || "No description provided.";
    result.push({
      name,
      actionCost: actionCost as ActorSchemaData["actions"][number]["actionCost"],
      description,
      traits: normalizeTraitArray(source.traits ?? source.tags),
      requirements: normalizeNullableString(source.requirements),
      trigger: normalizeNullableString(source.trigger),
      frequency: normalizeNullableString(source.frequency),
    });
  }
  return result;
}

const SPELLCASTING_TYPE_LOOKUP = createEnumLookup(["prepared", "spontaneous", "innate", "focus", "ritual"]);

function normalizeSpellcastingEntries(raw: unknown): ActorSpellcastingList {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: ActorSpellcastingList = [];
  for (const spellcastingSource of raw) {
    const source = isRecord(spellcastingSource) ? spellcastingSource : {};
    const name = normalizeTitle(source.name ?? source.label);
    const tradition = normalizeKeyString(
      (isRecord(source.tradition) ? source.tradition.value : source.tradition) ?? source.traditionValue ?? source.traditionName,
    );
    const castingType =
      coerceEnum(source.castingType ?? source.prepared ?? source.type, SPELLCASTING_TYPE_LOOKUP) ?? "innate";
    const spells = normalizeSpellList(source.spells ?? source.list ?? source.entries);
    if (!name || !tradition) {
      continue;
    }
    const normalizedEntry: ActorSpellcastingEntry = {
      name,
      tradition,
      castingType: castingType as ActorSpellcastingEntry["castingType"],
      spells,
    };
    const attackBonus = normalizeOptionalInteger(
      (isRecord(source.spelldc) ? source.spelldc.value : undefined) ?? source.attackBonus ?? source.bonus ?? source.spellAttack,
    );
    if (attackBonus !== null) {
      normalizedEntry.attackBonus = attackBonus;
    }
    const saveDC = normalizeOptionalInteger(
      (isRecord(source.spelldc) ? source.spelldc.dc : undefined) ?? source.saveDC ?? source.dc,
    );
    if (saveDC !== null) {
      normalizedEntry.saveDC = saveDC;
    }
    const notes = normalizeNullableString(source.notes ?? source.description);
    if (notes) {
      normalizedEntry.notes = notes;
    }
    result.push(normalizedEntry);
  }
  return result;
}

function normalizeSpellList(raw: unknown): ActorSpellList {
  const result: ActorSpellList = [];
  if (!Array.isArray(raw)) {
    return result;
  }
  for (const entry of raw) {
    const source = isRecord(entry) ? entry : {};
    const name = normalizeTitle(source.name ?? source.spell);
    const level = normalizeNonNegativeInteger(source.level ?? source.rank, 0);
    if (!name) {
      continue;
    }
    result.push({
      level,
      name,
      description: normalizeNullableString(source.description ?? source.details),
      tradition: normalizeNullableString(source.tradition),
    });
  }
  return result;
}

function normalizeActorInventory(raw: unknown): NonNullable<ActorSchemaData["inventory"]> {
  if (!Array.isArray(raw)) {
    return [];
  }

  const result: NonNullable<ActorSchemaData["inventory"]> = [];
  for (const entry of raw) {
    const source = isRecord(entry) ? entry : {};
    const name = normalizeTitle(source.name ?? source.item ?? source.label);
    if (!name) {
      continue;
    }

    const itemType = coerceEnum(source.itemType ?? source.type, ITEM_TYPE_LOOKUP);
    const normalizedEntry: NonNullable<ActorSchemaData["inventory"]>[number] = {
      name,
    };

    if (itemType) {
      normalizedEntry.itemType = itemType as NonNullable<ActorSchemaData["inventory"]>[number]["itemType"];
    }

    const slug = normalizeNullableString(source.slug);
    if (slug) {
      normalizedEntry.slug = slug;
    }

    const quantity = normalizeOptionalInteger(source.quantity);
    if (quantity !== null && quantity > 0) {
      normalizedEntry.quantity = quantity;
    }

    const level = normalizeOptionalInteger(source.level);
    if (level !== null && level >= 0) {
      normalizedEntry.level = level;
    }

    const description = normalizeNullableString(source.description ?? source.details);
    if (description) {
      normalizedEntry.description = description;
    }

    const img = normalizeNullableString(source.img ?? source.image);
    if (img) {
      normalizedEntry.img = img;
    }

    result.push(normalizedEntry);
  }

  return result;
}

function normalizeTraitArray(value: unknown): string[] {
  const entries = normalizeStringArray(value).map((entry) => normalizeEnumKey(entry));
  const knownTraits = getTraitSlugSet();

  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry) {
      continue;
    }
    if (knownTraits && knownTraits.size > 0 && !knownTraits.has(entry)) {
      continue;
    }
    if (seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    result.push(entry);
  }

  return result;
}

function normalizeLowercaseArray(value: unknown): string[] {
  const entries = normalizeStringArray(value);
  return entries.map((entry) => entry.toLowerCase());
}

function normalizeStrikeEffects(value: unknown): string[] {
  const entries = normalizeStringArray(value);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = entry.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function normalizeStringArray(value: unknown): string[] {
  const result = coerceStringArray(value);
  if (!result) {
    return [];
  }
  return result.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeImage(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const coerced = coerceInteger(value);
  if (coerced === undefined || coerced < 0) {
    return fallback;
  }
  return coerced;
}

function normalizeInteger(value: unknown, fallback = 0): number {
  const coerced = coerceInteger(value);
  return coerced === undefined ? fallback : coerced;
}

function normalizeOptionalInteger(value: unknown): number | null {
  const coerced = coerceInteger(value);
  return coerced === undefined ? null : coerced;
}

function normalizeFormula(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTitle(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function normalizeTextBlock(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function normalizeKeyString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return normalizeEnumKey(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coercePackEntry(value: Record<string, unknown>): void {
  assignRequiredString(value, "id");
  assignEnum(value, "entityType", ENTITY_TYPE_LOOKUP);
  assignOptionalString(value, "img", { allowEmpty: true });
  assignInteger(value, "sort");
  assignOptionalNullableString(value, "folder");
}

function assignRequiredString(
  target: Record<string, unknown>,
  key: string,
): void {
  if (!Object.hasOwn(target, key)) return;
  const coerced = coerceString(target[key]);
  if (coerced !== undefined) {
    target[key] = coerced;
  } else {
    delete target[key];
  }
}

function assignOptionalString(
  target: Record<string, unknown>,
  key: string,
  options: { allowEmpty?: boolean } = {},
): void {
  if (!Object.hasOwn(target, key)) return;
  const value = target[key];
  if (value == null) {
    delete target[key];
    return;
  }
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) {
    if (options.allowEmpty) {
      target[key] = null;
    } else {
      delete target[key];
    }
    return;
  }
  target[key] = trimmed;
}

function assignOptionalNullableString(
  target: Record<string, unknown>,
  key: string,
): void {
  if (!Object.hasOwn(target, key)) return;
  const value = target[key];
  if (value === null) {
    target[key] = null;
    return;
  }
  if (typeof value !== "string") {
    delete target[key];
    return;
  }
  const trimmed = value.trim();
  target[key] = trimmed || null;
}

function assignEnum(
  target: Record<string, unknown>,
  key: string,
  lookup: Record<string, string>,
): void {
  if (!Object.hasOwn(target, key)) return;
  const coerced = coerceEnum(target[key], lookup);
  if (coerced) {
    target[key] = coerced;
  } else if (target[key] == null) {
    delete target[key];
  }
}

function assignInteger(target: Record<string, unknown>, key: string): void {
  if (!Object.hasOwn(target, key)) return;
  const value = target[key];
  if (value == null || (typeof value === "string" && !value.trim())) {
    delete target[key];
    return;
  }
  const coerced = coerceInteger(value);
  if (coerced !== undefined) {
    target[key] = coerced;
  }
}

function assignNumber(target: Record<string, unknown>, key: string): void {
  if (!Object.hasOwn(target, key)) return;
  const value = target[key];
  if (value == null || (typeof value === "string" && !value.trim())) {
    delete target[key];
    return;
  }
  const coerced = coerceNumber(value);
  if (coerced !== undefined) {
    target[key] = coerced;
  }
}

function coerceString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function coerceStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const filtered = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
    return filtered.length ? filtered : [];
  }

  if (typeof value === "string") {
    const parts = value
      .split(/[,;\n]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return parts.length ? parts : [];
  }

  return undefined;
}

function coerceEnum(
  value: unknown,
  lookup: Record<string, string>,
): string | undefined {
  if (value == null) return undefined;
  const key = normalizeEnumKey(String(value));
  return lookup[key];
}

function coerceInteger(value: unknown): number | undefined {
  const coerced = coerceNumber(value);
  if (coerced === undefined) return undefined;
  if (!Number.isInteger(coerced)) return undefined;
  return coerced;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeEnumKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createEnumLookup(
  values: readonly string[],
  aliases: Record<string, string> = {},
): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const value of values) {
    lookup[normalizeEnumKey(value)] = value;
  }
  for (const [alias, result] of Object.entries(aliases)) {
    lookup[normalizeEnumKey(alias)] = result;
  }
  return lookup;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  if (value === undefined || value === null) {
    return value as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneErrors(errors: ErrorObject[]): ErrorObject[] {
  return errors.map((error) => clone(error));
}
