import type { OpenAI } from "openai";
import { CONSTANTS } from "../constants";
import {
  DEFAULT_OPENROUTER_IMAGE_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  normalizeModelId,
} from "./models";
import {
  getCachedOpenRouterModelChoiceCatalog,
} from "./model-catalog";

export interface JsonSchemaDefinition {
  name: string;
  schema: Record<string, unknown>;
  description?: string;
}

export interface OpenRouterUsageMetrics {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export function updateOpenRouterClientFromSettings(): void {
  const namespace = game.handyDandy;
  if (!namespace) {
    return;
  }

  const openRouterSdk = namespace.openRouterSdk;
  if (!openRouterSdk) {
    return;
  }

  namespace.openRouterClient = OpenRouterClient.fromSettings(openRouterSdk);
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type ResponseCreateParams = Parameters<OpenAI["responses"]["create"]>[0];
type ChatCompletionCreateParams = Parameters<OpenAI["chat"]["completions"]["create"]>[0];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

function hasLooseAdditionalProperties(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some((entry) => hasLooseAdditionalProperties(entry));
  }

  if (!isRecord(node)) {
    return false;
  }

  if (node.type === "object" && node.additionalProperties === true) {
    return true;
  }

  for (const value of Object.values(node)) {
    if (hasLooseAdditionalProperties(value)) {
      return true;
    }
  }

  return false;
}

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

export interface OpenRouterClientConfig {
  model: string;
  imageModel: string;
  temperature: number;
  top_p: number;
  seed?: number;
}

const sanitizeNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number") return undefined;
  return Number.isFinite(value) ? value : undefined;
};

