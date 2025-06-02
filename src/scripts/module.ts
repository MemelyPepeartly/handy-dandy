import { registerSettings } from "./helpers/settings";
import { OpenAI } from "openai";
import { CONSTANTS } from "./constants";
import { registerHandyDandyControls } from "./module/sidebarButton";

Hooks.once("init", () => {
  console.log(`${CONSTANTS.MODULE_NAME} | init`);
  registerSettings();
  registerHandyDandyControls();
});

Hooks.once("ready", () => {
  const key = game.settings!.get(CONSTANTS.MODULE_ID, "GPTApiKey") as string;
  if (!key) return ui.notifications!.warn("Handy Dandy: Please set your GPT key in module settings.");
  new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
  console.log(`${CONSTANTS.MODULE_NAME} | OpenAI initialized`);
});
