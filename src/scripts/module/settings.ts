import CONSTANTS from "./constants";

export default function registerSettings() {
    // Register custom module settings
    game.settings.register(CONSTANTS.MODULEID, "GPTApiKey", {
        name: "GPT API Key",
        hint: "Insert your GPT API Key here",
        scope: "client",
        config: true,
        type: String,
        default: ""
    });

    game.settings.register(CONSTANTS.MODULEID, "GPTOrganization", {
        name: "GPT Organization",
        hint: "Insert your GPT Organization here",
        scope: "client",
        config: true,
        type: String,
        default: ""
    });
}

/**
 * Checks if options exist, if not, orders their initialization
 */
export function checkSettingsInitialized() {
    if (!game.user?.isGM) {
      return;
    }
  }