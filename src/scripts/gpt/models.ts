export const DEFAULT_GPT_MODEL = "openai/gpt-5-mini";
export const DEFAULT_GPT_IMAGE_MODEL = "openai/gpt-image-1";

export type GPTModelId = string;
export type GPTImageModelId = string;

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
