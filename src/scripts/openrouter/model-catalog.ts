import { CONSTANTS } from "../constants";
import { DEFAULT_OPENROUTER_IMAGE_MODEL, DEFAULT_OPENROUTER_MODEL } from "../openrouter/models";

const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
const OPENROUTER_MODELS_TIMEOUT_MS = 5000;

interface OpenRouterModelRecord {
  id?: unknown;
  name?: unknown;
  architecture?: {
    output_modalities?: unknown;
  };
}

interface OpenRouterModelsResponse {
  data?: unknown;
}

interface ModelChoiceEntry {
  id: string;
  label: string;
}

export interface OpenRouterModelChoiceCatalog {
  textChoices: Record<string, string>;
  imageChoices: Record<string, string>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
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

function fallbackCatalog(): OpenRouterModelChoiceCatalog {
  const textChoices: Record<string, string> = {};
  const imageChoices: Record<string, string> = {};

  ensureChoice(textChoices, DEFAULT_OPENROUTER_MODEL, `OpenAI: GPT-5 Mini (${DEFAULT_OPENROUTER_MODEL})`);
  ensureChoice(textChoices, "openrouter/auto", "Auto Router (openrouter/auto)");
  ensureChoice(textChoices, "openai/gpt-5", "OpenAI: GPT-5 (openai/gpt-5)");

  ensureChoice(imageChoices, DEFAULT_OPENROUTER_IMAGE_MODEL, `OpenAI: GPT Image 1 (${DEFAULT_OPENROUTER_IMAGE_MODEL})`);
  ensureChoice(imageChoices, "openai/gpt-5-image-mini", "OpenAI: GPT-5 Image Mini (openai/gpt-5-image-mini)");
  ensureChoice(imageChoices, "openai/gpt-5-image", "OpenAI: GPT-5 Image (openai/gpt-5-image)");
  ensureChoice(imageChoices, "openrouter/auto", "Auto Router (openrouter/auto)");

  return { textChoices, imageChoices };
}

async function fetchOpenRouterModels(): Promise<OpenRouterModelRecord[]> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), OPENROUTER_MODELS_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(OPENROUTER_MODELS_ENDPOINT, {
      method: "GET",
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

export async function loadOpenRouterModelChoiceCatalog(): Promise<OpenRouterModelChoiceCatalog> {
  const fallback = fallbackCatalog();

  try {
    const models = await fetchOpenRouterModels();
    if (models.length === 0) {
      return fallback;
    }

    const textEntries: ModelChoiceEntry[] = [];
    const imageEntries: ModelChoiceEntry[] = [];

    for (const model of models) {
      const choice = toModelChoiceEntry(model);
      if (!choice) {
        continue;
      }

      const outputModalities = asStringArray(model.architecture?.output_modalities);
      if (outputModalities.includes("text")) {
        textEntries.push(choice);
      }
      if (outputModalities.includes("image")) {
        imageEntries.push(choice);
      }
    }

    const textChoices = toChoiceRecord(sortChoicesByLabel(textEntries));
    const imageChoices = toChoiceRecord(sortChoicesByLabel(imageEntries));

    ensureChoice(textChoices, DEFAULT_OPENROUTER_MODEL, `OpenAI: GPT-5 Mini (${DEFAULT_OPENROUTER_MODEL})`);
    ensureChoice(imageChoices, DEFAULT_OPENROUTER_IMAGE_MODEL, `OpenAI: GPT Image 1 (${DEFAULT_OPENROUTER_IMAGE_MODEL})`);

    return {
      textChoices: Object.keys(textChoices).length > 0 ? textChoices : fallback.textChoices,
      imageChoices: Object.keys(imageChoices).length > 0 ? imageChoices : fallback.imageChoices,
    };
  } catch (error) {
    console.warn(`${CONSTANTS.MODULE_NAME} | Failed to load OpenRouter model catalog`, error);
    return fallback;
  }
}

