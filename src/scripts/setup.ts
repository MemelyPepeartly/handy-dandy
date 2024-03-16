import { HandyDandySchemaTool } from "./module/handy-dandy-tools";
import { HandyDandyWindow } from "./module/handy-dandy-window";
import { showExportDialog, findInvalidEntries, remigrateCompendium } from "./utils";

export function addExportButtonToCompendiums(html) {
    const exportButton = $(`<button type="button"><i class="fas fa-archive"></i> Export Compendiums</button>`);

    // Add event listener for your button
    exportButton.on("click", () => showExportDialog());

    // Prepend your button to the compendium directory's header or another appropriate place
    html.find('.directory-header').prepend(exportButton);
}

export function addFindInvalidButtonToCompendiumWindows(app, html, data) {
    const findInvalidButton = $(`<button style="margin-bottom:10px" type="button"><i class="fas fa-search"></i> Find Invalid</button>`);

    // Add event listener for your button
    findInvalidButton.on("click", async () => await findInvalidEntries(app));

    // Prepend your button to the compendium directory's header or another appropriate place
    html.find('.directory-header').prepend(findInvalidButton);

}

export function addHandyDandyToolsButton(controls: SceneControl[]) {
    // Define the custom button with its tools/options
    let customButton = {
        name: "handy-dandy-tools",
        title: "Handy Dandy Tools",
        icon: "fas fa-magic",
        layer: "controls", // Using a generic 'controls' layer for UI purposes
        visible: true,
        activeTool: "schema-tool", // Default active tool
        tools: [
            {
                name: "schema-tool",
                title: "Schema Tool",
                icon: "fas fa-spell-check",
                onClick: () => {
                    const tool = new HandyDandySchemaTool();
                    tool.render(true);
                }
            }
        ]
    };

    // Push the custom button into the scene controls array
    controls.push(customButton);
}

export function addHandyDandyButton(app, html, data) {
    // Find the header of the actor sheet
    const header = html.find('.window-header');

    // Check if the button is already there to avoid duplicates
    if (!header.find('.handy-dandy-button').length) {
        const handyDandyButton = $('<a class="handy-dandy-button"><i class="fas fa-microchip"></i>Handy Dandy</a>');

        // Attach an event listener to the button
        handyDandyButton.on("click", event => {
            event.preventDefault();
            const handyDandyApp = new HandyDandyWindow();
            handyDandyApp.render(true);
        });
        

        // Find the <h4> element and insert the button after it
        const titleElement = header.find('h4.window-title');
        handyDandyButton.insertAfter(titleElement);
    }
}

export function addRemigrateButtonToCompendiumWindows(app, html, data) {
    const remigrateButton = $(`<button style="margin-bottom:10px" type="button"><i class="fas fa-database"></i> Remigrate</button>`);

    // Add event listener for your button
    remigrateButton.on("click", async () => await remigrateCompendium(data));

    // Prepend your button to the compendium directory's header or another appropriate place
    html.find('.directory-header').prepend(remigrateButton);
}