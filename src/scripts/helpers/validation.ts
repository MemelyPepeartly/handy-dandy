import type { ErrorObject } from "ajv";
import { validators, type ValidatorKey } from "../schemas";

export type ValidationResult = { ok: true } | { ok: false; errors: ErrorObject[] };

const validatorMap = validators;

export function validate(entityType: ValidatorKey, data: unknown): ValidationResult {
  const validator = validatorMap[entityType];
  const valid = validator(data);

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
