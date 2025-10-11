import type { ErrorObject } from "ajv";
import { validators, type ValidatorKey } from "../schemas";

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

const validatorMap = validators;

export function validate(entityType: ValidatorKey, data: unknown): ValidationResult {
  const validator = validatorMap[entityType];
  const valid = validator(data);

  if (valid) {
    return { ok: true };
  }

  const errors = (validator.errors ?? []).map(formatError);
  return { ok: false, errors };
}

function formatError(error: ErrorObject): string {
  if (error.keyword === "additionalProperties") {
    const { additionalProperty } = error.params as { additionalProperty: string };
    const basePath = error.instancePath.replace(/\//g, ".").replace(/^\./, "");
    const path = basePath ? `${basePath}.${additionalProperty}` : additionalProperty;
    return `${path}: ${error.message ?? "must NOT have additional properties"}`;
  }

  const path = error.instancePath ? error.instancePath.slice(1).replace(/\//g, ".") : "(root)";
  return `${path}: ${error.message ?? "is invalid"}`;
}
