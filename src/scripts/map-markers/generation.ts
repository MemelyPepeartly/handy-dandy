import { CONSTANTS } from "../constants";
import type { JsonSchemaDefinition } from "../gpt/client";
import type { MapMarkerData } from "./types";

interface BoxTextGenerationResult {
  boxText: string;
}

const BOXTEXT_GENERATION_SCHEMA: JsonSchemaDefinition = {
  name: "map_marker_boxtext",
  description: "Generate concise boxed text for a scene marker in a tabletop RPG map.",
  schema: {
    type: "object",
    properties: {
      boxText: { type: "string", minLength: 1 },
    },
    required: ["boxText"],
    additionalProperties: false,
  },
};

function resolveLengthGuidance(length: MapMarkerData["boxTextLength"] | undefined): string {
  switch (length) {
    case "short":
      return "2-3 sentences";
    case "long":
      return "5-7 sentences";
    default:
      return "3-5 sentences";
  }
}

function resolveToneGuidance(tone: MapMarkerData["tone"] | undefined): string {
  switch (tone) {
    case "mysterious":
      return "enigmatic and suspenseful";
    case "ominous":
      return "foreboding and tense";
    case "wondrous":
      return "awe-struck and evocative";
    case "grim":
      return "stark and unsettling";
    case "lively":
      return "energetic and bustling";
    default:
      return "grounded and atmospheric";
  }
}

function cleanSection(value: string | undefined): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || "None provided.";
}

export function buildMapMarkerBoxTextPrompt(
  marker: Pick<
    MapMarkerData,
    | "kind"
    | "title"
    | "prompt"
    | "areaTheme"
    | "sensoryDetails"
    | "notableFeatures"
    | "occupants"
    | "hazards"
    | "gmNotes"
    | "tone"
    | "boxTextLength"
    | "includeGmNotes"
  >,
): string {
  const markerType = marker.kind === "specific-room" ? "Specific Room" : "Map Note";
  const includeGmNotes = marker.includeGmNotes === true;
  const gmNotesDirective = includeGmNotes
    ? "- You may incorporate GM notes, but keep reveals subtle and player-facing."
    : "- Treat GM notes as private prep only. Do not reveal secrets directly.";

  return [
    "You are writing boxed text for a Pathfinder 2e Game Master.",
    "Produce one ready-to-read boxed text passage for live narration.",
    "",
    `Marker type: ${markerType}`,
    `Area title: ${cleanSection(marker.title)}`,
    `Prompt objective: ${cleanSection(marker.prompt)}`,
    `Area specifics and theme: ${cleanSection(marker.areaTheme)}`,
    `First sensory impression: ${cleanSection(marker.sensoryDetails)}`,
    `Notable features and interactables: ${cleanSection(marker.notableFeatures)}`,
    `Occupants and activity: ${cleanSection(marker.occupants)}`,
    `Hazards and tension: ${cleanSection(marker.hazards)}`,
    `GM notes: ${cleanSection(marker.gmNotes)}`,
    `Narrative tone target: ${resolveToneGuidance(marker.tone)}`,
    `Target length: ${resolveLengthGuidance(marker.boxTextLength)}`,
    "",
    "Constraints:",
    "- Write in second person present tense when describing what players perceive.",
    "- Lead with what players notice first, then layer in detail.",
    "- Keep it vivid, concrete, and immediately usable at the table.",
    gmNotesDirective,
    "- Do not include mechanics, checks, or meta commentary.",
    "- Return plain text only in the boxText field.",
  ].join("\n");
}

export async function generateMapMarkerBoxText(
  marker: Pick<
    MapMarkerData,
    | "kind"
    | "title"
    | "prompt"
    | "areaTheme"
    | "sensoryDetails"
    | "notableFeatures"
    | "occupants"
    | "hazards"
    | "gmNotes"
    | "tone"
    | "boxTextLength"
    | "includeGmNotes"
  >,
): Promise<string> {
  const gptClient = game.handyDandy?.gptClient;
  if (!gptClient) {
    throw new Error(`${CONSTANTS.MODULE_NAME} | GPT client has not been initialised`);
  }

  const response = await gptClient.generateWithSchema<BoxTextGenerationResult>(
    buildMapMarkerBoxTextPrompt(marker),
    BOXTEXT_GENERATION_SCHEMA,
  );

  const boxText = response?.boxText;
  if (typeof boxText !== "string" || !boxText.trim()) {
    throw new Error("Boxtext generation returned an empty response.");
  }

  return boxText.trim();
}
