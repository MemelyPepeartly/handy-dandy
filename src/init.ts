/**
 * This is your TypeScript entry file for Foundry VTT.
 * Register custom settings, sheets, and constants using the Foundry API.
 * Change this heading to be more descriptive to your module, or remove it.
 * Author: [your name]
 * Content License: [copyright and-or license] If using an existing system
 * 					you may want to put a (link to a) license or copyright
 * 					notice here (e.g. the OGL).
 * Software License: [your license] Put your desired license here, which
 * 					 determines how others may use and modify your module
 */
// Import JavaScript modules

// Import TypeScript modules
import API from "./scripts/module/api";
import CONSTANTS from "./scripts/module/constants";
import HandyDandyApplication from "./scripts/module/handy-dandy";
import { preloadPartials } from "./scripts/module/preload-templates";
import registerSettings, { checkSettingsInitialized } from "./scripts/module/settings";
import { createDialogue, logInfo } from "./scripts/utils";
import './scripts/helpers/form-handler';

/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */

Hooks.once("init", () => {
  registerSettings();

  preloadPartials();

//   Hooks.callAll(`${CONSTANTS.MODULE_NAME}:afterInit`);
});

/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */

Hooks.once("setup", () => {
  //@ts-ignore
  // window.ForienIdentification = Identification;

  Hooks.callAll(`${CONSTANTS.MODULE_NAME}:afterSetup`);

  setApi(API);
});

/* ------------------------------------ */
/* When ready							*/
/* ------------------------------------ */

Hooks.once("ready", () => {
  checkSettingsInitialized();

  Hooks.callAll(`${CONSTANTS.MODULE_NAME}:afterReady`);
});

Hooks.on("renderActorSheet", async (sheet: ActorSheet<any, any>, $html: JQuery) => {
    logInfo("Handy Dandy | renderActorSheet hook called", sheet, $html);

    // Only add the button to NPCs
    let actor = sheet.object
    if (actor?.type !== "npc") {
        return;
    }

    // Only add the button if the user can update the actor
    // if (!actor.canUserModify(getGame().user as BaseUser, "update")) {
    //     return;
    // }

    // Add the button
    let element = $html.find(".window-header .window-title");
    let button = $(`<a class="popout" style><i class="fas fa-book"></i>Handy Dandy</a>`);
    element.after(button);
    
    const handyDandyApplication = new HandyDandyApplication();

    // On click
    button.on("click", async () => {
      handyDandyApplication.render(true);
    });
});

// Add any additional hooks if necessary

export interface HandyDandyModuleData {
  api: typeof API;
  socket: any;
}

/**
 * Initialization helper, to set API.
 * @param api to set to game module.
 */
export function setApi(api: typeof API): void {
  const data = game.modules.get(CONSTANTS.MODULE_NAME) as unknown as HandyDandyModuleData;
  data.api = api;
}

/**
 * Returns the set API.
 * @returns Api from games module.
 */
export function getApi(): typeof API {
  const data = game.modules.get(CONSTANTS.MODULE_NAME) as unknown as HandyDandyModuleData;
  return data.api;
}

/**
 * Initialization helper, to set Socket.
 * @param socket to set to game module.
 */
export function setSocket(socket: any): void {
  const data = game.modules.get(CONSTANTS.MODULE_NAME) as unknown as HandyDandyModuleData;
  data.socket = socket;
}

/*
 * Returns the set socket.
 * @returns Socket from games module.
 */
export function getSocket() {
  const data = game.modules.get(CONSTANTS.MODULE_NAME) as unknown as HandyDandyModuleData;
  return data.socket;
}
