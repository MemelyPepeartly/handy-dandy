import {
  ITEM_CATEGORIES,
  PUBLICATION_DEFAULT,
  RARITIES,
  itemSchema,
  type ItemCategory,
  type PublicationData,
  type SystemId,
} from "../schemas/index";
import {
  renderImageInstruction,
  renderPublicationSection,
  type CorrectionContext,
  wrapPrompt,
} from "./common";

export interface ItemPromptInput {
  readonly systemId: SystemId;
  readonly name: string;
  readonly referenceText: string;
  readonly slug?: string;
  readonly itemType?: ItemCategory;
  readonly correction?: CorrectionContext;
  readonly img?: string;
  readonly publication?: PublicationData;
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
  const imgDefault = JSON.stringify(
    (itemSchema.properties.img as { default: string | null }).default
  );
  const sourceDefault = (itemSchema.properties.source as { default: string }).default;
  const publicationDefault = JSON.stringify(PUBLICATION_DEFAULT);
  const canonicalKeys = [
    "schema_version",
    "systemId",
    "type",
    "slug",
    "name",
    "itemType",
    "rarity",
    "level",
    "price",
    "traits",
    "description",
    "img",
    "source",
    "publication",
  ].join(", ");
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
    `- traits: optional array of lowercase PF2e trait slugs from the active system; defaults to ${traitsDefault}.`,
    `- description: optional string containing PF2e-formatted HTML box text; defaults to "${descriptionDefault}".`,
    "- Format the description with HTML <p> paragraphs: start with italicised flavour text (<em>) then add mechanical paragraphs that cover activation, usage, damage, and other rules that fulfil the request.",
    "- Summarise the requested mechanics instead of copying the prompt verbatim; explicitly mention damage dice, conditions, and other effects referenced in the request.",
    `- img: optional string containing an image URL or Foundry asset path; defaults to ${imgDefault}. When omitted, apply the category default (armor → shield.svg, weapon → weapon.svg, equipment/other → equipment.svg, consumable → consumable.svg, feat → feat.svg, spell → spell.svg, wand → wand.svg, staff → staff.svg).`,
    `- source: optional string; defaults to "${sourceDefault}".`,
    `- publication: object { title, authors, license, remaster }; defaults to ${publicationDefault}.`,
    `- Always include every top-level property in the JSON response using this canonical set: ${canonicalKeys}.`,
    `- When a property is optional, include it with the default value to preserve the exact structure shown in the reference assets.`
  ].join("\n");
}

function buildItemRequest(input: ItemPromptInput): string {
  const parts: string[] = [
    `Create a ${input.systemId} item entry named "${input.name}".`,
    "Base your response on the following text:",
    input.referenceText.trim()
  ];

  if (input.itemType) {
    parts.splice(1, 0, `Item type: ${input.itemType}. Set the \"itemType\" field to this exact value.`);
  }

  if (input.slug) {
    parts.splice(1, 0, `Slug suggestion: ${input.slug}`);
  }

  parts.push(
    [
      "Description guidelines:",
      "- Write brand-new Pathfinder Second Edition item rules that realise the request without echoing it word for word.",
      "- Use HTML <p> tags in the description; begin with <p><em>flavour text</em></p> followed by mechanical paragraphs.",
      "- Call out level-appropriate activation details, usage requirements, damage dice, conditions, and other mechanical effects that the prompt implies.",
    ].join("\n"),
  );

  const publicationSection = renderPublicationSection(input.publication);
  if (publicationSection) {
    parts.push(publicationSection);
  }

  const imageInstruction = renderImageInstruction(input.img);
  if (imageInstruction) {
    parts.push(imageInstruction);
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
