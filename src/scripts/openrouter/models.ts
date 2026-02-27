export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5-mini";
export const DEFAULT_OPENROUTER_IMAGE_MODEL = "openai/gpt-5-image-mini";

export type OpenRouterModelId = string;
export type OpenRouterImageModelId = string;

export function normalizeModelId(
  model: unknown,
  fallback: string,
): string {
  if (typeof model !== "string" || model.trim().length === 0) {
    return fallback;
  }

  const trimmed = model.trim();
  const lowered = trimmed.toLowerCase();

  if (lowered === "openai/gpt-image-1" || lowered === "gpt-image-1") {
    return "openai/gpt-5-image";
  }

  if (lowered === "openai/gpt-image" || lowered === "gpt-image") {
    return "openai/gpt-5-image";
  }

  if (trimmed.includes("/")) {
    return trimmed;
  }

  if (/^(gpt-|o[1-4])/i.test(trimmed)) {
    return `openai/${trimmed}`;
  }

  return trimmed;
}
