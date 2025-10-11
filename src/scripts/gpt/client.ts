import type { OpenAI } from "openai";
import { CONSTANTS } from "../constants";
import { getDeveloperConsole } from "../dev/state";
import type { GPTUsageMetrics } from "../dev/developer-console";

export interface JsonSchemaDefinition {
  name: string;
  schema: Record<string, unknown>;
  description?: string;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

function normalizeRequiredProperties(node: unknown): JsonValue {
  if (Array.isArray(node)) {
    return node.map((entry) => normalizeRequiredProperties(entry)) as JsonValue;
  }

  if (!isRecord(node)) {
    return node as JsonValue;
  }

  const normalized: Record<string, JsonValue> = {};
  let propertyKeys: string[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (key === "properties" && isRecord(value)) {
      const properties: Record<string, JsonValue> = {};
      for (const [propertyKey, propertyValue] of Object.entries(value)) {
        properties[propertyKey] = normalizeRequiredProperties(propertyValue);
      }
      normalized.properties = properties;
      propertyKeys = Object.keys(properties);
      continue;
    }

    normalized[key] = normalizeRequiredProperties(value) as JsonValue;
  }

  if (propertyKeys.length > 0) {
    const requiredValue = normalized.required;
    const required: string[] = Array.isArray(requiredValue)
      ? requiredValue.filter((entry): entry is string => typeof entry === "string")
      : [];

    for (const propertyKey of propertyKeys) {
      if (!required.includes(propertyKey)) {
        required.push(propertyKey);
      }
    }

    normalized.required = required as JsonValue;
  }

  return normalized;
}

export interface GPTClientConfig {
  model: string;
  temperature: number;
  top_p: number;
  seed?: number;
}

const sanitizeNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number") return undefined;
  return Number.isFinite(value) ? value : undefined;
};

export const readGPTSettings = (): GPTClientConfig => {
  const settings = game.settings;
  const model = settings?.get(CONSTANTS.MODULE_ID, "GPTModel") as string | undefined;
  const temperature = settings?.get(CONSTANTS.MODULE_ID, "GPTTemperature");
  const top_p = settings?.get(CONSTANTS.MODULE_ID, "GPTTopP");
  const seedSetting = settings?.get(CONSTANTS.MODULE_ID, "GPTSeed");

  const config: GPTClientConfig = {
    model: model ?? "gpt-4.1-mini",
    temperature: sanitizeNumber(temperature) ?? 0,
    top_p: sanitizeNumber(top_p) ?? 1,
  };

  const seed = sanitizeNumber(seedSetting);
  if (typeof seed === "number") {
    config.seed = seed;
  }

  return config;
};

export interface GenerateWithSchemaOptions {
  seed?: number;
}

const performanceNow = typeof performance !== "undefined" && typeof performance.now === "function"
  ? () => performance.now()
  : () => Date.now();

async function hashPrompt(prompt: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(prompt);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  let hash = 0x811c9dc5;
  let secondary = 0x1000193;
  for (let index = 0; index < prompt.length; index += 1) {
    const code = prompt.charCodeAt(index);
    hash = Math.imul(hash ^ code, 0x01000193);
    secondary = Math.imul(secondary ^ code, 0x01000193);
  }
  const primaryHex = (hash >>> 0).toString(16).padStart(8, "0");
  const secondaryHex = (secondary >>> 0).toString(16).padStart(8, "0");
  return `${primaryHex}${secondaryHex}`;
}

interface GPTGenerationAttempt<T> {
  result: T;
  response: unknown;
}

export class GPTClient {
  #openai: OpenAI;
  #config: GPTClientConfig;

  constructor(openai: OpenAI, config: GPTClientConfig) {
    this.#openai = openai;
    this.#config = config;
  }

  static fromSettings(openai: OpenAI): GPTClient {
    return new GPTClient(openai, readGPTSettings());
  }

