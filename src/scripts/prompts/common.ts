import { SYSTEM_IDS, type PublicationData, type SystemId } from "../schemas/index";

export interface CorrectionContext {
  readonly summary: string;
  readonly previous: Record<string, unknown>;
}

export interface PromptBaseInput {
  readonly request: string;
  readonly systemId: SystemId;
  readonly correction?: CorrectionContext;
}

function formatList(values: readonly string[]): string {
  return values.map((value) => `- ${value}`).join("\n");
}

export function renderSystemIdSection(systemId: SystemId): string {
  const allowedSystems = formatList([...SYSTEM_IDS]);
  return [
    "System ID handling:",
    `- Allowed values:`,
    allowedSystems,
    `- Use the requested systemId: \"${systemId}\".`
  ].join("\n");
}

export function renderCorrectionSection(correction?: CorrectionContext): string {
  if (!correction) return "";
  const serialized = JSON.stringify(correction.previous, null, 2);
  return [
    "Correction context:",
    `- Reason: ${correction.summary}`,
    "- Previous draft (update instead of recreating blindly):",
    serialized
  ].join("\n");
}

export function wrapPrompt(
  title: string,
  schemaSection: string,
  input: PromptBaseInput
): string {
  const sections: string[] = [
    title,
    "Always respond with valid JSON matching the schema. Do not add commentary.",
    renderSystemIdSection(input.systemId)
  ];

  const correctionSection = renderCorrectionSection(input.correction);
  if (correctionSection) {
    sections.push(correctionSection);
  }

  sections.push(
    schemaSection.trim(),
    "User request:",
    input.request.trim(),
    "Reminder: Apply any corrections precisely and ensure the final JSON satisfies every constraint before responding."
  );

  return sections
    .filter((section) => section.length > 0)
    .join("\n\n");
}

export function renderPublicationSection(publication?: PublicationData): string {
  if (!publication) return "";

  const title = publication.title?.trim() ?? "";
  const authors = publication.authors?.trim() ?? "";
  const license = publication.license?.trim() ?? "";
  const remaster = publication.remaster ? "true" : "false";

  return [
    "Publication metadata:",
    `- Title: ${title}`,
    `- Authors: ${authors}`,
    `- License: ${license}`,
    `- Remaster: ${remaster}`,
    "Set the publication object in the JSON to match these values exactly.",
  ].join("\n");
}

export function renderImageInstruction(img?: string): string {
  const trimmed = img?.trim();
  if (!trimmed) return "";

  return `Set the top-level \"img\" property to \"${trimmed}\".`;
}
