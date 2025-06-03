// ---------- imports ----------
import { registerSettings } from "./setup/settings";
import { CONSTANTS } from "./constants";
import { OpenAI } from "openai";
import { insertSidebarButtons } from "./setup/sidebarButtons";
import { SchemaTool } from "./tools/schema-tool";

// ---------- module namespace ----------
declare global {
  interface Game {
    handyDandy?: { 
      openai: OpenAI | null,
      applications: {
        schemaTool: Application
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
    "schema-node": `${CONSTANTS.TEMPLATE_PATH}/schema-node.hbs`
  });
});


// ---------- SETUP -----------------------------------------------------------
Hooks.once("setup", () => {
  // Provide a place other modules/macros can grab the SDK from
  game.handyDandy = { openai: null, applications: { schemaTool: new SchemaTool } };
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
  game.handyDandy!.openai = new OpenAI({
    apiKey: key,
    dangerouslyAllowBrowser: true
  });

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
