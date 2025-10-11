import { ACTION_EXECUTIONS, RARITIES, actionSchema, type SystemId } from "../schemas/index";
import { type CorrectionContext, wrapPrompt } from "./common";

export interface ActionPromptInput {
  readonly systemId: SystemId;
  readonly title: string;
  readonly referenceText: string;
  readonly slug?: string;
  readonly correction?: CorrectionContext;
}

function buildActionSchemaSection(): string {
  const enumExecutions = ACTION_EXECUTIONS.join(", ");
  const rarities = RARITIES.join(", ");
  const schemaVersion = (actionSchema.properties.schema_version as { enum: readonly [number] }).enum[0];
  const requirementsDefault = (actionSchema.properties.requirements as { default: string }).default;
  const rarityDefault = (actionSchema.properties.rarity as { default: string }).default;
  const traitsDefault = JSON.stringify(
    (actionSchema.properties.traits as { default: readonly string[] }).default
  );
  const imgDefault = JSON.stringify(
    (actionSchema.properties.img as { default: string | null }).default
  );
  const sourceDefault = (actionSchema.properties.source as { default: string }).default;
  return [
    "Action schema overview:",
    `- schema_version: integer literal ${schemaVersion}.`,
    "- type: string literal \"action\".",
    "- slug: non-empty string.",
    "- name: non-empty string.",
    `- actionType: string enum value (choose from: ${enumExecutions}).`,
    "- description: non-empty string containing the full action rules.",
    `- traits: optional array of non-empty strings; defaults to ${traitsDefault}.`,
    `- requirements: optional string; defaults to "${requirementsDefault}".`,
    `- img: optional string formatted as a URI reference; defaults to ${imgDefault}.`,
    `- rarity: optional string enum (${rarities}); defaults to "${rarityDefault}".`,
    `- source: optional string; defaults to "${sourceDefault}".`
  ].join("\n");
}

function buildActionRequest(input: ActionPromptInput): string {
  const parts: string[] = [
    `Create a ${input.systemId} action entry titled "${input.title}".`,
    "Use the reference text verbatim where appropriate:",
    input.referenceText.trim()
  ];

  if (input.slug) {
    parts.splice(1, 0, `Slug suggestion: ${input.slug}`);
  }

  return parts.join("\n\n");
}

export function buildActionPrompt(input: ActionPromptInput): string {
  const request = buildActionRequest(input);
  return wrapPrompt(
    "Generate a Foundry VTT Action JSON document.",
    buildActionSchemaSection(),
    {
      request,
      systemId: input.systemId,
      correction: input.correction
    }
  );
}
