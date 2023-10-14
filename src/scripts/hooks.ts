import { MODULEID } from "./const.js";
import { registerHandlebarsHelpers, registerHandlebarsPartials, loadHandlebarsTemplates } from "./helpers/handlebar-helper.js";
import { logInfo } from "./utils.js";
import { HandyDandy } from "./handy-dandy.js";

// Initialize module
Hooks.once("init", async (_actor: Actor) => {
    logInfo("Handy Dandy | Initializing handy-dandy settings");

    // Register custom module settings
    (game as Game).settings.register(MODULEID, "GPTApiKey", {
        name: "GPT API Key",
        hint: "Insert your GPT API Key here",
        scope: "client",
        config: true,
        type: String,
        default: ""
    });

    await registerHandlebarsHelpers();
    await registerHandlebarsPartials();
    await loadHandlebarsTemplates();
});

Hooks.on('init', () => {
    logInfo("Handy Dandy | Init hook called");
});

Hooks.on("ready", () => {
    logInfo("Handy Dandy | Ready hook called");

});

Hooks.on("renderActorSheet", async (sheet: ActorSheet<any, any>, $html: JQuery) => {
    logInfo("Handy Dandy | renderActorSheet hook called", sheet, $html);

    logInfo("renderActorSheetHook called", sheet, $html);

    ui.notifications?.info(`Handy Dandy | Opened sheet for ${sheet.actor.name}`);

    // Only add the button to NPCs
    let actor = sheet.object
    if (actor?.type !== "npc") {
        return;
    }

    // Only add the button if the user can update the actor
    if (!actor.canUserModify(game["user"], "update")) {
        return;
    }

    // Add the button
    let element = $html.find(".window-header .window-title");
    let button = $(`<a class="popout" style><i class="fas fa-book"></i>Handy Dandy</a>`);

    // On click
    button.on("click", async () => {
        var thing = new HandyDandy();
        thing.render(true);
    })
    element.after(button);
});
