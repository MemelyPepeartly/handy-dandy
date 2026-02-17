// scripts/settings.ts
import { CONSTANTS } from "../constants";
import { ToolOverview } from "../ui/tool-overview";
import {
  DEFAULT_GPT_IMAGE_MODEL,
  DEFAULT_GPT_MODEL,
  GPT_IMAGE_MODEL_CHOICES,
  GPT_MODEL_CHOICES,
} from "../gpt/models";
import { updateGPTClientFromSettings } from "../gpt/client";

export function registerSettings(): void {
  const settings = game.settings!;

  settings.register(CONSTANTS.MODULE_ID, "GPTApiKey", {
    name: "GPT API Key",
    hint: "Insert your GPT API key here",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  settings.register(CONSTANTS.MODULE_ID, "GPTOrganization", {
    name: "GPT Organization",
    hint: "Insert your GPT organization ID here",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  settings.register(CONSTANTS.MODULE_ID, "GPTModel", {
    name: "GPT Model",
    hint: "The OpenAI text model used for generation prompts and validation repair.",
    scope: "world",
    config: true,
    type: String,
    choices: GPT_MODEL_CHOICES,
    default: DEFAULT_GPT_MODEL,
    onChange: () => {
      updateGPTClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "GPTImageModel", {
    name: "GPT Image Model",
    hint: "The OpenAI image model used for transparent token generation.",
    scope: "world",
    config: true,
    type: String,
    choices: GPT_IMAGE_MODEL_CHOICES,
    default: DEFAULT_GPT_IMAGE_MODEL,
    onChange: () => {
      updateGPTClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "GPTTemperature", {
    name: "GPT Temperature",
    hint: "Sampling temperature for OpenAI responses (0-2).",
    scope: "world",
    config: true,
    type: Number,
    default: 0.2,
    onChange: () => {
      updateGPTClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "GPTTopP", {
    name: "GPT Top P",
    hint: "Nucleus sampling probability mass for OpenAI responses (0-1).",
    scope: "world",
    config: true,
    type: Number,
    default: 1,
    onChange: () => {
      updateGPTClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "GPTSeed", {
    name: "GPT Seed",
    hint: "Optional deterministic seed for OpenAI responses (leave blank for random).",
    scope: "world",
    config: true,
    type: Number,
    default: Number.NaN,
    onChange: () => {
      updateGPTClientFromSettings();
    },
  });

  settings.registerMenu(CONSTANTS.MODULE_ID, "toolGuide", {
    name: "Handy Dandy Tool Guide",
    label: "Open Tool Guide",
    hint: "Open a quick reference that shows where to access each Handy Dandy tool inside Foundry.",
    icon: "fas fa-compass",
    type: ToolOverview,
    restricted: false,
  });

  settings.register(CONSTANTS.MODULE_ID, "developerDumpInvalidJson", {
    name: "Developer: Dump Invalid JSON",
    hint: "When enabled, failed Ensure Valid attempts will record the last invalid JSON in the developer console.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  settings.register(CONSTANTS.MODULE_ID, "developerDumpAjvErrors", {
    name: "Developer: Dump Ajv Errors",
    hint: "When enabled, failed Ensure Valid attempts will record Ajv error messages in the developer console.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
}