export const readOpenRouterSettings = (): OpenRouterClientConfig => {
  const settings = game.settings;
  const safeGet = (key: string): unknown => {
    if (!settings) return undefined;
    try {
      return settings.get(CONSTANTS.MODULE_ID as never, key as never);
    } catch {
      return undefined;
    }
  };

  const model = safeGet("OpenRouterModel");
  const imageModel = safeGet("OpenRouterImageModel");
  const temperature = safeGet("OpenRouterTemperature");
  const top_p = safeGet("OpenRouterTopP");
  const seedSetting = safeGet("OpenRouterSeed");

  const config: OpenRouterClientConfig = {
    model: normalizeModelId(model, DEFAULT_OPENROUTER_MODEL),
    imageModel: normalizeModelId(imageModel, DEFAULT_OPENROUTER_IMAGE_MODEL),
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

export interface GenerateImageOptions {
  model?: string;
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  background?: "transparent" | "opaque";
  quality?: "low" | "medium" | "high";
  format?: "png" | "webp";
  referenceImages?: File[];
}

export interface GeneratedImageResult {
  base64: string;
  mimeType: string;
  revisedPrompt?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  const globalBuffer = (globalThis as {
    Buffer?: { from: (input: Uint8Array) => { toString: (encoding: string) => string } };
  }).Buffer;
  if (globalBuffer?.from) {
    return globalBuffer.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string | null }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image from URL (${response.status} ${response.statusText}).`);
  }

  const buffer = await response.arrayBuffer();
  const base64 = bytesToBase64(new Uint8Array(buffer));
  const mimeType = response.headers.get("content-type");
  return { base64, mimeType };
}

interface ParsedDataUrl {
  base64: string;
  mimeType: string;
}

function parseDataUrl(value: string): ParsedDataUrl | null {
  const trimmed = value.trim();
  const match = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/i.exec(trimmed);
  if (!match) {
    return null;
  }

  const mimeType = match[1]?.trim() || "image/png";
  const payload = match[2] ?? "";

  // If the payload is not marked as base64, encode it so callers always
  // receive canonical base64 bytes.
  const isBase64 = /;base64,/i.test(trimmed);
  const base64 = isBase64
    ? payload
    : bytesToBase64(new TextEncoder().encode(decodeURIComponent(payload)));

  return {
    base64,
    mimeType,
  };
}

function mapImageSizeToAspectRatio(size: GenerateImageOptions["size"]): "1:1" | "3:2" | "2:3" | undefined {
  switch (size) {
    case "1536x1024":
      return "3:2";
    case "1024x1536":
      return "2:3";
    case "1024x1024":
      return "1:1";
    default:
      return undefined;
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const base64 = bytesToBase64(new Uint8Array(buffer));
  const mimeType = file.type?.trim() || "application/octet-stream";
  return `data:${mimeType};base64,${base64}`;
}

function extractMessageText(content: unknown): string | undefined {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed || undefined;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) {
      continue;
    }

    const text = block.text;
    if (typeof text === "string" && text.trim()) {
      parts.push(text.trim());
    }
  }

  if (!parts.length) {
    return undefined;
  }

  return parts.join("\n");
}

function extractImageUrl(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (!isRecord(value)) {
    return null;
  }

  const directUrl = value.url;
  if (typeof directUrl === "string" && directUrl.trim()) {
    return directUrl.trim();
  }

  const snake = value.image_url;
  if (typeof snake === "string" && snake.trim()) {
    return snake.trim();
  }
  if (isRecord(snake) && typeof snake.url === "string" && snake.url.trim()) {
    return snake.url.trim();
  }

  const camel = value.imageUrl;
  if (typeof camel === "string" && camel.trim()) {
    return camel.trim();
  }
  if (isRecord(camel) && typeof camel.url === "string" && camel.url.trim()) {
    return camel.url.trim();
  }

  return null;
}

function extractBase64Payload(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const snake = value.b64_json;
  if (typeof snake === "string" && snake.trim()) {
    return snake.trim();
  }

  const camel = value.b64Json;
  if (typeof camel === "string" && camel.trim()) {
    return camel.trim();
  }

  return null;
}

function extractImageMimeType(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const snake = value.mime_type;
  if (typeof snake === "string" && snake.trim().startsWith("image/")) {
    return snake.trim();
  }

  const camel = value.mimeType;
  if (typeof camel === "string" && camel.trim().startsWith("image/")) {
    return camel.trim();
  }

  return null;
}

interface ParsedChatImage {
  base64: string;
  mimeType: string;
  revisedPrompt?: string;
}

async function parseImageFromChatResponse(
  response: unknown,
  fallbackMimeType: string,
): Promise<ParsedChatImage | null> {
  if (!isRecord(response)) {
    return null;
  }

  const choices = Array.isArray(response.choices) ? response.choices : [];
  for (const choice of choices) {
    if (!isRecord(choice)) {
      continue;
    }

    const message = isRecord(choice.message) ? choice.message : null;
    if (!message) {
      continue;
    }

    const revisedPrompt = extractMessageText(message.content);
    const imageEntries: unknown[] = [];

    if (Array.isArray(message.images)) {
      imageEntries.push(...message.images);
    }

    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!isRecord(block)) {
          continue;
        }

        const blockType = typeof block.type === "string" ? block.type : "";
        if (blockType === "image_url" || blockType === "image") {
          imageEntries.push(block);
          continue;
        }

        if (extractImageUrl(block) || extractBase64Payload(block)) {
          imageEntries.push(block);
        }
      }
    }

    for (const entry of imageEntries) {
      const base64 = extractBase64Payload(entry);
      const mimeType = extractImageMimeType(entry) ?? fallbackMimeType;
      if (base64) {
        return {
          base64,
          mimeType,
          revisedPrompt,
        };
      }

      const imageUrl = extractImageUrl(entry);
      if (!imageUrl) {
        continue;
      }

      const parsedDataUrl = parseDataUrl(imageUrl);
      if (parsedDataUrl) {
        return {
          base64: parsedDataUrl.base64,
          mimeType: parsedDataUrl.mimeType,
          revisedPrompt,
        };
      }

      const fetched = await fetchImageAsBase64(imageUrl);
      return {
        base64: fetched.base64,
        mimeType: fetched.mimeType?.startsWith("image/") ? fetched.mimeType : mimeType,
        revisedPrompt,
      };
    }
  }

  return null;
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

interface OpenRouterGenerationAttempt<T> {
  result: T;
  response: unknown;
}

export class OpenRouterClient {
  #openai: OpenAI;
  #config: OpenRouterClientConfig;

  constructor(openai: OpenAI, config: OpenRouterClientConfig) {
    this.#openai = openai;
    this.#config = config;
  }

  static fromSettings(openai: OpenAI): OpenRouterClient {
    return new OpenRouterClient(openai, readOpenRouterSettings());
  }

  async generateWithSchema<T>(
    prompt: string,
    schema: JsonSchemaDefinition,
    options?: GenerateWithSchemaOptions,
  ): Promise<T> {
    this.#assertTextModelSupported();

    const promptHash = await hashPrompt(prompt);
    const schemaSupportsStructured = this.#supportsStructuredSchema(schema);
    const modelSupportsStructured = this.#modelSupportsStructuredOutputs();
    const modelSupportsTools = this.#modelSupportsToolCalling();

    if (!schemaSupportsStructured) {
      if (!modelSupportsTools) {
        throw new Error(
          `Configured text model "${this.#config.model}" does not advertise tool-call support, ` +
            "but this schema requires tool mode (contains additionalProperties:true). " +
            "Choose a model with tools support in OpenRouter Model Manager.",
        );
      }
      return await this.#runWithLogging<T>(
        "tool",
        promptHash,
        schema,
        async () => this.#generateWithTool<T>(prompt, schema, options),
      );
    }

    if (!modelSupportsStructured && modelSupportsTools) {
      return await this.#runWithLogging<T>(
        "tool",
        promptHash,
        schema,
        async () => this.#generateWithTool<T>(prompt, schema, options),
      );
    }

    if (!modelSupportsStructured && !modelSupportsTools) {
      throw new Error(
        `Configured text model "${this.#config.model}" does not advertise structured-output or tool-call support. ` +
          "Choose a compatible text model in OpenRouter Model Manager.",
      );
    }

    try {
      return await this.#runWithLogging<T>(
        "structured",
        promptHash,
        schema,
        async () => this.#generateStructured<T>(prompt, schema, options),
      );
    } catch (error) {
      if (!this.#shouldFallback(error) || !modelSupportsTools) {
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

  async generateImage(
    prompt: string,
    options: GenerateImageOptions = {},
  ): Promise<GeneratedImageResult> {
    const model = options.model
      ? normalizeModelId(options.model, this.#config.imageModel)
      : this.#config.imageModel;
    this.#assertImageModelSupported(model);

    const format = options.format ?? "png";
    const referenceImages = options.referenceImages?.filter((entry): entry is File => entry instanceof File) ?? [];

    if (referenceImages.length > 16) {
      throw new Error("OpenRouter image edits support up to 16 reference images.");
    }

    const fallbackMimeType = format === "webp" ? "image/webp" : "image/png";
    const referenceImageDataUrls = await Promise.all(referenceImages.map((entry) => fileToDataUrl(entry)));
    const content = referenceImageDataUrls.length > 0
      ? [
        { type: "text", text: prompt },
        ...referenceImageDataUrls.map((url) => ({
          type: "image_url",
          image_url: { url },
        })),
      ]
      : prompt;

    const aspectRatio = mapImageSizeToAspectRatio(options.size);
    const requestBase: Record<string, unknown> = {
      model,
      stream: false,
      messages: [
        {
          role: "user",
          content,
        },
      ],
    };

    if (aspectRatio) {
      requestBase.image_config = {
        aspect_ratio: aspectRatio,
      };
    }

    // OpenRouter image generation now routes through chat/completions with
    // image modalities. Some models are image-only; others output text+image.
    const modalityAttempts: Array<readonly ["image", "text"] | readonly ["image"]> = [
      ["image", "text"],
      ["image"],
    ];

    let lastError: unknown = null;
    for (const modalities of modalityAttempts) {
      const request: Record<string, unknown> = {
        ...requestBase,
        modalities,
      };

      try {
        const response = await this.#openai.chat.completions.create(
          request as unknown as ChatCompletionCreateParams,
        );
        const parsed = await parseImageFromChatResponse(response, fallbackMimeType);
        if (parsed) {
          return parsed;
        }
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error("OpenRouter image generation did not return image data.");
  }

  async #generateStructured<T>(
    prompt: string,
    schema: JsonSchemaDefinition,
    options?: GenerateWithSchemaOptions,
  ): Promise<OpenRouterGenerationAttempt<T>> {
    const prepared = this.#prepareSchemaDefinition(schema);
    const request: ResponseCreateParams = {
      model: this.#config.model,
      input: this.#createInputMessages(
        prompt,
        "Return valid JSON that satisfies the requested schema.",
      ),
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
    };

    this.#applySamplingParameters(request);

    const response = await this.#openai.responses.create(request);

    return {
      response,
      result: this.#extractJson<T>(response, schema),
    } satisfies OpenRouterGenerationAttempt<T>;
  }

  async #generateWithTool<T>(
    prompt: string,
    schema: JsonSchemaDefinition,
    options?: GenerateWithSchemaOptions,
  ): Promise<OpenRouterGenerationAttempt<T>> {
    const prepared = this.#prepareSchemaDefinition(schema);
    const request: ResponseCreateParams = {
      model: this.#config.model,
      metadata: this.#createMetadata(options?.seed),
      input: this.#createInputMessages(
        prompt,
        `You are a JSON serializer. Always provide valid JSON for the ${schema.name} tool that satisfies the supplied schema.`,
      ),
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
    };

    this.#applySamplingParameters(request);

    const response = await this.#openai.responses.create(request);

    return {
      response,
      result: this.#extractJson<T>(response, schema),
    } satisfies OpenRouterGenerationAttempt<T>;
  }

  #createInputMessages(
    prompt: string,
    systemInstruction: string,
  ): Array<{ role: "system" | "user"; content: string }> {
    return [
      { role: "system", content: systemInstruction },
      { role: "user", content: prompt },
    ];
  }

  #prepareSchemaDefinition(schema: JsonSchemaDefinition): JsonSchemaDefinition {
    return {
      ...schema,
      schema: normalizeRequiredProperties(schema.schema) as Record<string, unknown>,
    } satisfies JsonSchemaDefinition;
  }

  #supportsStructuredSchema(schema: JsonSchemaDefinition): boolean {
    return !hasLooseAdditionalProperties(schema.schema);
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
    executor: () => Promise<OpenRouterGenerationAttempt<T>>,
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
    usage?: OpenRouterUsageMetrics;
    error?: string;
  }): void {
    const debugHooks = (globalThis as { CONFIG?: { debug?: { hooks?: boolean } } })
      .CONFIG?.debug?.hooks;
    if (!debugHooks) {
      return;
    }

    console.debug(`${CONSTANTS.MODULE_NAME} | AI request`, {
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

  #applySamplingParameters(request: ResponseCreateParams): void {
    if (this.#supportsTemperature()) {
      request.temperature = this.#config.temperature;
    }

    request.top_p = this.#config.top_p;
  }

  #supportsTemperature(): boolean {
    const normalized = this.#config.model.includes("/")
      ? this.#config.model.split("/").pop() ?? this.#config.model
      : this.#config.model;
    return !normalized.startsWith("gpt-5");
  }

  #createMetadata(seedOverride: number | undefined): Record<string, string> | undefined {
    const seed = seedOverride ?? this.#config.seed;
    if (typeof seed !== "number") {
      return undefined;
    }
    return { handy_dandy_seed: String(seed) };
  }

  #extractUsage(response: unknown): OpenRouterUsageMetrics | undefined {
    if (!response || typeof response !== "object") {
      return undefined;
    }

    const usage = (response as { usage?: unknown }).usage;
    if (!usage || typeof usage !== "object") {
      return undefined;
    }

    const metrics: OpenRouterUsageMetrics = {};
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
      const blockType = (block as { type?: unknown }).type;
      if (blockType === "function_call" || blockType === "tool_call") {
        const directArgs = (block as { arguments?: unknown }).arguments;
        const parsedDirect = this.#tryParseText<T>(directArgs);
        if (parsedDirect !== undefined) return parsedDirect;

        const nestedToolCall = (block as { tool_call?: unknown }).tool_call;
        if (nestedToolCall && typeof nestedToolCall === "object") {
          const nestedArgs = (nestedToolCall as { arguments?: unknown }).arguments;
          const parsedNested = this.#tryParseText<T>(nestedArgs);
          if (parsedNested !== undefined) return parsedNested;
        }
      }

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

  #assertTextModelSupported(): void {
    const capabilities = this.#getCurrentModelCapabilities();
    if (!capabilities) {
      return;
    }

    if (!capabilities.supportsTextGeneration) {
      throw new Error(
        `Configured text model "${this.#config.model}" does not advertise structured/tool support for JSON generation. ` +
          `Open OpenRouter Model Manager and choose a compatible text model.`,
      );
    }
  }

  #assertImageModelSupported(model: string): void {
    const catalog = getCachedOpenRouterModelChoiceCatalog();
    if (!catalog) {
      return;
    }

    const capabilities = catalog.capabilitiesById[model];
    if (!capabilities) {
      return;
    }

    if (!capabilities.supportsImageGeneration) {
      throw new Error(
        `Image model "${model}" does not advertise text->image support. ` +
          `Open OpenRouter Model Manager and choose a compatible image model.`,
      );
    }
  }

  #getCurrentModelCapabilities(): { supportedParameters: string[]; supportsTextGeneration: boolean } | undefined {
    const catalog = getCachedOpenRouterModelChoiceCatalog();
    if (!catalog) {
      return undefined;
    }

    return catalog.capabilitiesById[this.#config.model];
  }

  #modelSupportsToolCalling(): boolean {
    const capabilities = this.#getCurrentModelCapabilities();
    if (!capabilities) {
      return true;
    }

    const parameters = capabilities.supportedParameters;
    return parameters.includes("tools") || parameters.includes("tool_choice");
  }

  #modelSupportsStructuredOutputs(): boolean {
    const capabilities = this.#getCurrentModelCapabilities();
    if (!capabilities) {
      return true;
    }

    const parameters = capabilities.supportedParameters;
    return parameters.includes("structured_outputs") || parameters.includes("response_format");
  }
}
