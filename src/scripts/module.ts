import { registerSettings } from "./helpers/settings";
import { OpenAI } from "openai";
import { CONSTANTS } from "./constants";

// Initialise OpenAI once the user is authenticated.
Hooks.once("init", () => {
  registerSettings();
  console.log(`${CONSTANTS.MODULE_NAME} | init`);
});

Hooks.once("ready", () => {
  const key = game.settings!.get(CONSTANTS.MODULE_ID, "GPTApiKey") as string;
  if (!key) return ui.notifications!.warn("Handy Dandy: Please set your GPT key in module settings.");

  const openai = new OpenAI({ apiKey: key });
});
