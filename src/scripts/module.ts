// ---------- imports ----------
import { registerSettings } from "./setup/settings";
import { CONSTANTS } from "./constants";
import { OpenAI } from "openai";
import { insertSidebarButtons } from "./setup/sidebarButtons";
import { SchemaTool } from "./tools/schema-tool";
import { DataEntryTool } from "./tools/data-entry-tool";
import { GPTClient } from "./gpt/client";
import {
  DEFAULT_GENERATION_SEED,
  generateAction,
  generateActor,
  generateItem,
  type GenerateOptions,
} from "./generation";
import type { ActionPromptInput, ActorPromptInput, ItemPromptInput } from "./prompts";
import type { ActionSchemaData, ActorSchemaData, ItemSchemaData } from "./schemas";

type GeneratorFunction<TInput, TResult> = (
  input: TInput,
  options: GenerateOptions,
) => Promise<TResult>;

interface BoundGenerationOptions {
  seed?: number;
  maxAttempts?: number;
  gptClient?: Pick<GPTClient, "generateWithSchema">;
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
) => Promise<ActorSchemaData>;

function bindGenerator<TInput, TResult>(
  fn: GeneratorFunction<TInput, TResult>,
): (input: TInput, options?: BoundGenerationOptions) => Promise<TResult> {
  return async (input: TInput, options: BoundGenerationOptions = {}) => {
    const { gptClient: explicitClient, seed, maxAttempts } = options;
    const gptClient = explicitClient ?? game.handyDandy?.gptClient;
    if (!gptClient) {
      throw new Error(`${CONSTANTS.MODULE_NAME} | GPT client has not been initialised`);
    }

    return fn(input, {
      gptClient,
      seed: seed ?? DEFAULT_GENERATION_SEED,
      maxAttempts,
    });
  };
}

// ---------- module namespace ----------
declare global {
  interface Game {
    handyDandy?: {
      openai: OpenAI | null,
      gptClient: GPTClient | null,
      generation: {
        generateAction: BoundGenerateAction,
        generateItem: BoundGenerateItem,
        generateActor: BoundGenerateActor,
      },
      applications: {
        schemaTool: SchemaTool,
        dataEntryTool: DataEntryTool
      }
    };
  }
}

// ---------- INIT ------------------------------------------------------------
Hooks.once("init", async () => {
  console.log(`${CONSTANTS.MODULE_NAME} | init`);
  registerSettings();

  // Load and register templates with specific names
  await loadTemplates({
    "schema-tool": `${CONSTANTS.TEMPLATE_PATH}/schema-tool.hbs`,
    "schema-node": `${CONSTANTS.TEMPLATE_PATH}/schema-node.hbs`,
    "data-entry-tool": `${CONSTANTS.TEMPLATE_PATH}/data-entry-tool.hbs`
  });
});


// ---------- SETUP -----------------------------------------------------------
Hooks.once("setup", () => {
  // Provide a place other modules/macros can grab the SDK from
  game.handyDandy = {
    openai: null,
    gptClient: null,
    generation: {
      generateAction: bindGenerator(generateAction),
      generateItem: bindGenerator(generateItem),
      generateActor: bindGenerator(generateActor),
    },
    applications: {
      schemaTool: new SchemaTool,
      dataEntryTool: new DataEntryTool
    }
  };
});

// ---------- READY -----------------------------------------------------------
Hooks.once("ready", () => {
  // Only the GM needs an API key to call OpenAI from the browser
  if (!game.user?.isGM) return;

  const key = game.settings.get(CONSTANTS.MODULE_ID, "GPTApiKey") as string;
  if (!key) {
    ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | No OpenAI API key set. Please configure it in the settings.`);
    return;
  }

  // Store on the namespace for easy access later
  const openai = new OpenAI({
    apiKey: key,
    dangerouslyAllowBrowser: true
  });

  game.handyDandy!.openai = openai;
  game.handyDandy!.gptClient = GPTClient.fromSettings(openai);

  console.log(`${CONSTANTS.MODULE_NAME} | OpenAI SDK initialised`);
});

// ---------- SCENE-CONTROL GROUP --------------------------------------------
Hooks.on("getSceneControlButtons", (controls: SceneControl[]) => {
  // GM-only tool-palette
  if (!game.user?.isGM) return;

  // Hot-module reloading: guard against double-insertion
  if (controls.some(c => c.name === "handy-dandy")) return;

  insertSidebarButtons(controls);
});
