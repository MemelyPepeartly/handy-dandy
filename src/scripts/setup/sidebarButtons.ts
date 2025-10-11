import { CONSTANTS } from "../constants";
import { runPromptWorkbenchFlow, runExportSelectionFlow } from "../flows/prompt-workbench-ui";

type LegacyTool = SceneControls.Tool & {
  onChange?: (...args: unknown[]) => void;
};

type HybridToolArray = LegacyTool[] & Record<string, LegacyTool>;
type ToolCollection = LegacyTool[] | Record<string, LegacyTool>;
type HybridControlArray = SceneControls.Control[] & Record<string, ControlWithToolCollection>;
export type ControlCollection = SceneControls.Control[] | Record<string, ControlWithToolCollection>;

type ControlWithToolCollection = Omit<SceneControls.Control, "tools"> & {
  tools: ToolCollection;
  onChange?: (activeTool: string) => void;
  onToolChange?: (activeTool: string) => void;
};

function useObjectToolCollections(): boolean {
  const releaseGeneration = Number(game.release?.generation ?? 0);
  if (Number.isFinite(releaseGeneration) && releaseGeneration !== 0) {
    return releaseGeneration >= 13;
  }

  const versionMajor = Number(game.version?.split(".")[0] ?? 0);
  if (Number.isFinite(versionMajor) && versionMajor !== 0) {
    return versionMajor >= 13;
  }

  return false;
}

function compatibilityAddControl(collection: ControlCollection, control: ControlWithToolCollection): void {
  if (Array.isArray(collection)) {
    collection.push(control as unknown as SceneControls.Control);
    // Newer Foundry releases expect string lookups on the collection as well as
    // array iteration. Assign the control by name to preserve backwards
    // compatibility with either access pattern.
    (collection as HybridControlArray)[control.name] = control;
  } else {
    collection[control.name] = control;
  }
}

function compatibilityAddTool(collection: ToolCollection, tool: LegacyTool): void {
  if (Array.isArray(collection)) {
    collection.push(tool);
    // Provide property-style access on the array for Foundry versions which
    // look up tools via their string name instead of iterating the array.
    (collection as HybridToolArray)[tool.name] = tool;
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
  const tools: ToolCollection = useObjectToolCollections() ? {} : [];

  const noop = (): void => {
    /* noop for legacy Foundry compatibility */
  };

  const handyGroup: ControlWithToolCollection = {
    name: "handy-dandy",
    title: "Handy Dandy Tools",
    icon: "fa-solid fa-screwdriver-wrench",
    layer: "interface",
    visible: true,
    activeTool: "tool-guide",
    onChange: noop,
    onToolChange: noop,
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
    onChange: toggled => {
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
    onChange: noop,
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
    onChange: noop,
  });

  compatibilityAddTool(handyGroup.tools, {
    name: "export-selection",
    title: "Export Selection",
    icon: "fa-solid fa-file-export",
    button: true,
    onClick: () => {
      void runExportSelectionFlow();
    },
    onChange: noop,
  });

  compatibilityAddTool(handyGroup.tools, {
    name: "prompt-workbench",
    title: "Prompt Workbench",
    icon: "fa-solid fa-hat-wizard",
    button: true,
    onClick: () => {
      void runPromptWorkbenchFlow();
    },
    onChange: noop,
  });

  compatibilityAddTool(handyGroup.tools, {
    name: "developer-console",
    title: "Developer Console",
    icon: "fa-solid fa-terminal",
    button: true,
    onClick: () => {
      requireNamespace().developer.console.render(true);
    },
    onChange: noop,
  });

  compatibilityAddControl(controls, handyGroup);
}
