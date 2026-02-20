import {
  ACTOR_CATEGORIES,
  ACTOR_SIZES,
  RARITIES,
  actorSchema,
  type ActorCategory,
  type PublicationData,
  type SystemId,
} from "../schemas/index";
import {
  renderImageInstruction,
  renderPublicationSection,
  type CorrectionContext,
  wrapPrompt,
} from "./common";

export interface ActorPromptInput {
  readonly systemId: SystemId;
  readonly name: string;
  readonly referenceText: string;
  readonly slug?: string;
  readonly actorType?: ActorCategory;
  readonly correction?: CorrectionContext;
  readonly img?: string;
  readonly publication?: PublicationData;
  readonly level?: number;
  readonly includeSpellcasting?: boolean;
  readonly includeInventory?: boolean;
  readonly generateTokenImage?: boolean;
  readonly tokenPrompt?: string;
}

function buildActorSchemaSection(): string {
  const categories = ACTOR_CATEGORIES.join(", ");
  const rarities = RARITIES.join(", ");
  const sizes = ACTOR_SIZES.join(", ");
  const schemaVersion = (actorSchema.properties.schema_version as { enum: readonly [number] }).enum[0];
  const traitsDefault = JSON.stringify(
    (actorSchema.properties.traits as { default: readonly string[] }).default
  );
  const languagesDefault = JSON.stringify(
    (actorSchema.properties.languages as { default: readonly string[] }).default
  );
  const imgDefault = JSON.stringify(
    (actorSchema.properties.img as { default: string | null }).default
  );
  const sourceDefault = (actorSchema.properties.source as { default: string }).default;
  const publicationDefault = JSON.stringify(
    (actorSchema.properties.publication as { default: PublicationData }).default
  );
  return [
    "Actor schema overview:",
    `- schema_version: integer literal ${schemaVersion}.`,
    "- type: string literal \"actor\".",
    "- slug: non-empty string.",
    "- name: non-empty string.",
    `- actorType: string enum (${categories}).`,
    `- rarity: string enum (${rarities}).`,
    "- level: integer >= 0.",
    `- size: string enum (${sizes}).`,
    `- traits: array of lowercase PF2e trait slugs from the active system; defaults to ${traitsDefault}.`,
    "- alignment: optional string; defaults to null.",
    `- languages: array of strings; defaults to ${languagesDefault}.`,
    "- attributes: object describing defences and movement.",
    "  - hp: { value, max, temp, details } with non-negative integers for value, max, and temp.",
    "  - ac: { value, details } with integer value.",
    "  - perception: { value, details, senses } where senses is an array of lowercase strings.",
    "  - speed: { value, details, other } with other = array of { type, value, details } entries.",
    "  - saves: { fortitude, reflex, will } each { value, details }.",
    "  - immunities/weaknesses/resistances: arrays of objects with typed entries; defaults to [].",
    "- abilities: object with str, dex, con, int, wis, cha modifiers (integers).",
    "- skills: array of { slug, modifier, details } entries; defaults to [].",
    "- strikes: array of attacks { name, type (melee|ranged), attackBonus, traits, damage[], effects, description } with each damage entry { formula, damageType, notes } and traits using valid PF2e slugs.",
    "- actions: array of special abilities { name, actionCost (one-action|two-actions|three-actions|free|reaction|passive), traits, requirements, trigger, frequency, description } with traits limited to valid PF2e slugs.",
    "- spellcasting: optional array of entries { name, tradition, castingType (prepared|spontaneous|innate|focus|ritual), attackBonus, saveDC, notes, spells[] } where spells are { level, name, description, tradition }.",
    "- inventory: optional array of carried items { name, itemType, slug, quantity, level, description, img } used for gear import.",
    "- When actions or spells correspond to official PF2e compendium entries, preserve canonical names/slugs so import can link to existing records instead of fabricating replacements.",
    "- description: optional string; defaults to null.",
    "- recallKnowledge: optional string; defaults to null.",
    `- img: string or null containing an image URL or Foundry asset path; defaults to ${imgDefault}.`,
    `- source: string; defaults to "${sourceDefault}".`,
    `- publication: object { title, authors, license, remaster }; defaults to ${publicationDefault}.`,
    "- Description formatting rules (PF2E wiki style): use <p> paragraphs, <hr /> between setup text and outcome blocks, use @Check for saves/checks, @Damage for damage rolls, @Template for area links, and @UUID condition links where conditions are referenced.",
    "- Follow official PF2E NPC source structures for embedded actions/spell entries so imports remain immediately usable on sheet."
  ].join("\n");
}

function buildActorTypeGuidance(actorType: ActorCategory): string {
  switch (actorType) {
    case "npc":
      return "NPC focus: build encounter-ready strikes, actions, spellcasting, and defenses following official PF2E NPC conventions.";
    case "character":
      return "Character focus: build an adventurer-style actor with class-facing abilities, practical skills, and gear that matches the source.";
    case "hazard":
      return "Hazard focus: include trigger/routine behavior, clear disable counterplay, and hazard-appropriate defensive profile details.";
    case "vehicle":
      return "Vehicle focus: include operation context (crew/passengers), movement profile, and actions that represent vehicle capabilities.";
    case "familiar":
      return "Familiar focus: keep abilities support-oriented with familiar-appropriate actions and lightweight combat expectations.";
    default:
      return "";
  }
}

function buildActorRequest(input: ActorPromptInput): string {
  const parts: string[] = [
    `Create a ${input.systemId} actor entry named "${input.name}".`,
    "Summarise the following reference text into structured data:",
    input.referenceText.trim()
  ];

  const details: string[] = [];
  if (input.slug) {
    details.push(`Slug suggestion: ${input.slug}`);
  }

  if (input.actorType) {
    details.push(`Actor type: ${input.actorType}. Set the "actorType" field to this exact value.`);
  }

  if (typeof input.level === "number" && Number.isFinite(input.level)) {
    details.push(`Target level: ${input.level}`);
  }

  if (details.length) {
    parts.splice(1, 0, ...details);
  }

  if (input.actorType) {
    const actorTypeGuidance = buildActorTypeGuidance(input.actorType);
    if (actorTypeGuidance) {
      parts.push(actorTypeGuidance);
    }
  }

  const publicationSection = renderPublicationSection(input.publication);
  if (publicationSection) {
    parts.push(publicationSection);
  }

  const imageInstruction = renderImageInstruction(input.img);
  if (imageInstruction) {
    parts.push(imageInstruction);
  }

  if (input.includeSpellcasting) {
    parts.push("Include spellcasting data that aligns with the reference text.");
  }

  if (input.includeInventory) {
    parts.push("List an inventory section covering notable gear, treasure, and equipment carried.");
  }

  if (input.generateTokenImage) {
    parts.push("Describe the creature visually in enough detail to support transparent token image generation.");
  }

  if (input.tokenPrompt?.trim()) {
    parts.push(`Token image direction: ${input.tokenPrompt.trim()}`);
  }

  return parts.join("\n\n");
}

export function buildActorPrompt(input: ActorPromptInput): string {
  const request = buildActorRequest(input);
  return wrapPrompt(
    "Generate a Foundry VTT Actor JSON document.",
    buildActorSchemaSection(),
    {
      request,
      systemId: input.systemId,
      correction: input.correction
    }
  );
}
