export const GPT_MODEL_CHOICES = {
  "gpt-5.2": "GPT-5.2",
  "gpt-5.2-chat-latest": "GPT-5.2 Chat Latest",
  "gpt-5.2-codex": "GPT-5.2 Codex",
  "gpt-5.2-pro": "GPT-5.2 Pro",
  "gpt-5": "GPT-5",
  "gpt-5-mini": "GPT-5 Mini",
  "gpt-5-nano": "GPT-5 Nano",
} as const satisfies Record<string, string>;

export type GPTModelId = keyof typeof GPT_MODEL_CHOICES;

export const DEFAULT_GPT_MODEL: GPTModelId = "gpt-5-mini";

export function isValidGPTModel(model: unknown): model is GPTModelId {
  return (
    typeof model === "string" &&
    Object.prototype.hasOwnProperty.call(GPT_MODEL_CHOICES, model)
  );
}

export const GPT_IMAGE_MODEL_CHOICES = {
  "gpt-image-1.5": "GPT-Image-1.5",
  "gpt-image-1": "GPT-Image-1",
  "gpt-image-1-mini": "GPT-Image-1 Mini",
} as const satisfies Record<string, string>;

export type GPTImageModelId = keyof typeof GPT_IMAGE_MODEL_CHOICES;

export const DEFAULT_GPT_IMAGE_MODEL: GPTImageModelId = "gpt-image-1.5";

export function isValidGPTImageModel(model: unknown): model is GPTImageModelId {
  return (
    typeof model === "string" &&
    Object.prototype.hasOwnProperty.call(GPT_IMAGE_MODEL_CHOICES, model)
  );
}
