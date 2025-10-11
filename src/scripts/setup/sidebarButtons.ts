import { CONSTANTS } from "../constants";
import { runBatchGenerationFlow, runExportSelectionFlow } from "../flows/batch-ui";

type ToolCollection = SceneControls.Tool[] | Record<string, SceneControls.Tool>;
export type ControlCollection = SceneControls.Control[] | Record<string, ControlWithToolCollection>;

type ControlWithToolCollection = Omit<SceneControls.Control, "tools"> & {
  tools: ToolCollection;
};

function useArrayTools(): boolean {
  const releaseGeneration = Number(game.release?.generation ?? game.version?.split(".")[0] ?? 0);
  return Number.isFinite(releaseGeneration) && releaseGeneration >= 12;
}

function compatibilityAddControl(collection: ControlCollection, control: ControlWithToolCollection): void {
  if (Array.isArray(collection)) {
    collection.push(control as unknown as SceneControls.Control);
  } else {
    collection[control.name] = control;
  }
}

function compatibilityAddTool(collection: ToolCollection, tool: SceneControls.Tool): void {
  if (Array.isArray(collection)) {
    collection.push(tool);
  } else {
    collection[tool.name] = tool;
  }
}

function requireNamespace(): NonNullable<Game["handyDandy"]> {
  const namespace = game.handyDandy;
  if (!namespace) {
    ui.notifications?.error("Handy Dandy module is not initialized.");
    throw new Error("Handy Dandy module is not initialized.");
  }
  return namespace;
}

export function insertSidebarButtons(controls: ControlCollection): void {
  const tools: ToolCollection = useArrayTools() ? [] : {};

  const handyGroup: ControlWithToolCollection = {
    name: "handy-dandy",
    title: "Handy Dandy Tools",
    icon: "fa-solid fa-screwdriver-wrench",
    layer: "interface",
    visible: true,
    activeTool: "tool-guide",
    tools,
  };

  compatibilityAddTool(handyGroup.tools, {
    name: "tool-guide",
    title: "Tool Guide",
    icon: "fa-solid fa-compass",
    toggle: true,
    active: true,
    onClick: toggled => {
      const handyDandy = requireNamespace();
      const toolOverview = handyDandy.applications.toolOverview;
      if (toggled) {
        toolOverview.render(true);
      } else {
        toolOverview.close();
      }
    },
  });

  compatibilityAddTool(handyGroup.tools, {
    name: "schema-tool",
    title: "Schema Tool",
    icon: "fa-solid fa-wand-magic-sparkles",
    button: true,
    onClick: () => {
      console.debug(`${CONSTANTS.MODULE_NAME} | Opening Schema Tool`);
      requireNamespace().applications.schemaTool.render(true);
    },
  });

  compatibilityAddTool(handyGroup.tools, {
    name: "data-entry-tool",
    title: "Data Entry Tool",
    icon: "fa-solid fa-pen-to-square",
    button: true,
    onClick: () => {
      console.debug(`${CONSTANTS.MODULE_NAME} | Opening Data Entry Tool`);
      requireNamespace().applications.dataEntryTool.render(true);
    },
  });

  compatibilityAddTool(handyGroup.tools, {
    name: "export-selection",
    title: "Export Selection",
    icon: "fa-solid fa-file-export",
    button: true,
    onClick: () => {
      void runExportSelectionFlow();
    },
  });

  compatibilityAddTool(handyGroup.tools, {
    name: "batch-generate",
    title: "Batch Generate & Import",
    icon: "fa-solid fa-diagram-project",
    button: true,
    onClick: () => {
      void runBatchGenerationFlow();
    },
  });

  compatibilityAddTool(handyGroup.tools, {
    name: "developer-console",
    title: "Developer Console",
    icon: "fa-solid fa-terminal",
    button: true,
    onClick: () => {
      requireNamespace().developer.console.render(true);
    },
  });

  compatibilityAddControl(controls, handyGroup);
}
