import type { ErrorObject } from "ajv";
import { LATEST_SCHEMA_VERSION, validators, type ValidatorKey } from "../schemas";
import { migrate } from "../migrations";

export type ValidationResult = { ok: true } | { ok: false; errors: ErrorObject[] };

const validatorMap = validators;

export function validate(entityType: ValidatorKey, data: unknown): ValidationResult {
  const validator = validatorMap[entityType];
  let candidate = data;

  if (isRecord(candidate)) {
    const currentVersion = readSchemaVersion(candidate);
    if (currentVersion !== undefined && currentVersion !== LATEST_SCHEMA_VERSION) {
      const migrated = migrate(entityType, currentVersion, LATEST_SCHEMA_VERSION, candidate);
      overwriteRecord(candidate, migrated);
    }
  }

  const valid = validator(candidate);

  if (valid) {
    return { ok: true };
  }

  const errors = validator.errors ?? [];
  return { ok: false, errors };
}

export function formatErrorPath(error: ErrorObject): string {
  if (error.keyword === "additionalProperties") {
    const { additionalProperty } = error.params as { additionalProperty: string };
    const basePath = error.instancePath.replace(/\//g, ".").replace(/^\./, "");
    return basePath ? `${basePath}.${additionalProperty}` : additionalProperty;
  }

  return error.instancePath ? error.instancePath.slice(1).replace(/\//g, ".") : "(root)";
}

export function formatError(error: ErrorObject): string {
  const path = formatErrorPath(error);
  return `${path}: ${error.message ?? "is invalid"}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function readSchemaVersion(value: Record<string, unknown>): number | undefined {
  const raw = value.schema_version;
  if (typeof raw === "number" && Number.isInteger(raw)) {
    return raw;
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function overwriteRecord(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(source, key)) {
      delete target[key];
    }
  }

  for (const [key, value] of Object.entries(source)) {
    target[key] = value;
  }
}
