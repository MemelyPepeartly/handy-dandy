// handy-dandy-controls.ts
import { CONSTANTS } from "../constants";
import { getCurrentUser } from "../helpers/common";
import { HandyDandyWindow } from "../models/window";

export function registerHandyDandyControls(): void {
  Hooks.on("getSceneControlButtons", (controls) => {
    // Only GMs see this menu
    if (!getCurrentUser()?.isGM) return;

    controls.push({
      name:  "handydandy",
      title: "Handy Dandy",
      icon:  "fas fa-screwdriver-wrench",
      layer: "TokenLayer",               // valid layer name
      visible: true,                     // show on first render
      activeTool: "open-window",         // default selection
      tools: [
        {
          name:   "open-window",
          title:  "Open Window",
          icon:   "fas fa-window-maximize",
          button: true,                  // one-shot tool
          onClick: () => new HandyDandyWindow().render(true)
        },
        {
          name:   "option-two",
          title:  "Option Two",
          icon:   "fas fa-cogs",
          toggle: true,                  // on/off tool
          onClick: (active: boolean) =>
            console.log(`${CONSTANTS.MODULE_NAME}: Option Two ${active ? "ON" : "OFF"}`)
        }
      ]
    });
  });
}
