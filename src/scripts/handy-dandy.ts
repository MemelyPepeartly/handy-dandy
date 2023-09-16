import { ActorPF2e } from "@actor";
import { MODULENAME } from "./const.ts";
import { logInfo } from "./utils.ts";

declare var Hooks: any;
declare var game: any;

// Initialize module
Hooks.once("init", async (_actor: ActorPF2e) => {
    logInfo("Initializing handy-dandy");

    game.settings.register(MODULENAME, "GPTApiKey", {
        name: "GPT API Key",
        hint: "Insert your GPT API Key here",
        scope: "client",
        config: true,
        type: String,
        default: ""
    });
});

Hooks.on("ready", () => {
    logInfo("ready hook called");

    game.settings.get(MODULENAME, "GPTApiKey");
});