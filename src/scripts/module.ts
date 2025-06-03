// ---------- imports ----------
import { registerSettings } from "./helpers/settings";
import { CONSTANTS } from "./constants";
import { OpenAI } from "openai";

// ---------- module namespace ----------
declare global {
  interface Game {
    handyDandy?: { openai: OpenAI | null };
  }
}

// ---------- INIT ------------------------------------------------------------
Hooks.once("init", async () => {
  console.log(`${CONSTANTS.MODULE_NAME} | init`);

  // 1. Settings first – safest in init
  registerSettings();

  // 2. Pre-load any handlebars the HUD will need on first render
  await loadTemplates([
    "modules/handy-dandy/templates/handy-dandy-window.hbs"
  ]);
});

// ---------- SETUP -----------------------------------------------------------
Hooks.once("setup", () => {
  // Provide a place other modules/macros can grab the SDK from
  game.handyDandy = { openai: null };
});

// ---------- READY -----------------------------------------------------------
Hooks.once("ready", () => {
  // Only the GM needs an API key to call OpenAI from the browser
  if (!game.user?.isGM) return;

  const key = game.settings.get(CONSTANTS.MODULE_ID, "GPTApiKey") as string;
  if (!key) {
    ui.notifications?.warn(
      game.i18n.localize(`${CONSTANTS.MODULE_ID}.warnings.noKey`)
    );
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

  const handyGroup: SceneControl = {
    name: "handy-dandy",
    title: "Handy Dandy Tools",
    icon: "fas fa-screwdriver-wrench",
    layer: "controls",                // Any existing layer is fine
    visible: true,
    activeTool: "prompt",             // Mandatory in v12 :contentReference[oaicite:0]{index=0}
    tools: <SceneControlTool[]>[
      {
        name: "prompt",
        title: "Prompt Tool",
        icon: "fas fa-magic",
        button: true,
        onClick: () => {
          ui.notifications?.info("Prompt tool clicked");
          // TODO: launch your application window here
        }
      },
      {
        name: "toggle-test",
        title: "Toggle Test",
        icon: "fas fa-bug",
        toggle: true,
        onClick: (active: boolean) =>
          console.debug(`${CONSTANTS.MODULE_NAME} | Toggle ${active ? "ON" : "OFF"}`)
      }
    ]
  };

  controls.push(handyGroup);          // Mutate in-place per docs :contentReference[oaicite:1]{index=1}
});
