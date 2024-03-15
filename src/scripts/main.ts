import { registerSettings } from "./module/settings";
import { addExportButtonToCompendiums, addHandyDandyButton } from "./utils";

Hooks.once('init', () => {
    console.log("Handy Dandy | Initializing...");

    registerSettings();
});

Hooks.on("renderCompendiumDirectory", (app, html, data) => {
    addExportButtonToCompendiums(html);
});


Hooks.on('renderActorSheet', (app, html, data) => {
    addHandyDandyButton(app, html, data);
});
