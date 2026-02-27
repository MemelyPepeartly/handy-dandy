import { CONSTANTS } from "../constants";
import { DEFAULT_OPENROUTER_IMAGE_MODEL, DEFAULT_OPENROUTER_MODEL } from "./models";

const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
const OPENROUTER_MODELS_TIMEOUT_MS = 7000;

const OPENROUTER_TEXT_SUPPORT_PARAMETERS = [
  "structured_outputs",
  "response_format",
  "tools",
  "tool_choice",
] as const;

interface OpenRouterModelRecord {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  architecture?: {
    input_modalities?: unknown;
    output_modalities?: unknown;
  };
  supported_parameters?: unknown;
}

interface OpenRouterModelsResponse {
  data?: unknown;
}

interface ModelChoiceEntry {
  id: string;
  label: string;
}

type CatalogSource = "network" | "fallback";

export interface OpenRouterModelCapabilities {
  id: string;
  label: string;
  inputModalities: string[];
  outputModalities: string[];
  supportedParameters: string[];
  contextLength?: number;
  supportsTextGeneration: boolean;
  supportsImageGeneration: boolean;
}

export interface OpenRouterModelChoiceCatalog {
  textChoices: Record<string, string>;
  imageChoices: Record<string, string>;
  capabilitiesById: Record<string, OpenRouterModelCapabilities>;
  source: CatalogSource;
  loadedAt: number;
}

let cachedCatalog: OpenRouterModelChoiceCatalog | null = null;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toModelChoiceEntry(model: OpenRouterModelRecord): ModelChoiceEntry | null {
  const id = typeof model.id === "string" ? model.id.trim() : "";
  if (!id) {
    return null;
  }

  const name = typeof model.name === "string" ? model.name.trim() : "";
  const label = name && name !== id ? `${name} (${id})` : id;
  return { id, label };
}

function sortChoicesByLabel(entries: ModelChoiceEntry[]): ModelChoiceEntry[] {
  return [...entries].sort((left, right) => left.label.localeCompare(right.label));
}

function toChoiceRecord(entries: ModelChoiceEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries) {
    result[entry.id] = entry.label;
  }
  return result;
}

function ensureChoice(choices: Record<string, string>, modelId: string, label: string): void {
  const trimmed = modelId.trim();
  if (!trimmed) {
    return;
  }

  if (!choices[trimmed]) {
    choices[trimmed] = label;
  }
}

function hasAnyParameter(
  parameters: readonly string[],
  expected: readonly string[],
): boolean {
  return expected.some((value) => parameters.includes(value));
}

