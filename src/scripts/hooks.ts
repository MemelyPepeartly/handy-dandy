import { MODULENAME } from "./const.js";
import { HandyDandy } from "./handy-dandy.js";
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

    logInfo("renderActorSheetHook called", sheet, $html);

    ui.notifications?.info(`Handy Dandy | Opened sheet for ${sheet.actor.name}`);

    // Only add the button to NPCs
    let actor = sheet.object
    if (actor?.type !== "npc") {
        return;
    }

    // Only add the button if the user can update the actor
    if(!actor.canUserModify(game["user"], "update")) {
        return;
    }

    // Add the button
    let element = $html.find(".window-header .window-title");
    let button = $(`<a class="popout" style><i class="fas fa-book"></i>Handy Dandy</a>`);
    // On click, open the Handy Dandy app
    button.on("click", () => {
        new HandyDandy(actor).render(true)
    })
    element.after(button);
});
