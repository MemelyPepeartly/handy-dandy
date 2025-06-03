import { CONSTANTS } from "../constants";
import { SchemaTool } from "../tools/schema-tool";

export function insertSidebarButtons(controls: SceneControl[]) {
    const handyGroup: SceneControl = {
    name: "handy-dandy",
    title: "Handy Dandy Tools",
    icon: "fas fa-screwdriver-wrench",
    layer: "controls",                // Any existing layer is fine
    visible: true,
    activeTool: "schema-tool",             // Mandatory in v12 :contentReference[oaicite:0]{index=0}
    tools: <SceneControlTool[]>[
      {
        name: "schema-tool",
        title: "Schema Tool",
        icon: "fas fa-magic",
        button: true,
        onClick: () => {
          console.debug(`${CONSTANTS.MODULE_NAME} | Opening Schema Tool`);
          if (!game.handyDandy) {
            ui.notifications?.error("Handy Dandy module is not initialized.");
            return;
          }
          if (!game.handyDandy.applications?.schemaTool) {
            game.handyDandy.applications = {
              schemaTool: new SchemaTool()
            };
          }
          game.handyDandy.applications.schemaTool.render(true);
        }
      },
      {
        name: "toggle-test",
        title: "Toggle Test",
        icon: "fas fa-bug",
        toggle: true,
        onClick: (active: boolean) =>
          console.debug(`${CONSTANTS.MODULE_NAME} | Toggle ${active ? "ON" : "OFF"}`)
      }
    ]
  };
  controls.push(handyGroup);          // Mutate in-place per docs :contentReference[oaicite:1]{index=1}
}