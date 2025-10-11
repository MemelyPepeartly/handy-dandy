import { CONSTANTS } from "../constants";
import { runBatchGenerationFlow, runExportSelectionFlow } from "../flows/batch-ui";
import { SchemaTool } from "../tools/schema-tool";

export function insertSidebarButtons(controls: SceneControl[]): void {
  const handyGroup: SceneControl = {
    name: "handy-dandy",
    title: "Handy Dandy Tools",
    icon: "fas fa-screwdriver-wrench",
    layer: "controls", // Any existing layer is fine
    visible: true,
    activeTool: "schema-tool", // Mandatory in v12 :contentReference[oaicite:0]{index=0}
    tools: <SceneControlTool[]>[
      {
        name: "tool-guide",
        title: "Tool Guide",
        icon: "fas fa-compass",
        button: true,
        onClick: () => {
          if (!game.handyDandy) {
            ui.notifications?.error("Handy Dandy module is not initialized.");
            return;
          }
          game.handyDandy.applications.toolOverview.render(true);
        }
      },
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
          game.handyDandy.applications.schemaTool.render(true);
        }
      },
      {
        name: "data-entry-tool",
        title: "Data Entry Tool",
        icon: "fas fa-edit",
        button: true,
        onClick: () => {
          console.debug(`${CONSTANTS.MODULE_NAME} | Opening Data Entry Tool`);
          if (!game.handyDandy) {
            ui.notifications?.error("Handy Dandy module is not initialized.");
            return;
          }
          game.handyDandy.applications.dataEntryTool.render(true);
        }
      },
      {
        name: "export-selection",
        title: "Export Selection",
        icon: "fas fa-file-export",
        button: true,
        onClick: () => {
          void runExportSelectionFlow();
        }
      },
      {
        name: "batch-generate",
        title: "Batch Generate & Import",
        icon: "fas fa-diagram-project",
        button: true,
        onClick: () => {
          void runBatchGenerationFlow();
        }
      },
      {
        name: "developer-console",
        title: "Developer Console",
        icon: "fas fa-terminal",
        button: true,
        onClick: () => {
          if (!game.handyDandy) {
            ui.notifications?.error("Handy Dandy module is not initialized.");
            return;
          }
          game.handyDandy.developer.console.render(true);
        }
      }
    ]
  };

  controls.push(handyGroup); // Mutate in-place per docs :contentReference[oaicite:1]{index=1}
}
