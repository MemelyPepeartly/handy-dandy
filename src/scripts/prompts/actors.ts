import { ACTOR_CATEGORIES, RARITIES, actorSchema, type SystemId } from "../schemas/index";
import { type CorrectionContext, wrapPrompt } from "./common";

export interface ActorPromptInput {
  readonly systemId: SystemId;
  readonly name: string;
  readonly referenceText: string;
  readonly slug?: string;
  readonly correction?: CorrectionContext;
}

function buildActorSchemaSection(): string {
  const categories = ACTOR_CATEGORIES.join(", ");
  const rarities = RARITIES.join(", ");
  const schemaVersion = (actorSchema.properties.schema_version as { enum: readonly [number] }).enum[0];
  const traitsDefault = JSON.stringify(
    (actorSchema.properties.traits as { default: readonly string[] }).default
  );
  const languagesDefault = JSON.stringify(
    (actorSchema.properties.languages as { default: readonly string[] }).default
  );
  const imgDefault = (actorSchema.properties.img as { default: string }).default;
  return [
    "Actor schema overview:",
    `- schema_version: integer literal ${schemaVersion}.`,
    "- type: string literal \"actor\".",
    "- slug: non-empty string.",
    "- name: non-empty string.",
    `- actorType: string enum (${categories}).`,
    `- rarity: string enum (${rarities}).`,
    "- level: integer >= 0.",
    `- traits: optional array of non-empty strings; defaults to ${traitsDefault}.`,
    `- languages: optional array of non-empty strings; defaults to ${languagesDefault}.`,
    `- img: optional string formatted as a URI reference; defaults to "${imgDefault}".`
  ].join("\n");
}

function buildActorRequest(input: ActorPromptInput): string {
  const parts: string[] = [
    `Create a ${input.systemId} actor entry named "${input.name}".`,
    "Summarise the following reference text into structured data:",
    input.referenceText.trim()
  ];

  if (input.slug) {
    parts.splice(1, 0, `Slug suggestion: ${input.slug}`);
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
