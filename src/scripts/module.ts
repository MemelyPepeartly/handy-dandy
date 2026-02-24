// ---------- imports ----------
import { registerSettings } from "./setup/settings";
import { CONSTANTS } from "./constants";
import { OpenAI } from "openai";
import { insertSidebarButtons, type ControlCollection } from "./setup/sidebarButtons";
import { OpenRouterClient } from "./openrouter/client";
import { createDevNamespace, canUseDeveloperTools, type DevNamespace } from "./dev/tools";
import { ToolOverview } from "./ui/tool-overview";
import { registerNpcRemixButton } from "./ui/npc-remix-button";
import { registerNpcPortraitRegenerateButton } from "./ui/npc-portrait-regenerate-button";
import { registerNpcRemixSectionButtons } from "./ui/npc-remix-section-buttons";
import { registerItemImageGenerateButton } from "./ui/item-image-generate-button";
import { registerItemDescriptionFormatFixButton } from "./ui/item-description-format-fix-button";
import { registerTokenImagePreviewHudButton } from "./ui/token-image-preview-hud-button";
import {
  DEFAULT_GENERATION_SEED,
  generateAction,
  generateActor,
  generateItem,
  type GenerationProgressUpdate,
  type GenerateOptions,
} from "./generation";
import type { ActionPromptInput, ActorPromptInput, ItemPromptInput } from "./prompts";
import type {
  ActionSchemaData,
  ActorGenerationResult,
  ItemSchemaData,
} from "./schemas";
import { generateWorkbenchEntry } from "./flows/prompt-workbench";
import { ensureValid } from "./validation/ensure-valid";
import { importAction } from "./mappers/import";
import { initialiseMapMarkers } from "./map-markers/controller";
import { registerMapMarkerLayer } from "./map-markers/layer";
import { initializeOpenRouterClientFromSettings } from "./openrouter/runtime";

type GeneratorFunction<TInput, TResult> = (
  input: TInput,
  options: GenerateOptions,
) => Promise<TResult>;

interface BoundGenerationOptions {
  seed?: number;
  maxAttempts?: number;
  openRouterClient?: Pick<OpenRouterClient, "generateWithSchema">;
  onProgress?: (update: GenerationProgressUpdate) => void;
}

type BoundGenerateAction = (
  input: ActionPromptInput,
  options?: BoundGenerationOptions,
) => Promise<ActionSchemaData>;
type BoundGenerateItem = (
  input: ItemPromptInput,
  options?: BoundGenerationOptions,
) => Promise<ItemSchemaData>;
type BoundGenerateActor = (
  input: ActorPromptInput,
  options?: BoundGenerationOptions,
) => Promise<ActorGenerationResult>;

registerNpcRemixButton();
registerNpcPortraitRegenerateButton();
registerNpcRemixSectionButtons();
registerItemImageGenerateButton();
registerItemDescriptionFormatFixButton();
registerTokenImagePreviewHudButton();

function bindGenerator<TInput, TResult>(
  fn: GeneratorFunction<TInput, TResult>,
): (input: TInput, options?: BoundGenerationOptions) => Promise<TResult> {
  return async (input: TInput, options: BoundGenerationOptions = {}) => {
    const { openRouterClient: explicitClient, seed, maxAttempts, onProgress } = options;
    const openRouterClient = explicitClient ?? game.handyDandy?.openRouterClient;
    if (!openRouterClient) {
      throw new Error(`${CONSTANTS.MODULE_NAME} | AI client has not been initialised`);
    }

    return fn(input, {
      openRouterClient,
      seed: seed ?? DEFAULT_GENERATION_SEED,
      maxAttempts,
      onProgress,
    });
  };
}

// ---------- module namespace ----------
declare global {
  interface Game {
    handyDandy?: {
      openRouterSdk: OpenAI | null,
      openRouterClient: OpenRouterClient | null,
      refreshAIClient: () => void,
      generation: {
        generateAction: BoundGenerateAction,
        generateItem: BoundGenerateItem,
        generateActor: BoundGenerateActor,
      },
      applications: {
        toolOverview: ToolOverview,
      },
      dev: DevNamespace,
      flows: {
        promptWorkbench: typeof generateWorkbenchEntry;
      };
    };
  }
}

// ---------- INIT ------------------------------------------------------------
Hooks.once("init", async () => {
  console.log(`${CONSTANTS.MODULE_NAME} | init`);
  registerMapMarkerLayer();
  await registerSettings();

  // Load and register templates with specific names
  await loadTemplates({
    "tool-overview": `${CONSTANTS.TEMPLATE_PATH}/tool-overview.hbs`,
    "openrouter-account": `${CONSTANTS.TEMPLATE_PATH}/openrouter-account.hbs`,
    "prompt-workbench-loading": `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-loading.hbs`,
    "prompt-workbench-generation-setup": `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-generation-setup.hbs`,
    "prompt-workbench-history-list": `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-history-list.hbs`,
    "prompt-workbench-history-placeholder": `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-history-placeholder.hbs`,
    "prompt-workbench-entry-detail": `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-entry-detail.hbs`,
    "prompt-workbench-request": `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-request.hbs`,
    "prompt-workbench-result": `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-result.hbs`,
  });
});


// ---------- SETUP -----------------------------------------------------------
Hooks.once("setup", () => {
  // Provide a place other modules/macros can grab the SDK from
  const generation = {
    generateAction: bindGenerator(generateAction),
    generateItem: bindGenerator(generateItem),
    generateActor: bindGenerator(generateActor),
  } as const;

  const devNamespace = createDevNamespace({
    canAccess: canUseDeveloperTools,
    getOpenRouterClient: () => game.handyDandy?.openRouterClient ?? null,
    generateAction: generation.generateAction,
    ensureValid,
    importAction,
    console,
  });

  game.handyDandy = {
    openRouterSdk: null,
    openRouterClient: null,
    refreshAIClient: initializeOpenRouterClientFromSettings,
    generation,
    applications: {
      toolOverview: new ToolOverview(),
    },
    dev: devNamespace,
    flows: {
      promptWorkbench: generateWorkbenchEntry,
    },
  };

  initialiseMapMarkers();
});

// ---------- READY -----------------------------------------------------------
Hooks.once("ready", async () => {
  if (game.user?.isGM) {
    ui.notifications?.info(
      `${CONSTANTS.MODULE_NAME} tools live under the Scene Controls toolbar. ` +
        `Open Handy Dandy Tools or the Tool Guide from Module Settings for quick access.`,
    );
  }

  initializeOpenRouterClientFromSettings();
  if (game.handyDandy?.openRouterClient) {
    console.log(`${CONSTANTS.MODULE_NAME} | OpenRouter client initialised`);
  } else {
    console.log(`${CONSTANTS.MODULE_NAME} | OpenRouter client not configured for this user`);
  }
});

// ---------- SCENE-CONTROL GROUP --------------------------------------------
Hooks.on("getSceneControlButtons", (controls: ControlCollection) => {
  // GM-only tool-palette
  if (!game.user?.isGM) return;

  // Hot-module reloading: guard against double-insertion
  const alreadyPresent = Array.isArray(controls)
    ? controls.some(c => c.name === "handy-dandy")
    : Object.prototype.hasOwnProperty.call(controls, "handy-dandy");
  if (alreadyPresent) return;

  insertSidebarButtons(controls);
});
