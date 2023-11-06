import { MODULEID } from "./const";
import { registerHandlebarsHelpers, registerHandlebarsPartials, loadHandlebarsTemplates } from "./helpers/handlebar-helper";
import { logInfo, getGame } from "./utils";


// Initialize module
Hooks.once("init", async (_actor: Actor) => {
    logInfo("Handy Dandy | Initializing handy-dandy settings");

    // Register custom module settings
    getGame().settings.register(MODULEID, "GPTApiKey", {
        name: "GPT API Key",
        hint: "Insert your GPT API Key here",
        scope: "client",
        config: true,
        type: String,
        default: ""
    });

    getGame().settings.register(MODULEID, "GPTOrganization", {
        name: "GPT Organization",
        hint: "Insert your GPT Organization here",
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
    
    const apiKey = getGame().settings.get(MODULEID, "GPTApiKey") as string;
    const organization = getGame().settings.get(MODULEID, "GPTOrganization") as string;
    console.log("API Key:", apiKey);
    console.log("Organization:", organization);

    // const module = new HandyDandy({});
    // module.engine.apiKey = apiKey;
    // module.engine.organization = organization;
});

Hooks.on("renderActorSheet", async (sheet: ActorSheet<any, any>, $html: JQuery) => {
    logInfo("Handy Dandy | renderActorSheet hook called", sheet, $html);

    // Only add the button to NPCs
    let actor = sheet.object
    if (actor?.type !== "npc") {
        return;
    }

    // Only add the button if the user can update the actor
    // if (!actor.canUserModify(getGame().user as BaseUser, "update")) {
    //     return;
    // }

    // Add the button
    let element = $html.find(".window-header .window-title");
    let button = $(`<a class="popout" style><i class="fas fa-book"></i>Handy Dandy</a>`);
    element.after(button);

    // On click
    button.on("click", async () => {
        //module.render(true);
    });
});