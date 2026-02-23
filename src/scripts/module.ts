// ---------- imports ----------
import { registerSettings } from "./setup/settings";
import { CONSTANTS } from "./constants";
import { OpenAI } from "openai";
import { insertSidebarButtons, type ControlCollection } from "./setup/sidebarButtons";
import { SchemaTool } from "./tools/schema-tool";
import { DataEntryTool } from "./tools/data-entry-tool";
import { TraitBrowserTool } from "./tools/trait-browser-tool";
import { GPTClient } from "./gpt/client";
import { DeveloperConsole } from "./dev/developer-console";
import { setDeveloperConsole } from "./dev/state";
import { createDevNamespace, canUseDeveloperTools, type DevNamespace } from "./dev/tools";
import { ToolOverview } from "./ui/tool-overview";
import { registerNpcRemixButton } from "./ui/npc-remix-button";
import { registerNpcPortraitRegenerateButton } from "./ui/npc-portrait-regenerate-button";
import { registerNpcRemixSectionButtons } from "./ui/npc-remix-section-buttons";
import { registerItemImageGenerateButton } from "./ui/item-image-generate-button";
import { registerItemDescriptionFormatFixButton } from "./ui/item-description-format-fix-button";
import { registerItemRemixButton } from "./ui/item-remix-button";
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
import { exportSelectedEntities, generateWorkbenchEntry } from "./flows/prompt-workbench";
import { ensureValid } from "./validation/ensure-valid";
import { importAction } from "./mappers/import";
import { initialiseMapMarkers } from "./map-markers/controller";
import { registerMapMarkerLayer } from "./map-markers/layer";
import { initializeAIClientFromSettings } from "./gpt/runtime";

type GeneratorFunction<TInput, TResult> = (
  input: TInput,
  options: GenerateOptions,
) => Promise<TResult>;

interface BoundGenerationOptions {
  seed?: number;
  maxAttempts?: number;
  gptClient?: Pick<GPTClient, "generateWithSchema">;
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
registerItemRemixButton();
registerTokenImagePreviewHudButton();

function bindGenerator<TInput, TResult>(
  fn: GeneratorFunction<TInput, TResult>,
): (input: TInput, options?: BoundGenerationOptions) => Promise<TResult> {
  return async (input: TInput, options: BoundGenerationOptions = {}) => {
    const { gptClient: explicitClient, seed, maxAttempts, onProgress } = options;
    const gptClient = explicitClient ?? game.handyDandy?.gptClient;
    if (!gptClient) {
      throw new Error(`${CONSTANTS.MODULE_NAME} | AI client has not been initialised`);
    }

    return fn(input, {
      gptClient,
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
      openai: OpenAI | null,
      gptClient: GPTClient | null,
      refreshAIClient: () => void,
      generation: {
        generateAction: BoundGenerateAction,
        generateItem: BoundGenerateItem,
        generateActor: BoundGenerateActor,
      },
      applications: {
        schemaTool: SchemaTool,
        dataEntryTool: DataEntryTool,
        traitBrowserTool: TraitBrowserTool,
        toolOverview: ToolOverview,
      },
      developer: {
        console: DeveloperConsole,
      },
      dev: DevNamespace,
      flows: {
        exportSelection: typeof exportSelectedEntities;
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
    "schema-tool": `${CONSTANTS.TEMPLATE_PATH}/schema-tool.hbs`,
    "schema-node": `${CONSTANTS.TEMPLATE_PATH}/schema-node.hbs`,
    "data-entry-tool": `${CONSTANTS.TEMPLATE_PATH}/data-entry-tool.hbs`,
    "trait-browser-tool": `${CONSTANTS.TEMPLATE_PATH}/trait-browser-tool.hbs`,
    "developer-console": `${CONSTANTS.TEMPLATE_PATH}/developer-console.hbs`,
    "tool-overview": `${CONSTANTS.TEMPLATE_PATH}/tool-overview.hbs`,
    "openrouter-account": `${CONSTANTS.TEMPLATE_PATH}/openrouter-account.hbs`,
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

  const developerConsole = new DeveloperConsole();

  const devNamespace = createDevNamespace({
    canAccess: canUseDeveloperTools,
    getGptClient: () => game.handyDandy?.gptClient ?? null,
    generateAction: generation.generateAction,
    ensureValid,
    importAction,
    console,
  });

  game.handyDandy = {
    openai: null,
    gptClient: null,
    refreshAIClient: initializeAIClientFromSettings,
    generation,
    applications: {
      schemaTool: new SchemaTool,
      dataEntryTool: new DataEntryTool,
      traitBrowserTool: new TraitBrowserTool,
      toolOverview: new ToolOverview(),
    },
    developer: {
      console: developerConsole,
    },
    dev: devNamespace,
    flows: {
      exportSelection: exportSelectedEntities,
      promptWorkbench: generateWorkbenchEntry,
    },
  };

  setDeveloperConsole(developerConsole);
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

  initializeAIClientFromSettings();
  if (game.handyDandy?.gptClient) {
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
