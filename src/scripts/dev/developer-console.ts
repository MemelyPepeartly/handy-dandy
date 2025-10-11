import { CONSTANTS } from "../constants";
import type { ValidatorKey } from "../schemas";

type GPTInteractionMethod = "structured" | "tool";

export interface GPTInteractionLogPayload {
  promptHash: string;
  schemaName: string;
  model: string;
  method: GPTInteractionMethod;
  durationMs: number;
  startedAt: number;
  success: boolean;
  usage?: GPTUsageMetrics;
  error?: string;
}

export interface GPTUsageMetrics {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface GPTInteractionLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly promptHash: string;
  readonly schemaName: string;
  readonly model: string;
  readonly method: GPTInteractionMethod;
  readonly duration: string;
  readonly tokens?: string;
  readonly status: "success" | "error";
  readonly error?: string;
}

interface ValidationLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly type: ValidatorKey;
  readonly attempts: number;
  readonly invalidJson?: string;
  readonly errors?: string[];
}

export interface ValidationLogPayload {
  type: ValidatorKey;
  attempts: number;
  invalidJson?: string;
  errors?: string[];
}

interface DeveloperConsoleData {
  gptLogs: readonly GPTInteractionLogEntry[];
  validationLogs: readonly ValidationLogEntry[];
  settings: {
    dumpInvalidJson: boolean;
    dumpAjvErrors: boolean;
  };
}

const LOG_LIMIT = 50;

const formatDuration = (durationMs: number): string => {
  if (!Number.isFinite(durationMs)) {
    return "-";
  }
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(2)} s`;
  }
  return `${durationMs.toFixed(0)} ms`;
};

const formatTokens = (usage?: GPTUsageMetrics): string | undefined => {
  if (!usage) return undefined;
  const parts: string[] = [];
  if (typeof usage.inputTokens === "number") {
    parts.push(`in ${usage.inputTokens}`);
  }
  if (typeof usage.outputTokens === "number") {
    parts.push(`out ${usage.outputTokens}`);
  }
  if (typeof usage.totalTokens === "number") {
    parts.push(`total ${usage.totalTokens}`);
  }
  return parts.length ? parts.join(" · ") : undefined;
};

const createId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

export class DeveloperConsole extends Application {
  #gptLogs: GPTInteractionLogEntry[] = [];
  #validationLogs: ValidationLogEntry[] = [];

  static override get defaultOptions(): ApplicationOptions {
    return {
      ...super.defaultOptions,
      id: "handy-dandy-developer-console",
      title: "Handy Dandy – Developer Console",
      template: `modules/${CONSTANTS.MODULE_ID}/templates/developer-console.hbs`,
      width: 600,
      height: 520,
      resizable: true,
      classes: ["handy-dandy", "developer-console"],
    } satisfies ApplicationOptions;
  }

  recordGPTInteraction(payload: GPTInteractionLogPayload): void {
    const entry: GPTInteractionLogEntry = {
      id: createId(),
      timestamp: new Date(payload.startedAt).toLocaleTimeString(),
      promptHash: payload.promptHash,
      schemaName: payload.schemaName,
      model: payload.model,
      method: payload.method,
      duration: formatDuration(payload.durationMs),
      tokens: formatTokens(payload.usage),
      status: payload.success ? "success" : "error",
      error: payload.error,
    };

    this.#gptLogs.push(entry);
    if (this.#gptLogs.length > LOG_LIMIT) {
      this.#gptLogs = this.#gptLogs.slice(-LOG_LIMIT);
    }
    this.render(false);
  }

  recordValidationFailure(details: ValidationLogPayload): void {
    const entry: ValidationLogEntry = {
      id: createId(),
      timestamp: new Date(Date.now()).toLocaleTimeString(),
      type: details.type,
      attempts: details.attempts,
      invalidJson: details.invalidJson,
      errors: details.errors,
    };

    this.#validationLogs.push(entry);
    if (this.#validationLogs.length > LOG_LIMIT) {
      this.#validationLogs = this.#validationLogs.slice(-LOG_LIMIT);
    }
    this.render(false);
  }

  clear(): void {
    this.#gptLogs = [];
    this.#validationLogs = [];
    this.render(false);
  }

  shouldDumpInvalidJson(): boolean {
    const settings = game.settings;
    return Boolean(settings?.get(CONSTANTS.MODULE_ID, "developerDumpInvalidJson"));
  }

  shouldDumpAjvErrors(): boolean {
    const settings = game.settings;
    return Boolean(settings?.get(CONSTANTS.MODULE_ID, "developerDumpAjvErrors"));
  }

  override getData(): DeveloperConsoleData {
    return {
      gptLogs: [...this.#gptLogs].reverse(),
      validationLogs: [...this.#validationLogs].reverse(),
      settings: {
        dumpInvalidJson: this.shouldDumpInvalidJson(),
        dumpAjvErrors: this.shouldDumpAjvErrors(),
      },
    } satisfies DeveloperConsoleData;
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find<HTMLButtonElement>("button[data-action='clear-logs']").on("click", () => {
      this.clear();
    });

    html.find<HTMLInputElement>("input[name='dumpInvalidJson']").on("change", async (event) => {
      const input = event.currentTarget as HTMLInputElement;
      await game.settings?.set(CONSTANTS.MODULE_ID, "developerDumpInvalidJson", input.checked);
      this.render(false);
    });

    html.find<HTMLInputElement>("input[name='dumpAjvErrors']").on("change", async (event) => {
      const input = event.currentTarget as HTMLInputElement;
      await game.settings?.set(CONSTANTS.MODULE_ID, "developerDumpAjvErrors", input.checked);
      this.render(false);
    });
  }
}
