import { CONSTANTS } from "../constants";

export function insertSidebarButtons(controls: SceneControl[]) {
    const handyGroup: SceneControl = {
    name: "handy-dandy",
    title: "Handy Dandy Tools",
    icon: "fas fa-screwdriver-wrench",
    layer: "controls",                // Any existing layer is fine
    visible: true,
    activeTool: "prompt",             // Mandatory in v12 :contentReference[oaicite:0]{index=0}
    tools: <SceneControlTool[]>[
      {
        name: "prompt",
        title: "Prompt Tool",
        icon: "fas fa-magic",
        button: true,
        onClick: () => {
          ui.notifications?.info("Prompt tool clicked");
          // TODO: launch your application window here
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