import { registerSettings } from "./module/settings";
import { addExportButtonToCompendiums, addHandyDandyButton, addRemigrateButtonToCompendiumWindows } from "./utils";

// When initializing the module
Hooks.once('init', () => {
    console.log("Handy Dandy | Initializing...");

    registerSettings();
});

// When rendering the compendium directory
Hooks.on("renderCompendiumDirectory", (app, html, data) => {
    addExportButtonToCompendiums(html);
});

// When rendering compendium window
Hooks.on("renderCompendium", async (app, html, data) => {
    await addRemigrateButtonToCompendiumWindows(app, html, data);
});

// When rendering an actor sheet
Hooks.on('renderActorSheet', (app, html, data) => {
    addHandyDandyButton(app, html, data);
});
