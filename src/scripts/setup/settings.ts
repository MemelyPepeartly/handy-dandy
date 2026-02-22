import { CONSTANTS } from "../constants";
import { DEFAULT_GPT_IMAGE_MODEL, DEFAULT_GPT_MODEL } from "../gpt/models";
import { updateGPTClientFromSettings } from "../gpt/client";
import { initializeAIClientFromSettings } from "../gpt/runtime";
import { ToolOverview } from "../ui/tool-overview";
import { OpenRouterAccountSettings } from "./openrouter-account";

// Foundry V13 supports "user" scope. The installed type package still targets
// V12, so we cast to keep strict TypeScript while using runtime-correct scope.
const USER_SCOPE = "user" as unknown as "client";

export function registerSettings(): void {
  const settings = game.settings!;

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterApiKey", {
    name: "OpenRouter API Key",
    hint: "User-scoped OpenRouter API key (managed via the OpenRouter Account menu).",
    scope: USER_SCOPE,
    config: false,
    type: String,
    default: "",
    onChange: () => {
      initializeAIClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterAuthMethod", {
    name: "OpenRouter Auth Method",
    hint: "How this user authenticated with OpenRouter.",
    scope: USER_SCOPE,
    config: false,
    type: String,
    default: "",
  });

  settings.registerMenu(CONSTANTS.MODULE_ID, "openRouterAccount", {
    name: "OpenRouter Account",
    label: "Connect OpenRouter",
    hint: "Connect this user with OpenRouter via OAuth, or store a manual API key.",
    icon: "fas fa-right-to-bracket",
    type: OpenRouterAccountSettings,
    restricted: false,
  });

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterModel", {
    name: "OpenRouter Text Model",
    hint: "Model ID for structured text generation (example: openai/gpt-5-mini).",
    scope: USER_SCOPE,
    config: true,
    type: String,
    default: DEFAULT_GPT_MODEL,
    onChange: () => {
      updateGPTClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterImageModel", {
    name: "OpenRouter Image Model",
    hint: "Model ID for image generation (example: openai/gpt-image-1).",
    scope: USER_SCOPE,
    config: true,
    type: String,
    default: DEFAULT_GPT_IMAGE_MODEL,
    onChange: () => {
      updateGPTClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterTemperature", {
    name: "OpenRouter Temperature",
    hint: "Sampling temperature for generation requests (0-2).",
    scope: USER_SCOPE,
    config: true,
    type: Number,
    default: 0.2,
    onChange: () => {
      updateGPTClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterTopP", {
    name: "OpenRouter Top P",
    hint: "Nucleus sampling probability mass for generation requests (0-1).",
    scope: USER_SCOPE,
    config: true,
    type: Number,
    default: 1,
    onChange: () => {
      updateGPTClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterSeed", {
    name: "OpenRouter Seed",
    hint: "Optional deterministic seed (leave blank for random).",
    scope: USER_SCOPE,
    config: true,
    type: Number,
    default: Number.NaN,
    onChange: () => {
      updateGPTClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "GeneratedImageDirectory", {
    name: "Generated Image Directory",
    hint: "Directory under assets used for generated images. Enter asset-relative paths only (no Data/ prefix). Examples: handy-dandy, my-custom-images.",
    scope: "world",
    config: true,
    type: String,
    default: "handy-dandy",
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
