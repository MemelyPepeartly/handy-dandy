import CONSTANTS from "./module/constants";

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