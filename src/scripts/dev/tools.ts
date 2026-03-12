import { CONSTANTS } from "../constants";
import type { ActionPromptInput } from "../prompts";
import type { ActionSchemaData, SchemaDataFor, ValidatorKey } from "../schemas";
import type { ImportOptions } from "../mappers/import";
import type { OpenRouterClient } from "../openrouter/client";
import type { EnsureValidOptions } from "../validation/ensure-valid";

type GenerateActionFn = (
  input: ActionPromptInput,
  options?: DevGenerateActionOptions,
) => Promise<ActionSchemaData>;

type EnsureValidFn = <K extends ValidatorKey>(
  options: EnsureValidOptions<K>,
) => Promise<SchemaDataFor<K>>;

type ImportActionFn = (
  json: ActionSchemaData,
  options?: ImportOptions,
) => Promise<Item>;

type DevConsole = Pick<Console, "groupCollapsed" | "groupEnd" | "info" | "warn" | "error">;

export interface DevGenerateActionOptions {
  seed?: number;
  openRouterClient?: Pick<OpenRouterClient, "generateWithSchema">;
}

export interface DevNamespace {
  generateAction: (
    input: ActionPromptInput,
    options?: DevGenerateActionOptions,
  ) => Promise<ActionSchemaData>;
  validate: <K extends ValidatorKey>(type: K, payload: unknown) => Promise<SchemaDataFor<K>>;
  importAction: (
    json: ActionSchemaData,
    options?: ImportOptions,
  ) => Promise<Item>;
}

interface DevNamespaceDependencies {
  canAccess: () => boolean;
  generateAction: GenerateActionFn;
  ensureValid: EnsureValidFn;
  importAction: ImportActionFn;
  console: DevConsole;
}

interface DeveloperApiCandidate {
  active?: boolean;
  enabled?: boolean;
  isEnabled?: boolean;
  toolsActive?: boolean;
  tools?: { active?: boolean };
}

interface DeveloperModuleCandidate {
  active?: boolean;
  api?: { isDeveloper?: () => boolean };
}

const MODULE_PREFIX = `${CONSTANTS.MODULE_NAME} |` as const;

const toBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const safeGetBooleanSetting = <
  N extends ClientSettings.Namespace,
  K extends ClientSettings.KeyFor<N>,
>(
  settings: Game["settings"] | undefined,
  namespace: N,
  key: K,
): boolean | null => {
  if (!settings || typeof settings.get !== "function") {
    return null;
  }

  try {
    const value = settings.get(namespace, key);
    return toBoolean(value);
  } catch (error) {
    if (CONFIG?.debug?.hooks) {
      console.warn(
        MODULE_PREFIX,
        `Failed to read setting ${namespace}.${key}:`,
        error,
      );
    }
    return null;
  }
};

const readDeveloperApiFlag = (developer: unknown): boolean => {
  if (!developer || typeof developer !== "object") {
    return false;
  }

  const candidate = developer as DeveloperApiCandidate;
  const values: (boolean | null | undefined)[] = [
    toBoolean(candidate.active),
    toBoolean(candidate.enabled),
    toBoolean(candidate.isEnabled),
    toBoolean(candidate.toolsActive),
    toBoolean(candidate.tools?.active),
  ];

  return values.some((flag) => flag === true);
};

const readDeveloperModuleFlag = (modules: Game["modules"] | undefined): boolean => {
  if (!modules || typeof modules.get !== "function") {
    return false;
  }

  const identifiers = ["developer-mode", "foundryvtt-devmode", "foundryvtt-developer-tools"];
  return identifiers.some((id) => {
    const entry = modules.get(id) as DeveloperModuleCandidate | undefined;
    if (!entry) {
      return false;
    }
    if (toBoolean(entry.active)) {
      return true;
    }
    const api = entry.api;
    return Boolean(api && typeof api.isDeveloper === "function" && api.isDeveloper());
  });
};

const logOperation = async <T>(
  console: DevConsole,
  operation: string,
  details: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> => {
  console.groupCollapsed(`${MODULE_PREFIX} ${operation}`);
  try {
    for (const [label, value] of Object.entries(details)) {
      if (typeof value === "undefined") continue;
      console.info(`${label}:`, value);
    }

    const result = await fn();
    console.info("Result:", result);
    return result;
  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    console.groupEnd();
  }
};

const assertDeveloperAccess = (deps: DevNamespaceDependencies, operation: string): void => {
  if (deps.canAccess()) {
    return;
  }

  const message = `${MODULE_PREFIX} Developer helper \"${operation}\" is restricted to GMs or developer mode.`;
  deps.console.warn(message);
  throw new Error(message);
};

export function canUseDeveloperTools(): boolean {
  const gameInstance = (globalThis as { game?: Game }).game;
  if (!gameInstance) {
    return false;
  }

  if (gameInstance.user?.isGM) {
    return true;
  }

  if (readDeveloperApiFlag((gameInstance as unknown as { developer?: unknown }).developer)) {
    return true;
  }

  const developerSetting =
    safeGetBooleanSetting(gameInstance.settings, "core" as any, "developerMode" as any) ??
    safeGetBooleanSetting(gameInstance.settings, "core" as any, "devMode" as any);
  if (developerSetting) {
    return true;
  }

  if (readDeveloperModuleFlag(gameInstance.modules)) {
    return true;
  }

  return false;
}

export function createDevNamespace(deps: DevNamespaceDependencies): DevNamespace {
  return {
    generateAction: async (input, options) => {
      assertDeveloperAccess(deps, "generateAction");
      const { openRouterClient: _openRouterClient, ...optionSnapshot } = options ?? {};
      return logOperation(
        deps.console,
        "dev.generateAction",
        {
          input,
          options: Object.keys(optionSnapshot).length ? optionSnapshot : undefined,
        },
        () => deps.generateAction(input, options),
      );
    },

    validate: async (type, payload) => {
      assertDeveloperAccess(deps, "validate");

      return logOperation(
        deps.console,
        `dev.validate(${type})`,
        {
          payload,
        },
        () =>
          deps.ensureValid({
            type,
            payload,
          }),
      );
    },

    importAction: async (json, options) => {
      assertDeveloperAccess(deps, "importAction");
      const snapshot = options ? { ...options } : undefined;
      return logOperation(
        deps.console,
        "dev.importAction",
        {
          json,
          options: snapshot,
        },
        () => deps.importAction(json, options),
      );
    },
  } satisfies DevNamespace;
}

