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
  readonly generateItemImage?: boolean;
  readonly itemImagePrompt?: string;
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
    "system",
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
    `- traits: optional array of lowercase PF2e trait slugs from the active system; defaults to ${traitsDefault}. Use the shared PF2e trait parser/getter (the same utility leveraged for actors) to derive canonical slugs instead of paraphrasing traits in the description.`,
    `- description: optional string containing PF2e-formatted HTML box text; defaults to "${descriptionDefault}".`,
    "- Format the description with HTML <p> paragraphs: start with italicised flavour text (<em>) then add mechanical paragraphs that cover activation, usage, damage, and other rules that fulfil the request.",
    "- Summarise the requested mechanics instead of copying the prompt verbatim; explicitly mention damage dice, conditions, and other effects referenced in the request.",
    "- Conform to PF2E style-guide inline formatting: @Check for checks/saves, @Damage for damage, @Template for template links, and @UUID condition links where conditions are mentioned.",
    "- Use <hr /> between setup text and success/failure outcome sections when applicable.",
    "- system: optional PF2E item-system object. Use this to provide item-type-specific fields so import can build fully usable custom items.",
    "- Keep system keys in PF2E source format. Include a nested level.value and item-type-required mechanics. Item-type guidance:",
    "  - ammo: baseItem, uses { value/max/autoDestroy }, craftableAs.",
    "  - armor: category, group, acBonus, dexCap, checkPenalty, speedPenalty, strength, runes.",
    "  - shield: acBonus, hardness, hp { value/max }, speedPenalty, runes.",
    "  - weapon: category, group, damage { dice/die/damageType/modifier/persistent }, range, reload { value }, runes, bonus { value }.",
    "  - equipment: usage, equipped { carryType/invested }, quantity, bulk.",
    "  - backpack: stowing, collapsed, bulk { value/heldOrStowed/capacity/ignored }, usage.",
    "  - book: category (formula|spell), capacity, contents.",
    "  - consumable: category, uses { value/max/autoDestroy }, damage and/or embedded spell payload when applicable.",
    "  - treasure: category, price, quantity, bulk, carried/equipped context.",
    "  - feat: category, actionType { value }, actions { value }, prerequisites { value[] }, frequency when applicable.",
    "  - spell: traits.traditions, time/range/target/area/duration, defense, damage blocks, heightening.",
    "- If the request references official PF2E items/spells/effects, keep canonical names/slugs so import can link existing compendium entries rather than inventing duplicates.",
    `- img: optional string containing an image URL or Foundry asset path; defaults to ${imgDefault}. When omitted, apply the itemType default icon for that category.`,
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

  if (input.generateItemImage) {
    parts.push("Item icon generation is enabled. Keep description details vivid and icon-friendly.");
  }

  if (input.itemImagePrompt?.trim()) {
    parts.push(`Item icon direction: ${input.itemImagePrompt.trim()}`);
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
