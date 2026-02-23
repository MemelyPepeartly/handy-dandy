import { CONSTANTS } from "../constants";
import { runPromptWorkbenchFlow } from "../flows/prompt-workbench-ui";

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
          id: "map-marker",
          title: "Map Notes",
          icon: "fas fa-location-dot",
          description:
            "Use Placement Mode to drop square-sized markers, then Select Mode to box-select, drag to reposition, delete, and right-click for the mask visibility toggle.",
          location: "Scene Controls -> Map Notes -> Placement Mode / Select Mode",
        },
        {
          id: "prompt-workbench",
          title: "Prompt Workbench",
          icon: "fas fa-hat-wizard",
          description:
            "Feed a single prompt for an action, item, or creature and receive ready-to-import JSON with download options.",
          location: "Scene Controls -> Handy Dandy Tools -> Prompt Workbench",
          buttonAction: "prompt-workbench",
          buttonLabel: "Open Prompt Workbench",
          buttonIcon: "fas fa-hat-wizard",
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
        case "prompt-workbench":
          this.#runPromptWorkbench();
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

  #runPromptWorkbench(): void {
    void runPromptWorkbenchFlow();
  }
}
