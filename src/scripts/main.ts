import { registerSettings } from "./module/settings";
import { addHandyDandyToolsButton, 
    addExportButtonToCompendiums, 
    addRemigrateButtonToCompendiumWindows, 
    addFindInvalidButtonToCompendiumWindows, 
    addHandyDandyButton } from "./setup";


// When initializing the module
Hooks.once('init', () => {
    console.log("Handy Dandy | Initializing...");

    registerSettings();
});

Hooks.on("getSceneControlButtons", (controls: SceneControl[]) => {
    addHandyDandyToolsButton(controls);
});

// When rendering the compendium directory
Hooks.on("renderCompendiumDirectory", (app, html, data) => {
    addExportButtonToCompendiums(html);
});

// When rendering compendium window
Hooks.on("renderCompendium", async (app, html, data) => {
    await addRemigrateButtonToCompendiumWindows(app, html, data);
    await addFindInvalidButtonToCompendiumWindows(app, html, data);
});

// When rendering an actor sheet
Hooks.on('renderActorSheet', (app, html, data) => {
    addHandyDandyButton(app, html, data);
});
  