import { CONSTANTS } from "../constants";
import { runPromptWorkbenchFlow, runExportSelectionFlow } from "../flows/prompt-workbench-ui";

interface ToolCardData {
  id: string;
  title: string;
  icon: string;
  description: string;
  location: string;
  buttonAction?: string;
  buttonLabel?: string;
  buttonIcon?: string;
}

interface ToolOverviewData {
  tools: ToolCardData[];
}

export class ToolOverview extends FormApplication {
  constructor(options?: Partial<FormApplicationOptions>) {
    super(undefined, options);
  }

  static override get defaultOptions(): FormApplicationOptions {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "handy-dandy-tool-overview",
      title: "Handy Dandy Tool Guide",
      template: `${CONSTANTS.TEMPLATE_PATH}/tool-overview.hbs`,
      width: 600,
      height: "auto",
      classes: ["handy-dandy", "tool-overview"],
      submitOnChange: false,
      closeOnSubmit: true,
    });
  }

  override async getData(): Promise<ToolOverviewData> {
    return {
      tools: [
        {
          id: "schema-tool",
          title: "Schema Tool",
          icon: "fas fa-magic",
          description: "Inspect the data model of any Foundry document and copy schema paths to the clipboard.",
          location: "Scene Controls → Handy Dandy Tools → Schema Tool",
          buttonAction: "open-schema",
          buttonLabel: "Open Schema Tool",
          buttonIcon: "fas fa-arrow-up-right-from-square",
        },
        {
          id: "data-entry-tool",
          title: "Data Entry Tool",
          icon: "fas fa-edit",
          description: "Reformat Pathfinder 2e / Starfinder 2e rules text into Foundry-ready rich text.",
          location: "Scene Controls → Handy Dandy Tools → Data Entry Tool",
          buttonAction: "open-data-entry",
          buttonLabel: "Open Data Entry Tool",
          buttonIcon: "fas fa-arrow-up-right-from-square",
        },
        {
          id: "trait-browser",
          title: "Trait Browser",
          icon: "fas fa-tags",
          description: "Browse PF2e trait dictionaries directly from the system and copy trait slugs with a click.",
          location: "Scene Controls → Handy Dandy Tools → Trait Browser",
          buttonAction: "open-trait-browser",
          buttonLabel: "Open Trait Browser",
          buttonIcon: "fas fa-arrow-up-right-from-square",
        },
        {
          id: "export-selection",
          title: "Export Selection",
          icon: "fas fa-file-export",
          description: "Export the currently selected actors, items, or journals to JSON for sharing or backups.",
          location: "Scene Controls → Handy Dandy Tools → Export Selection",
          buttonAction: "export-selection",
          buttonLabel: "Start Export",
          buttonIcon: "fas fa-file-export",
        },
        {
          id: "prompt-workbench",
          title: "Prompt Workbench",
          icon: "fas fa-hat-wizard",
          description:
            "Feed a single prompt for an action, item, or creature and receive ready-to-import JSON with download options.",
          location: "Scene Controls → Handy Dandy Tools → Prompt Workbench",
          buttonAction: "prompt-workbench",
          buttonLabel: "Open Prompt Workbench",
          buttonIcon: "fas fa-hat-wizard",
        },
        {
          id: "developer-console",
          title: "Developer Console",
          icon: "fas fa-terminal",
          description: "Access developer helpers for validation, imports, and GPT-driven workflows (GM or developer mode only).",
          location: "Scene Controls → Handy Dandy Tools → Developer Console",
          buttonAction: "open-dev-console",
          buttonLabel: "Open Developer Console",
          buttonIcon: "fas fa-terminal",
        },
      ],
    } satisfies ToolOverviewData;
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    const buttons = html.find<HTMLButtonElement>("button[data-action]");
    buttons.on("click", event => {
      const action = (event.currentTarget as HTMLButtonElement).dataset["action"];
      switch (action) {
        case "open-schema":
          this.#openSchemaTool();
          break;
        case "open-data-entry":
          this.#openDataEntryTool();
          break;
        case "open-trait-browser":
          this.#openTraitBrowserTool();
          break;
        case "export-selection":
          this.#runExportSelection();
          break;
        case "prompt-workbench":
          this.#runPromptWorkbench();
          break;
        case "open-dev-console":
          this.#openDeveloperConsole();
          break;
        default:
          console.warn(`${CONSTANTS.MODULE_NAME} | Unknown tool overview action: ${action}`);
      }
    });
  }

  protected override async _updateObject(
    _event: Event,
    _formData: Record<string, unknown>,
  ): Promise<void> {
    // No form submission behaviour; the dialog is informational only.
  }

  #openSchemaTool(): void {
    if (!game.handyDandy?.applications.schemaTool) {
      ui.notifications?.error("Handy Dandy module is not initialized.");
      return;
    }
    game.handyDandy.applications.schemaTool.render(true);
  }

  #openDataEntryTool(): void {
    if (!game.handyDandy?.applications.dataEntryTool) {
      ui.notifications?.error("Handy Dandy module is not initialized.");
      return;
    }
    game.handyDandy.applications.dataEntryTool.render(true);
  }

  #openTraitBrowserTool(): void {
    if (!game.handyDandy?.applications.traitBrowserTool) {
      ui.notifications?.error("Handy Dandy module is not initialized.");
      return;
    }
    game.handyDandy.applications.traitBrowserTool.render(true);
  }

  #runExportSelection(): void {
    void runExportSelectionFlow();
  }

  #runPromptWorkbench(): void {
    void runPromptWorkbenchFlow();
  }

  #openDeveloperConsole(): void {
    if (!game.handyDandy?.developer.console) {
      ui.notifications?.error("Handy Dandy module is not initialized.");
      return;
    }
    game.handyDandy.developer.console.render(true);
  }
}
