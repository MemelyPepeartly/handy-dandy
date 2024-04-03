import CONSTANTS from "./module/constants";
import { HandyDandyAi } from "./module/handy-dandy-ai";
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

export async function findInvalidEntries(app) {
    // Assuming 'app' is the Compendium instance
    const pack = app.collection;

    if (!pack) {
        console.error("Compendium pack not found.");
        return;
    }

    await pack.getIndex(); // Ensure the index is loaded
    const invalidEntries: string[] = []; // Explicitly type the array as string[]

    for (const entry of pack.index) {
        try {
            // Attempt to get each document. This is a basic check to see if it can be loaded.
            await pack.getDocument(entry._id);
        } catch (e) {
            // If an error occurs while fetching the document, consider it "invalid" for this example
            invalidEntries.push(entry._id); // TypeScript now understands that entry._id is a string
            console.log(`Invalid or corrupted entry found: ${entry.name} (${entry._id})`);
        }
    }

    if (invalidEntries.length === 0) {
        console.log("No invalid entries found.");
    } else {
        console.log(`Found invalid entries: ${invalidEntries.join(', ')}`);
    }
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

export async function exportCompendiums(compendiums) {
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
        
            // Sanitize the entry name to remove or replace invalid characters
            // Here, we replace invalid characters with an underscore, but you can choose a different replacement
            const sanitizedEntryName = entry.name?.replace(/[:*?"<>|\\\/]/g, '_');
        
            let typeFolder = packFolder?.folder(typeFolderName);
            typeFolder?.file(`${sanitizedEntryName}.json`, content);
        }
    }

    // Generate the ZIP file and trigger the download
    zip.generateAsync({ type: "blob" })
       .then(function(content) {
            saveAs(content, "compendiums.zip");
        });
}

export function getSchemas() {
    var game = getGame();


    const systemSchema = game.system.data?.schema;
    const worldSchema = game.world.data?.schema;
    const actorSchema = game.items?.documentClass.schema as unknown as DocumentSchema;

    console.log("System schema: ", systemSchema.fields);
    console.log("World schema: ", worldSchema.fields);
    console.log("Actor schema: ", actorSchema.fields);
}