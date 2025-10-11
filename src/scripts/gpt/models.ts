export const GPT_MODEL_CHOICES = {
  "gpt-5.1-mini": "GPT-5.1 Mini",
  "gpt-5.1": "GPT-5.1",
  "gpt-5-preview": "GPT-5 Preview",
  "gpt-4.1-mini": "GPT-4.1 Mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-4.1-nano": "GPT-4.1 Nano",
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4o": "GPT-4o",
} as const satisfies Record<string, string>;

export type GPTModelId = keyof typeof GPT_MODEL_CHOICES;

export const DEFAULT_GPT_MODEL: GPTModelId = "gpt-4.1-mini";

export function isValidGPTModel(model: unknown): model is GPTModelId {
  return (
    typeof model === "string" &&
    Object.prototype.hasOwnProperty.call(GPT_MODEL_CHOICES, model)
  );
}
