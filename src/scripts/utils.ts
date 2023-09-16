declare var game: any;

export function logTrace(...args) {
    log(0, ...args);
}

export function logDebug(...args) {
    log(1, ...args);
}

export function logInfo(...args) {
    log(2, ...args);
}

export function logWarn(...args) {
    log(3, ...args);
}

export function logError(...args) {
    log(4, ...args);
}

function log(logLevel = 2, ...args) {
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

export function pushNotification(message: any, type: string = "info") {
    game.socket.emit("module." + "handy-dandy", { operation: "notification", args: [type, message] });
}