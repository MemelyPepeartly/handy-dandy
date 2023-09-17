import { MODULENAME } from "./const.js";
import { logInfo } from "./utils.js";

// Initialize module
Hooks.once("init", async (_actor: Actor) => {
    logInfo("Handy Dandy | Initializing handy-dandy");

    (game as Game).settings.register(MODULENAME, "GPTApiKey", {
        name: "GPT API Key",
        hint: "Insert your GPT API Key here",
        scope: "client",
        config: true,
        type: String,
        default: ""
    });
});

Hooks.on("ready", () => {
    logInfo("Handy Dandy | Ready hook called");
});