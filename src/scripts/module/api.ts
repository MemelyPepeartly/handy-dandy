import CONSTANTS from "./constants";

const API = {
  get DEFAULT_PROPERTIES(): any {
    return game.settings.get(CONSTANTS.MODULE_NAME, "GPTApiKey");
  }
};

export default API;