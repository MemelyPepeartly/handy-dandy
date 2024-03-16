import CONSTANTS from "./module/constants";
import { HandyDandyWindow } from "./module/handy-dandy-window";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export function logTrace(...args: any[]) {
    log(0, ...args);
}

export function logDebug(...args: any[]) {
    log(1, ...args);
}

export function logInfo(...args: (string | JQuery<HTMLElement> | ActorSheet<any, any>)[]) {
    log(2, ...args);
}

export function logWarn(...args: any[]) {
    log(3, ...args);
}

export function logError(...args: any[]) {
    log(4, ...args);
}

/**
 * Creates a log message with a provided log level that determines the color of the log message.
 * @param logLevel default is 2 (info)
 * @param args extra arguments to pass to the console
 */
function log(logLevel = 2, ...args: any[]) {
    let number = 2;
    // if (phase >= Phase.READY) {
    //     number = Number(game.settings.get(MODULENAME, "logLevel")) ?? 2;
    // }

    if (logLevel >= number) {
        switch (logLevel) {
            case 0:
                console.trace(...args);
                break;
            case 1:
                console.debug(...args);
                break;
            case 2:
                console.info(...args);
                break;
            case 3:
                console.warn(...args);
                break;
            case 4:
                console.error(...args);
                break;
            case 5:
                break;
        }
    }
}

export function pushNotification(message: any, type: "info" | "error" | "warning" = "info") {
    ui.notifications?.notify(`${CONSTANTS.MODULEID} | ${message}`, type);
}

export function getGame(): Game {
    if(!(game instanceof Game)) {
      throw new Error('game is not initialized yet!');
    }
    return game;
  }

export async function createDialogue(dialogTmp: string, title: string = "Handy Dandy") {
    const dialog = new Dialog({
        title: title,
        content: dialogTmp,
        buttons: {
            ok: {
                label: "OK",
                callback: () => {
                    logInfo("Handy Dandy | OK button clicked");
                }
            }
        },
        default: "cancel",
        close: () => {
            logInfo("Handy Dandy | Dialog window closed");
        }
    }, 
    {
        id: "handy-dandy"
    });

    await dialog.render(true);
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
    remigrateButton.on("click", () => remigrateCompendium(data));

    // Prepend your button to the compendium directory's header or another appropriate place
    html.find('.directory-header').prepend(remigrateButton);
}

export async function remigrateCompendium(data) {
    var game = getGame();

    console.log("Remigrating compendium...", data);

    // Migrate the pack associated with the open window
    const pack = game.packs.get(data.collection.metadata.id);

    logInfo("Handy Dandy | Migrating compendium: ");
    console.log(pack);

    if (pack) {
        await pack.migrate();
    }
}


export function addExportButtonToCompendiums(html) {
    const exportButton = $(`<button type="button"><i class="fas fa-archive"></i> Export Compendiums</button>`);

    // Add event listener for your button
    exportButton.on("click", () => showExportDialog());

    // Prepend your button to the compendium directory's header or another appropriate place
    html.find('.directory-header').prepend(exportButton);
}

export function showExportDialog() {
    var game = getGame();

    let checkboxes = '';

    game.packs.forEach(p => {
        // Creating a checkbox for each compendium
        checkboxes += `<input type="checkbox" name="compendium-select" value="${p.collection}">${p.title}<br>`;
    });

    let content = `
        <form>
            <div class="form-group" style="height: 300px; overflow-y: auto;">
                <label>Select Compendiums:</label>
                <div>${checkboxes}</div>
            </div>
        </form>
    `;

    new Dialog({
        title: "Export Compendiums",
        content: content,
        buttons: {
            export: {
                icon: '<i class="fas fa-archive"></i>',
                label: "Export",
                callback: (html) => {
                    const selectedCompendiums: string[] = [];

                    $(html).find('input[name="compendium-select"]:checked').each(function() {
                        // Ensure the value is defined and is a string before pushing it into the array
                        const value = $(this).val();

                        // Checks if value is string
                        if (typeof value === "string") { 
                            selectedCompendiums.push(value);
                        }
                    });
                    exportCompendiums(selectedCompendiums);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: "Cancel"
            }
        },
        default: "export",
        render: html => console.log("Rendering export dialog"),
        close: () => console.log("Closed export dialog")
    }).render(true);
}

async function exportCompendiums(compendiums) {
    var game = getGame();
    const zip = new JSZip();

    for (const compendiumName of compendiums) {
        const pack = game.packs.get(compendiumName);
        if (!pack) {
            console.warn(`Compendium ${compendiumName} not found.`);
            continue;
        }

        await pack.getIndex(); // Ensure the index is loaded
        const packFolder = zip.folder(pack.metadata.label);

        for (const entry of pack.index) {
            const entity = await pack.getDocument(entry._id);
            // Use type assertion to treat the entity's data as any
            const entityData: any = entity?.toObject(false);
            const content = JSON.stringify(entityData, null, 2);
        
            // Now you can safely access the type property without TypeScript errors
            const typeFolderName = entityData.type || "unknown";
        
            let typeFolder = packFolder?.folder(typeFolderName);
            typeFolder?.file(`${entry.name}.json`, content);
        }
        
    }

    // Generate the ZIP file and trigger the download
    zip.generateAsync({ type: "blob" })
       .then(function(content) {
            saveAs(content, "compendiums.zip");
        });
}