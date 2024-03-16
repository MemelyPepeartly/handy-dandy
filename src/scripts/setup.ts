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

export function addHandyDandyToolsButton(controls) {
// Define your custom toolset
let customToolset = {
    name: "handy-dandy-tools",
    title: "Handy Dandy Tools", // Or use game.i18n.localize("YourLocalizationKey") for internationalization
    icon: "fas fa-magic",
    tools: [
      {
        name: "open-dialogue",
        title: "Open Dialogue", // Or use game.i18n.localize("YourLocalizationKey") for internationalization
        icon: "fas fa-comments",
        onClick: () => {
          // Define what happens when your tool is clicked. For example:
          new Dialog({
            title: "Custom Dialogue",
            content: "<p>This is a custom dialogue triggered by my tool.</p>",
            buttons: {
              ok: {
                icon: "<i class='fas fa-check'></i>",
                label: "OK",
                callback: () => console.log("OK Clicked")
              }
            },
            default: "ok"
          }).render(true);
        },
        button: true
      },
      // Add more tools as needed
    ],
    visible: true
  };

  // Add your custom toolset to the controls
  controls.push(customToolset);
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