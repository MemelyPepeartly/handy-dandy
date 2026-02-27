import { CONSTANTS } from "../constants";
import { DEFAULT_OPENROUTER_IMAGE_MODEL, DEFAULT_OPENROUTER_MODEL } from "../openrouter/models";
import { updateOpenRouterClientFromSettings } from "../openrouter/client";
import { initializeOpenRouterClientFromSettings } from "../openrouter/runtime";
import { loadOpenRouterModelChoiceCatalog } from "../openrouter/model-catalog";
import { ToolOverview } from "../ui/tool-overview";
import { OpenRouterAccountSettings } from "./openrouter-account";
import { OpenRouterModelManagerSettings } from "./openrouter-model-manager";

// Foundry V13 supports "user" scope. The installed type package still targets
// V12, so we cast to keep strict TypeScript while using runtime-correct scope.
const USER_SCOPE = "user" as unknown as "client";

export async function registerSettings(): Promise<void> {
  const settings = game.settings!;
  const modelCatalog = await loadOpenRouterModelChoiceCatalog();

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterApiKey", {
    name: "OpenRouter API Key",
    hint: "User-scoped OpenRouter API key (managed via the OpenRouter Account menu).",
    scope: USER_SCOPE,
    config: false,
    type: String,
    default: "",
    onChange: () => {
      initializeOpenRouterClientFromSettings();
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

  settings.registerMenu(CONSTANTS.MODULE_ID, "openRouterModelManager", {
    name: "OpenRouter Model Manager",
    label: "Manage OpenRouter Models",
    hint: "Refresh available OpenRouter models and choose text/image models from a capability-validated catalog.",
    icon: "fas fa-list-check",
    type: OpenRouterModelManagerSettings,
    restricted: false,
  });

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterModel", {
    name: "OpenRouter Text Model",
    hint: "Model used for structured text generation. Use OpenRouter Model Manager to refresh the list.",
    scope: USER_SCOPE,
    config: true,
    type: String,
    choices: modelCatalog.textChoices,
    default: DEFAULT_OPENROUTER_MODEL,
    onChange: () => {
      updateOpenRouterClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterImageModel", {
    name: "OpenRouter Image Model",
    hint: "Model used for image generation. Use OpenRouter Model Manager to refresh the list.",
    scope: USER_SCOPE,
    config: true,
    type: String,
    choices: modelCatalog.imageChoices,
    default: DEFAULT_OPENROUTER_IMAGE_MODEL,
    onChange: () => {
      updateOpenRouterClientFromSettings();
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
      updateOpenRouterClientFromSettings();
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
      updateOpenRouterClientFromSettings();
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
      updateOpenRouterClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterEnableWebSearch", {
    name: "OpenRouter Web Search",
    hint: "Enable OpenRouter web plugin for generation requests. Recommended for PF2E rulings and current references.",
    scope: USER_SCOPE,
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      updateOpenRouterClientFromSettings();
    },
  });

  settings.register(CONSTANTS.MODULE_ID, "OpenRouterWebSearchMaxResults", {
    name: "OpenRouter Web Search Max Results",
    hint: "Maximum web results used per request when web search is enabled (1-10).",
    scope: USER_SCOPE,
    config: true,
    type: Number,
    default: 5,
    onChange: () => {
      updateOpenRouterClientFromSettings();
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
    hint: "When enabled, failed Ensure Valid attempts will print the last invalid JSON to the browser console.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  settings.register(CONSTANTS.MODULE_ID, "developerDumpAjvErrors", {
    name: "Developer: Dump Ajv Errors",
    hint: "When enabled, failed Ensure Valid attempts will print Ajv error messages to the browser console.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
}
