import CONSTANTS from "./constants";

export function registerSettings() {
    // Type assertion to inform TypeScript that `game` is indeed a Game object
    const gameInstance = game as Game;

    gameInstance.settings.register(CONSTANTS.MODULEID, "GPTApiKey", {
        name: "GPT API Key",
        hint: "Insert your GPT API Key here",
        scope: "client",
        config: true,
        type: String,
        default: ""
    });

    gameInstance.settings.register(CONSTANTS.MODULEID, "GPTOrganization", {
        name: "GPT Organization",
        hint: "Insert your GPT Organization here",
        scope: "client",
        config: true,
        type: String,
        default: ""
    });
}
