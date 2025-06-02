import { CONSTANTS } from "../constants";
import { HandyDandyWindow } from "../models/window";

export function addSidebarButton(): void {
  Hooks.on("getSceneControlButtons", (controls: Array<any>) => {
    // Add the new tool to the "token" control group
    const tokenControl = controls.find((c) => c.name === "token");
    if (tokenControl) {
      tokenControl.tools.push({
        name: "handyDandyTools",
        title: "Handy Dandy Tools",
        icon: "fas fa-tools",
        onClick: () => {
          console.log(`${CONSTANTS.MODULE_NAME}: Handy Dandy Tools button clicked`);
          const myWindow = new HandyDandyWindow();
          myWindow.render(true);
        },
        active: false
      });
    }
  });
}