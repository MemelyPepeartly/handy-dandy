import type { OpenAI } from "openai";
import { CONSTANTS } from "../constants";

export interface JsonSchemaDefinition {
  name: string;
  schema: Record<string, unknown>;
  description?: string;
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
    try {
      return await this.#generateStructured<T>(prompt, schema, options);
    } catch (error) {
      if (!this.#shouldFallback(error)) throw error;
      return await this.#generateWithTool<T>(prompt, schema, options);
    }
  }

  async #generateStructured<T>(
    prompt: string,
    schema: JsonSchemaDefinition,
    options?: GenerateWithSchemaOptions,
  ): Promise<T> {
    const seed = options?.seed ?? this.#config.seed;
    const response = await this.#openai.responses.create({
      model: this.#config.model,
      input: prompt,
      temperature: this.#config.temperature,
      top_p: this.#config.top_p,
      seed,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          schema: schema.schema,
          strict: true,
        },
      },
    });

    return this.#extractJson<T>(response, schema);
  }

  async #generateWithTool<T>(
    prompt: string,
    schema: JsonSchemaDefinition,
    options?: GenerateWithSchemaOptions,
  ): Promise<T> {
    const seed = options?.seed ?? this.#config.seed;
    const response = await this.#openai.responses.create({
      model: this.#config.model,
      temperature: this.#config.temperature,
      top_p: this.#config.top_p,
      seed,
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
          function: {
            name: schema.name,
            description: schema.description ?? "Return JSON matching the provided schema.",
            parameters: schema.schema,
            strict: true,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: schema.name } },
    });

    return this.#extractJson<T>(response, schema);
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
