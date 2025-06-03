// scripts/settings.ts
import { CONSTANTS } from "../constants";

export function registerSettings(): void {
  const settings = game.settings!;

  settings.register(CONSTANTS.MODULE_ID, "GPTApiKey", {
    name: "GPT API Key",
    hint: "Insert your GPT API key here",
    scope: "client",
    config: true,
    type: String,
    default: ""
  });

  settings.register(CONSTANTS.MODULE_ID, "GPTOrganization", {
    name: "GPT Organization",
    hint: "Insert your GPT organization ID here",
    scope: "client",
    config: true,
    type: String,
    default: ""
  });
}