  async generateWithSchema<T>(
    prompt: string,
    schema: JsonSchemaDefinition,
    options?: GenerateWithSchemaOptions,
  ): Promise<T> {
    const promptHash = await hashPrompt(prompt);
    try {
      return await this.#runWithLogging<T>(
        "structured",
        promptHash,
        schema,
        async () => this.#generateStructured<T>(prompt, schema, options),
      );
    } catch (error) {
      if (!this.#shouldFallback(error)) {
        throw error;
      }

      return await this.#runWithLogging<T>(
        "tool",
        promptHash,
        schema,
        async () => this.#generateWithTool<T>(prompt, schema, options),
      );
    }
  }

  async #generateStructured<T>(
    prompt: string,
    schema: JsonSchemaDefinition,
    options?: GenerateWithSchemaOptions,
  ): Promise<GPTGenerationAttempt<T>> {
    const prepared = this.#prepareSchemaDefinition(schema);
    const response = await this.#openai.responses.create({
      model: this.#config.model,
      input: prompt,
      temperature: this.#config.temperature,
      top_p: this.#config.top_p,
      metadata: this.#createMetadata(options?.seed),
      text: {
        format: {
          type: "json_schema",
          name: prepared.name,
          description: prepared.description ?? "Return JSON matching the provided schema.",
          schema: prepared.schema,
          strict: true,
        },
      },
    });

    return {
      response,
      result: this.#extractJson<T>(response, schema),
    } satisfies GPTGenerationAttempt<T>;
  }

  async #generateWithTool<T>(
    prompt: string,
    schema: JsonSchemaDefinition,
    options?: GenerateWithSchemaOptions,
  ): Promise<GPTGenerationAttempt<T>> {
    const prepared = this.#prepareSchemaDefinition(schema);
    const response = await this.#openai.responses.create({
      model: this.#config.model,
      temperature: this.#config.temperature,
      top_p: this.#config.top_p,
      metadata: this.#createMetadata(options?.seed),
      input: [
        {
          role: "system",
          content: `You are a JSON serializer. Always provide valid JSON for the ${schema.name} tool that satisfies the supplied schema.`,
        },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          name: prepared.name,
          description: prepared.description ?? "Return JSON matching the provided schema.",
          parameters: prepared.schema,
          strict: true,
        },
      ],
      tool_choice: { type: "function", name: prepared.name },
    });

    return {
      response,
      result: this.#extractJson<T>(response, schema),
    } satisfies GPTGenerationAttempt<T>;
  }

  #prepareSchemaDefinition(schema: JsonSchemaDefinition): JsonSchemaDefinition {
    return {
      ...schema,
      schema: normalizeRequiredProperties(schema.schema) as Record<string, unknown>,
    } satisfies JsonSchemaDefinition;
  }

  #shouldFallback(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const candidate = error as Error & { status?: number; code?: string };
    if (typeof candidate.code === "string" && candidate.code.toLowerCase().includes("response_format")) {
      return true;
    }
    if (typeof candidate.status === "number" && candidate.status >= 400 && candidate.status < 500) {
      return true;
    }
    if (typeof candidate.message === "string" && candidate.message.toLowerCase().includes("response_format")) {
      return true;
    }
    return false;
  }

  async #runWithLogging<T>(
    method: "structured" | "tool",
    promptHash: string,
    schema: JsonSchemaDefinition,
    executor: () => Promise<GPTGenerationAttempt<T>>,
  ): Promise<T> {
    const startWallClock = Date.now();
    const start = performanceNow();

    try {
      const attempt = await executor();
      this.#recordInteraction({
        method,
        promptHash,
        schemaName: schema.name,
        durationMs: performanceNow() - start,
        startedAt: startWallClock,
        success: true,
        usage: this.#extractUsage(attempt.response),
      });
      return attempt.result;
    } catch (error) {
      this.#recordInteraction({
        method,
        promptHash,
        schemaName: schema.name,
        durationMs: performanceNow() - start,
        startedAt: startWallClock,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  #recordInteraction(payload: {
    method: "structured" | "tool";
    promptHash: string;
    schemaName: string;
    durationMs: number;
    startedAt: number;
    success: boolean;
    usage?: GPTUsageMetrics;
    error?: string;
  }): void {
    const consoleApp = getDeveloperConsole();
    if (!consoleApp) {
      return;
    }

    consoleApp.recordGPTInteraction({
      promptHash: payload.promptHash,
      schemaName: payload.schemaName,
      model: this.#config.model,
      method: payload.method,
      durationMs: payload.durationMs,
      startedAt: payload.startedAt,
      success: payload.success,
      usage: payload.usage,
      error: payload.error,
    });
  }

  #createMetadata(seedOverride: number | undefined): Record<string, string> | undefined {
    const seed = seedOverride ?? this.#config.seed;
    if (typeof seed !== "number") {
      return undefined;
    }
    return { handy_dandy_seed: String(seed) };
  }

  #extractUsage(response: unknown): GPTUsageMetrics | undefined {
    if (!response || typeof response !== "object") {
      return undefined;
    }

    const usage = (response as { usage?: unknown }).usage;
    if (!usage || typeof usage !== "object") {
      return undefined;
    }

    const metrics: GPTUsageMetrics = {};
    const candidate = usage as Record<string, unknown>;

    const input = candidate.input_tokens ?? candidate.prompt_tokens ?? candidate.total_input_tokens;
    if (typeof input === "number") {
      metrics.inputTokens = input;
    }

    const output = candidate.output_tokens ?? candidate.completion_tokens ?? candidate.total_output_tokens;
    if (typeof output === "number") {
      metrics.outputTokens = output;
    }

    const total = candidate.total_tokens ?? candidate.totalTokenCount ?? candidate.combined_tokens;
    if (typeof total === "number") {
      metrics.totalTokens = total;
    }

    return Object.keys(metrics).length ? metrics : undefined;
  }

  #extractJson<T>(response: unknown, schema: JsonSchemaDefinition): T {
    // Structured response format
    if (response && typeof response === "object") {
      const structured = this.#extractFromOutput<T>(response as Record<string, unknown>);
      if (structured !== undefined) return structured;

      const fromChoices = this.#extractFromChoices<T>(response as Record<string, unknown>);
      if (fromChoices !== undefined) return fromChoices;
    }

    throw new Error(`Unable to parse JSON response for schema "${schema.name}"`);
  }

  #extractFromOutput<T>(response: Record<string, unknown>): T | undefined {
    const output = response.output;
    if (!Array.isArray(output)) return undefined;

    for (const block of output) {
      if (!block || typeof block !== "object") continue;
      const content = (block as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        if (!item || typeof item !== "object") continue;
        const type = (item as { type?: unknown }).type;
        if (type === "output_json") {
          const json = (item as { json?: unknown }).json;
          if (json && typeof json === "object") return json as T;
        }
        if (type === "output_text") {
          const text = (item as { text?: unknown }).text;
          const parsed = this.#tryParseText<T>(text);
          if (parsed !== undefined) return parsed;
        }
        if (type === "text") {
          const text = (item as { text?: unknown }).text;
          const parsed = this.#tryParseText<T>(text);
          if (parsed !== undefined) return parsed;
        }
        if (type === "tool_call") {
          const toolCall = (item as { tool_call?: unknown }).tool_call;
          if (toolCall && typeof toolCall === "object") {
            const args = (toolCall as { arguments?: unknown }).arguments;
            const parsed = this.#tryParseText<T>(args);
            if (parsed !== undefined) return parsed;
          }
        }
      }
    }

    const outputText = (response as { output_text?: unknown }).output_text;
    const parsed = this.#tryParseText<T>(outputText);
    return parsed;
  }

  #extractFromChoices<T>(response: Record<string, unknown>): T | undefined {
    const choices = response.choices;
    if (!Array.isArray(choices)) return undefined;
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") continue;
      const message = (choice as { message?: unknown }).message;
      if (!message || typeof message !== "object") continue;

      const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
      if (Array.isArray(toolCalls)) {
        for (const call of toolCalls) {
          if (!call || typeof call !== "object") continue;
          const fn = (call as { function?: unknown }).function;
          if (!fn || typeof fn !== "object") continue;
          const args = (fn as { arguments?: unknown }).arguments;
          const parsed = this.#tryParseText<T>(args);
          if (parsed !== undefined) return parsed;
        }
      }

      const content = (message as { content?: unknown }).content;
      const parsed = this.#tryParseText<T>(content);
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  }

  #tryParseText<T>(value: unknown): T | undefined {
    if (typeof value !== "string") return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
}
