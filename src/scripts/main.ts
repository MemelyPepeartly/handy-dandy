import { registerSettings } from "./module/settings";
import { addHandyDandyButton } from "./utils";

Hooks.once('init', () => {
    console.log("Handy Dandy | Initializing...");

    registerSettings();
});

Hooks.on('renderActorSheet', (app, html, data) => {
    addHandyDandyButton(app, html, data);
});

