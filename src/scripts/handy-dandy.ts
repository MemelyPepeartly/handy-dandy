import { MODULENAME } from "./const.js";
import { logInfo, pushNotification } from "./utils.js";

// Initialize module
Hooks.once("init", async (_actor: Actor) => {
    logInfo("Handy Dandy | Initializing handy-dandy settings");

    // Register custom module settings
    (game as Game).settings.register(MODULENAME, "GPTApiKey", {
        name: "GPT API Key",
        hint: "Insert your GPT API Key here",
        scope: "client",
        config: true,
        type: String,
        default: ""
    });
});

Hooks.on('init', () => {
    logInfo("Handy Dandy | Init hook called");
});

Hooks.on("ready", () => {
    logInfo("Handy Dandy | Ready hook called");

    pushNotification("Handy Dandy is ready to go!");
});

Hooks.on("renderActorSheet", (sheet: ActorSheet, $html: JQuery) => {
    logInfo("Handy Dandy | renderActorSheet hook called", sheet, $html);
});