function getCurrentConfiguredModel(settingKey: "OpenRouterModel" | "OpenRouterImageModel"): string | null {
  try {
    const value = game.settings?.get(CONSTANTS.MODULE_ID as never, settingKey as never) as unknown;
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

function toCapabilities(record: OpenRouterModelRecord): OpenRouterModelCapabilities | null {
  const entry = toModelChoiceEntry(record);
  if (!entry) {
    return null;
  }

  const inputModalities = asStringArray(record.architecture?.input_modalities)
    .map((value) => value.toLowerCase());
  const outputModalities = asStringArray(record.architecture?.output_modalities)
    .map((value) => value.toLowerCase());
  const supportedParameters = asStringArray(record.supported_parameters)
    .map((value) => value.toLowerCase());

  const supportsTextOutput = outputModalities.includes("text");
  const supportsImageOutput = outputModalities.includes("image");
  const supportsTextGeneration = supportsTextOutput &&
    hasAnyParameter(supportedParameters, OPENROUTER_TEXT_SUPPORT_PARAMETERS);
  const supportsImageGeneration = supportsImageOutput && inputModalities.includes("text");

  const contextLength = typeof record.context_length === "number" && Number.isFinite(record.context_length)
    ? Math.trunc(record.context_length)
    : undefined;

  return {
    id: entry.id,
    label: entry.label,
    inputModalities,
    outputModalities,
    supportedParameters,
    contextLength,
    supportsTextGeneration,
    supportsImageGeneration,
  };
}

function buildCatalogFromCapabilities(
  capabilities: readonly OpenRouterModelCapabilities[],
  source: CatalogSource,
): OpenRouterModelChoiceCatalog {
  const textEntries = capabilities
    .filter((entry) => entry.supportsTextGeneration)
    .map((entry) => ({ id: entry.id, label: entry.label }));
  const imageEntries = capabilities
    .filter((entry) => entry.supportsImageGeneration)
    .map((entry) => ({ id: entry.id, label: entry.label }));

  const textChoices = toChoiceRecord(sortChoicesByLabel(textEntries));
  const imageChoices = toChoiceRecord(sortChoicesByLabel(imageEntries));
  const capabilitiesById: Record<string, OpenRouterModelCapabilities> = {};
  for (const entry of capabilities) {
    capabilitiesById[entry.id] = entry;
  }

  ensureChoice(textChoices, DEFAULT_OPENROUTER_MODEL, `OpenAI: GPT-5 Mini (${DEFAULT_OPENROUTER_MODEL})`);
  ensureChoice(imageChoices, DEFAULT_OPENROUTER_IMAGE_MODEL, `OpenAI: GPT-5 Image Mini (${DEFAULT_OPENROUTER_IMAGE_MODEL})`);

  ensureChoice(textChoices, "openrouter/auto", "Auto Router (openrouter/auto)");

  const configuredText = getCurrentConfiguredModel("OpenRouterModel");
  const configuredImage = getCurrentConfiguredModel("OpenRouterImageModel");
  if (configuredText) {
    ensureChoice(textChoices, configuredText, `${configuredText} (currently configured)`);
  }
  if (configuredImage) {
    ensureChoice(imageChoices, configuredImage, `${configuredImage} (currently configured)`);
  }

  return {
    textChoices,
    imageChoices,
    capabilitiesById,
    source,
    loadedAt: Date.now(),
  };
}

function fallbackCatalog(): OpenRouterModelChoiceCatalog {
  const fallbackCapabilities: OpenRouterModelCapabilities[] = [
    {
      id: DEFAULT_OPENROUTER_MODEL,
      label: `OpenAI: GPT-5 Mini (${DEFAULT_OPENROUTER_MODEL})`,
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportedParameters: ["structured_outputs", "tools", "tool_choice", "response_format"],
      supportsTextGeneration: true,
      supportsImageGeneration: false,
    },
    {
      id: "openrouter/auto",
      label: "Auto Router (openrouter/auto)",
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportedParameters: ["structured_outputs", "tools", "tool_choice", "response_format"],
      supportsTextGeneration: true,
      supportsImageGeneration: false,
    },
    {
      id: DEFAULT_OPENROUTER_IMAGE_MODEL,
      label: `OpenAI: GPT-5 Image Mini (${DEFAULT_OPENROUTER_IMAGE_MODEL})`,
      inputModalities: ["text", "image"],
      outputModalities: ["text", "image"],
      supportedParameters: ["response_format", "structured_outputs"],
      supportsTextGeneration: true,
      supportsImageGeneration: true,
    },
    {
      id: "openai/gpt-5-image",
      label: "OpenAI: GPT-5 Image (openai/gpt-5-image)",
      inputModalities: ["text", "image"],
      outputModalities: ["text", "image"],
      supportedParameters: ["response_format", "structured_outputs"],
      supportsTextGeneration: true,
      supportsImageGeneration: true,
    },
  ];

  return buildCatalogFromCapabilities(fallbackCapabilities, "fallback");
}

function readApiKeyHeader(): string | null {
  try {
    const key = game.settings?.get(CONSTANTS.MODULE_ID as never, "OpenRouterApiKey" as never) as unknown;
    if (typeof key !== "string") {
      return null;
    }
    const trimmed = key.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

async function fetchOpenRouterModels(): Promise<OpenRouterModelRecord[]> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), OPENROUTER_MODELS_TIMEOUT_MS)
    : null;

  try {
    const headers: Record<string, string> = {};
    const apiKey = readApiKeyHeader();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(OPENROUTER_MODELS_ENDPOINT, {
      method: "GET",
      headers,
      signal: controller?.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const payload = await response.json() as OpenRouterModelsResponse;
    return Array.isArray(payload.data)
      ? (payload.data as OpenRouterModelRecord[])
      : [];
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

function applyFreshChoicesToSetting(settingKey: "OpenRouterModel" | "OpenRouterImageModel", choices: Record<string, string>): void {
  const settingId = `${CONSTANTS.MODULE_ID}.${settingKey}`;
  const settingRegistry = game.settings?.settings;
  if (!(settingRegistry instanceof Map)) {
    return;
  }

  const config = settingRegistry.get(settingId as never) as { choices?: Record<string, string> } | undefined;
  if (!config) {
    return;
  }

  config.choices = choices;
}

export function applyOpenRouterModelChoicesToSettings(catalog: OpenRouterModelChoiceCatalog): void {
  applyFreshChoicesToSetting("OpenRouterModel", catalog.textChoices);
  applyFreshChoicesToSetting("OpenRouterImageModel", catalog.imageChoices);
}

export function getCachedOpenRouterModelChoiceCatalog(): OpenRouterModelChoiceCatalog | null {
  return cachedCatalog;
}

export async function loadOpenRouterModelChoiceCatalog(
  options: { forceRefresh?: boolean } = {},
): Promise<OpenRouterModelChoiceCatalog> {
  if (!options.forceRefresh && cachedCatalog) {
    return cachedCatalog;
  }

  const fallback = fallbackCatalog();

  try {
    const models = await fetchOpenRouterModels();
    if (models.length === 0) {
      cachedCatalog = fallback;
      return fallback;
    }

    const capabilities = models
      .map((entry) => toCapabilities(entry))
      .filter((entry): entry is OpenRouterModelCapabilities => Boolean(entry));
    if (!capabilities.length) {
      cachedCatalog = fallback;
      return fallback;
    }

    const catalog = buildCatalogFromCapabilities(capabilities, "network");
    cachedCatalog = catalog;
    return catalog;
  } catch (error) {
    console.warn(`${CONSTANTS.MODULE_NAME} | Failed to load OpenRouter model catalog`, error);
    cachedCatalog = cachedCatalog ?? fallback;
    return cachedCatalog;
  }
}

export async function refreshOpenRouterModelChoiceCatalog(): Promise<OpenRouterModelChoiceCatalog> {
  const catalog = await loadOpenRouterModelChoiceCatalog({ forceRefresh: true });
  applyOpenRouterModelChoicesToSettings(catalog);
  return catalog;
}
