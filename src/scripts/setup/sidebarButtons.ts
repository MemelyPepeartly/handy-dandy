import { runPromptWorkbenchFlow } from "../flows/prompt-workbench-ui";
import { runRuleElementGeneratorFlow } from "../flows/rule-element-generator-ui";
import {
  MAP_MARKER_CONTROL_NAME,
  MAP_MARKER_PLACEMENT_TOOL_NAME,
  MAP_MARKER_SELECT_TOOL_NAME,
  setMapMarkerMode,
} from "../map-markers/controller";
import { MAP_MARKER_LAYER_NAME } from "../map-markers/layer";

type LegacyTool = SceneControls.Tool & {
  onChange?: (...args: unknown[]) => void;
};

type HybridToolArray = LegacyTool[] & Record<string, LegacyTool>;
type ToolCollection = LegacyTool[] | Record<string, LegacyTool>;
type HybridControlArray = SceneControls.Control[] & Record<string, ControlWithToolCollection>;
export type ControlCollection = SceneControls.Control[] | Record<string, ControlWithToolCollection>;

type ControlWithToolCollection = Omit<SceneControls.Control, "tools"> & {
  tools: ToolCollection;
  onChange?: (...args: unknown[]) => void;
  onToolChange?: (...args: unknown[]) => void;
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

function resolveToggleActive(args: unknown[], fallback = false, toolName?: string): boolean {
  const second = args[1];
  if (typeof second === "boolean") {
    return second;
  }

  const first = args[0];
  if (typeof first === "boolean") {
    return first;
  }

  if (toolName) {
    const tools = ui.controls?.control?.tools;
    if (Array.isArray(tools)) {
      const match = tools.find((candidate) => candidate?.name === toolName);
      if (typeof match?.active === "boolean") {
        return match.active;
      }
    } else if (tools && typeof tools === "object") {
      const record = tools as Record<string, SceneControls.Tool | undefined>;
      const match = record[toolName];
      if (typeof match?.active === "boolean") {
        return match.active;
      }
    }
  }

  return fallback;
}

function requireNamespace(): NonNullable<Game["handyDandy"]> {
  const namespace = game.handyDandy;
  if (!namespace) {
    ui.notifications?.error("Handy Dandy module is not initialized.");
    throw new Error("Handy Dandy module is not initialized.");
  }
  return namespace;
}

function resolveMapMarkerMode(activeTool: string): "placement" | "select" {
  if (activeTool === MAP_MARKER_SELECT_TOOL_NAME) {
    return "select";
  }

  return "placement";
}

function resolveToolName(candidate: unknown): string | null {
  if (typeof candidate === "string" && candidate.length > 0) {
    return candidate;
  }

  if (candidate && typeof candidate === "object") {
    const name = (candidate as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) {
      return name;
    }
  }

  return null;
}

function resolveActiveMapMarkerTool(): string {
  const controls = ui.controls as {
    tool?: unknown;
    control?: { activeTool?: unknown };
  } | null | undefined;

  const activeTool = controls?.tool;
  const activeToolName = resolveToolName(activeTool);
  if (activeToolName) {
    return activeToolName;
  }

  const controlTool = controls?.control?.activeTool;
  const controlToolName = resolveToolName(controlTool);
  if (controlToolName) {
    return controlToolName;
  }

  return MAP_MARKER_PLACEMENT_TOOL_NAME;
}

export function insertSidebarButtons(controls: ControlCollection): void {
  const tools: ToolCollection = useObjectToolCollections() ? {} : [];
  const mapNoteTools: ToolCollection = useObjectToolCollections() ? {} : [];

  const noop = (): void => {
    /* noop for legacy Foundry compatibility */
  };
  const syncMapMarkerMode = (activeTool: unknown): void => {
    const toolName = resolveToolName(activeTool) ?? resolveActiveMapMarkerTool();
    setMapMarkerMode(resolveMapMarkerMode(toolName));
  };

  const mapNotesGroup: ControlWithToolCollection = {
    name: MAP_MARKER_CONTROL_NAME,
    title: "Map Notes",
    icon: "fa-solid fa-map-location-dot",
    layer: MAP_MARKER_LAYER_NAME,
    visible: true,
    activeTool: MAP_MARKER_PLACEMENT_TOOL_NAME,
    onChange: (_event, active) => {
      if (!active) {
        setMapMarkerMode("off");
        return;
      }

      syncMapMarkerMode(resolveActiveMapMarkerTool());
    },
    onToolChange: (_event, tool) => {
      syncMapMarkerMode(tool);
    },
    tools: mapNoteTools,
  };

  compatibilityAddTool(mapNotesGroup.tools, {
    name: MAP_MARKER_PLACEMENT_TOOL_NAME,
    title: "Placement Mode",
    icon: "fa-solid fa-location-dot",
    onChange: () => {
      setMapMarkerMode("placement");
    },
  });

  compatibilityAddTool(mapNotesGroup.tools, {
    name: MAP_MARKER_SELECT_TOOL_NAME,
    title: "Select Mode",
    icon: "fa-solid fa-object-group",
    onChange: () => {
      setMapMarkerMode("select");
    },
  });

  compatibilityAddControl(controls, mapNotesGroup);

  const handyGroup: ControlWithToolCollection = {
    name: "handy-dandy",
    title: "Handy Dandy Tools",
    icon: "fa-solid fa-screwdriver-wrench",
    layer: "interface",
    visible: true,
    activeTool: "",
    onChange: noop,
    onToolChange: noop,
    tools,
  };

  compatibilityAddTool(handyGroup.tools, {
    name: "tool-guide",
    title: "Tool Guide",
    icon: "fa-solid fa-compass",
    toggle: true,
    onChange: (...args) => {
      const toggled = resolveToggleActive(args, false, "tool-guide");
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
    name: "prompt-workbench",
    title: "Prompt Workbench",
    icon: "fa-solid fa-hat-wizard",
    button: true,
    onChange: () => {
      void runPromptWorkbenchFlow();
    },
  });

  compatibilityAddTool(handyGroup.tools, {
    name: "rule-element-generator",
    title: "Rule Element Generator",
    icon: "fa-solid fa-gears",
    button: true,
    onChange: () => {
      void runRuleElementGeneratorFlow();
    },
  });

  compatibilityAddControl(controls, handyGroup);
}
