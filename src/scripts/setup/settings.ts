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

  settings.register(CONSTANTS.MODULE_ID, "GPTModel", {
    name: "GPT Model",
    hint: "The OpenAI model identifier that should be used for Handy-Dandy prompts.",
    scope: "client",
    config: true,
    type: String,
    default: "gpt-4.1-mini"
  });

  settings.register(CONSTANTS.MODULE_ID, "GPTTemperature", {
    name: "GPT Temperature",
    hint: "Sampling temperature for OpenAI responses (0-2).",
    scope: "client",
    config: true,
    type: Number,
    default: 0.2
  });

  settings.register(CONSTANTS.MODULE_ID, "GPTTopP", {
    name: "GPT Top P",
    hint: "Nucleus sampling probability mass for OpenAI responses (0-1).",
    scope: "client",
    config: true,
    type: Number,
    default: 1
  });

  settings.register(CONSTANTS.MODULE_ID, "GPTSeed", {
    name: "GPT Seed",
    hint: "Optional deterministic seed for OpenAI responses (leave blank for random).",
    scope: "client",
    config: true,
    type: Number,
    default: null
  });

  settings.register(CONSTANTS.MODULE_ID, "developerDumpInvalidJson", {
    name: "Developer: Dump Invalid JSON",
    hint: "When enabled, failed Ensure Valid attempts will record the last invalid JSON in the developer console.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });

  settings.register(CONSTANTS.MODULE_ID, "developerDumpAjvErrors", {
    name: "Developer: Dump Ajv Errors",
    hint: "When enabled, failed Ensure Valid attempts will record Ajv error messages in the developer console.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });
}
