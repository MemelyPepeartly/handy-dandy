import {
  ACTION_EXECUTIONS,
  PUBLICATION_DEFAULT,
  RARITIES,
  actionSchema,
  type PublicationData,
  type SystemId,
} from "../schemas/index";
import {
  renderImageInstruction,
  renderPublicationSection,
  type CorrectionContext,
  wrapPrompt,
} from "./common";

export interface ActionPromptInput {
  readonly systemId: SystemId;
  readonly title: string;
  readonly referenceText: string;
  readonly slug?: string;
  readonly correction?: CorrectionContext;
  readonly img?: string;
  readonly publication?: PublicationData;
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
  const publicationDefault = JSON.stringify(PUBLICATION_DEFAULT);
  return [
    "Action schema overview:",
    `- schema_version: integer literal ${schemaVersion}.`,
    "- type: string literal \"action\".",
    "- slug: non-empty string.",
    "- name: non-empty string.",
    `- actionType: string enum value (choose from: ${enumExecutions}).`,
    "- description: non-empty string containing the full action rules.",
    "- Format descriptions with PF2E inline syntax: @Check for checks/saves, @Damage for damage, @Template for templates, and @UUID condition links where relevant.",
    "- Use <hr /> between setup text and outcome sections (Critical Success/Success/Failure/Critical Failure) when outcomes are present.",
    `- traits: optional array of lowercase PF2e trait slugs drawn from the active system; defaults to ${traitsDefault}.`,
    `- requirements: optional string; defaults to "${requirementsDefault}".`,
    `- img: optional string containing an image URL or Foundry asset path; defaults to ${imgDefault}.`,
    `- rarity: optional string enum (${rarities}); defaults to "${rarityDefault}".`,
    `- source: optional string; defaults to "${sourceDefault}".`,
    `- publication: object { title, authors, license, remaster }; defaults to ${publicationDefault}.`,
    "- If this action maps to official PF2E content, keep canonical name/slug to support compendium-linked import."
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
