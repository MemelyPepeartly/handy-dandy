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

export function buildMapMarkerBoxTextPrompt(marker: Pick<MapMarkerData, "kind" | "prompt" | "areaTheme">): string {
  const markerType = marker.kind === "specific-room" ? "Specific Room" : "Map Note";
  const promptText = marker.prompt.trim() || "None provided.";
  const areaTheme = marker.areaTheme.trim() || "None provided.";

  return [
    "You are writing boxed text for a Pathfinder 2e Game Master.",
    "Produce one ready-to-read boxed text passage.",
    "",
    `Marker type: ${markerType}`,
    `Prompt notes: ${promptText}`,
    `Area specifics and theme: ${areaTheme}`,
    "",
    "Constraints:",
    "- Write in second person present tense when describing what players perceive.",
    "- Keep it vivid and specific, but concise (roughly 2-4 sentences).",
    "- Do not include mechanics, checks, or meta commentary.",
    "- Return plain text only in the boxText field.",
  ].join("\n");
}

export async function generateMapMarkerBoxText(marker: Pick<MapMarkerData, "kind" | "prompt" | "areaTheme">): Promise<string> {
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
