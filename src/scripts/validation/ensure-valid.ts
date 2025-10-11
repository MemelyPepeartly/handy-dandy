import type { ErrorObject } from "ajv";
import {
  ACTION_EXECUTIONS,
  ACTOR_CATEGORIES,
  ENTITY_TYPES,
  ITEM_CATEGORIES,
  RARITIES,
  SYSTEM_IDS,
  schemas,
  validators,
  type ActionSchemaData,
  type ActorSchemaData,
  type ItemSchemaData,
  type PackEntrySchemaData,
  type SchemaMap,
  type ValidatorKey,
} from "../schemas";
import { formatError } from "../helpers/validation";
import type { JsonSchemaDefinition, GPTClient } from "../gpt/client";

export type SchemaDataFor<K extends ValidatorKey> = K extends "action"
  ? ActionSchemaData
  : K extends "item"
    ? ItemSchemaData
    : K extends "actor"
      ? ActorSchemaData
      : PackEntrySchemaData;

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

export class EnsureValidError<K extends ValidatorKey> extends Error {
  public readonly diagnostics: EnsureValidDiagnostics<K>[];
  public readonly originalPayload: unknown;
  public readonly lastPayload: unknown;

  constructor(
    message: string,
    diagnostics: EnsureValidDiagnostics<K>[],
    originalPayload: unknown,
    lastPayload: unknown,
  ) {
    super(message);
    this.name = "EnsureValidError";
    this.diagnostics = diagnostics;
    this.originalPayload = originalPayload;
    this.lastPayload = lastPayload;
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

  throw new EnsureValidError(
    `Failed to validate ${type} payload after ${maxAttempts} attempts`,
    diagnostics,
    originalPayload,
    lastNormalized,
  );
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
  if (!Object.hasOwn(value, "schema_version")) return;
  const coerced = coerceInteger(value.schema_version);
  if (coerced !== undefined) {
    value.schema_version = coerced;
  }
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
  assignStringArray(value, "traits");
  assignOptionalString(value, "requirements");
  assignRequiredString(value, "description");
  assignOptionalString(value, "img", { allowEmpty: true });
  assignEnum(value, "rarity", RARITY_LOOKUP);
}

function coerceItem(value: Record<string, unknown>): void {
  value.type = "item";
  assignEnum(value, "itemType", ITEM_TYPE_LOOKUP);
  assignEnum(value, "rarity", RARITY_LOOKUP);
  assignInteger(value, "level");
  assignNumber(value, "price");
  assignStringArray(value, "traits");
  assignOptionalString(value, "description");
  assignOptionalString(value, "img", { allowEmpty: true });
}

function coerceActor(value: Record<string, unknown>): void {
  value.type = "actor";
  assignEnum(value, "actorType", ACTOR_TYPE_LOOKUP);
  assignEnum(value, "rarity", RARITY_LOOKUP);
  assignInteger(value, "level");
  assignStringArray(value, "traits");
  assignStringArray(value, "languages");
  assignOptionalString(value, "img", { allowEmpty: true });
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
  if (!trimmed && !options.allowEmpty) {
    delete target[key];
    return;
  }
  target[key] = options.allowEmpty ? trimmed : trimmed;
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

function assignStringArray(target: Record<string, unknown>, key: string): void {
  if (!Object.hasOwn(target, key)) return;
  const coerced = coerceStringArray(target[key]);
  if (coerced && coerced.length) {
    target[key] = coerced;
  } else {
    delete target[key];
  }
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
