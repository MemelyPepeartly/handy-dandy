import { ITEM_CATEGORIES, RARITIES, itemSchema, type SystemId } from "../schemas/index";
import { type CorrectionContext, wrapPrompt } from "./common";

export interface ItemPromptInput {
  readonly systemId: SystemId;
  readonly name: string;
  readonly referenceText: string;
  readonly slug?: string;
  readonly correction?: CorrectionContext;
}

function buildItemSchemaSection(): string {
  const categories = ITEM_CATEGORIES.join(", ");
  const rarities = RARITIES.join(", ");
  const schemaVersion = (itemSchema.properties.schema_version as { enum: readonly [number] }).enum[0];
  const priceDefault = (itemSchema.properties.price as { default: number }).default;
  const traitsDefault = JSON.stringify(
    (itemSchema.properties.traits as { default: readonly string[] }).default
  );
  const descriptionDefault = (itemSchema.properties.description as { default: string }).default;
  const imgDefault = (itemSchema.properties.img as { default: string }).default;
  return [
    "Item schema overview:",
    `- schema_version: integer literal ${schemaVersion}.`,
    "- type: string literal \"item\".",
    "- slug: non-empty string.",
    "- name: non-empty string.",
    `- itemType: string enum (${categories}).`,
    `- rarity: string enum (${rarities}).`,
    "- level: integer >= 0.",
    `- price: optional number >= 0; defaults to ${priceDefault}.`,
    `- traits: optional array of non-empty strings; defaults to ${traitsDefault}.`,
    `- description: optional string; defaults to "${descriptionDefault}".`,
    `- img: optional string formatted as a URI reference; defaults to "${imgDefault}".`
  ].join("\n");
}

function buildItemRequest(input: ItemPromptInput): string {
  const parts: string[] = [
    `Create a ${input.systemId} item entry named "${input.name}".`,
    "Base your response on the following text:",
    input.referenceText.trim()
  ];

  if (input.slug) {
    parts.splice(1, 0, `Slug suggestion: ${input.slug}`);
  }

  return parts.join("\n\n");
}

export function buildItemPrompt(input: ItemPromptInput): string {
  const request = buildItemRequest(input);
  return wrapPrompt(
    "Generate a Foundry VTT Item JSON document.",
    buildItemSchemaSection(),
    {
      request,
      systemId: input.systemId,
      correction: input.correction
    }
  );
}
