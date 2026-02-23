export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5-mini";
export const DEFAULT_OPENROUTER_IMAGE_MODEL = "openai/gpt-image-1";

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
  if (trimmed.includes("/")) {
    return trimmed;
  }

  if (/^(gpt-|o[1-4])/i.test(trimmed)) {
    return `openai/${trimmed}`;
  }

  return trimmed;
}
