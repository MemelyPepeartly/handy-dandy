import { CONSTANTS } from "../constants";
import { updateOpenRouterClientFromSettings } from "../openrouter/client";
import {
  getCachedOpenRouterModelChoiceCatalog,
  loadOpenRouterModelChoiceCatalog,
  refreshOpenRouterModelChoiceCatalog,
  type OpenRouterModelCapabilities,
} from "../openrouter/model-catalog";

interface ModelOptionViewData {
  value: string;
  label: string;
  selected: boolean;
}

interface CapabilitySummaryViewData {
  id: string;
  contextLength: string;
  inputModalities: string;
  outputModalities: string;
  supportedParameters: string;
}

interface OpenRouterModelManagerViewData {
  source: string;
  loadedAt: string;
  textOptions: ModelOptionViewData[];
  imageOptions: ModelOptionViewData[];
  selectedTextModel?: CapabilitySummaryViewData;
  selectedImageModel?: CapabilitySummaryViewData;
}

interface SettingsAccessor {
  get: (namespace: string, key: string) => unknown;
  set: (namespace: string, key: string, value: unknown) => Promise<unknown>;
}

const getSettingsAccessor = (): SettingsAccessor | null => {
  const settings = game.settings;
  if (!settings) {
    return null;
  }

  return settings as unknown as SettingsAccessor;
};

const readSettingString = (key: string): string => {
  const settings = getSettingsAccessor();
  if (!settings) {
    return "";
  }

  try {
    const value = settings.get(CONSTANTS.MODULE_ID, key);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
};

function mapOptionsToView(
  options: Record<string, string>,
  currentValue: string,
): ModelOptionViewData[] {
  return Object.entries(options).map(([value, label]) => ({
    value,
    label,
    selected: value === currentValue,
  }));
}

function toCapabilityViewData(capabilities: OpenRouterModelCapabilities | undefined): CapabilitySummaryViewData | undefined {
  if (!capabilities) {
    return undefined;
  }

  return {
    id: capabilities.id,
    contextLength: typeof capabilities.contextLength === "number"
      ? capabilities.contextLength.toLocaleString()
      : "Unknown",
    inputModalities: capabilities.inputModalities.join(", ") || "Unknown",
    outputModalities: capabilities.outputModalities.join(", ") || "Unknown",
    supportedParameters: capabilities.supportedParameters.join(", ") || "Unknown",
  };
}

function formatLoadedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "Unknown";
  }
  return new Date(timestamp).toLocaleString();
}

export class OpenRouterModelManagerSettings extends FormApplication {
  #isRefreshing = false;

  constructor(options?: Partial<FormApplicationOptions>) {
    super(undefined, options);
  }

  static override get defaultOptions(): FormApplicationOptions {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "handy-dandy-openrouter-model-manager",
      title: "OpenRouter Model Manager",
      template: `${CONSTANTS.TEMPLATE_PATH}/openrouter-model-manager.hbs`,
      width: 820,
      height: "auto",
      closeOnSubmit: false,
      submitOnChange: false,
      classes: ["handy-dandy", "openrouter-model-manager"],
    });
  }

  override async getData(): Promise<OpenRouterModelManagerViewData> {
    const currentTextModel = readSettingString("OpenRouterModel");
    const currentImageModel = readSettingString("OpenRouterImageModel");

    const catalog = getCachedOpenRouterModelChoiceCatalog() ?? await loadOpenRouterModelChoiceCatalog();

    return {
      source: catalog.source === "network" ? "Live OpenRouter catalog" : "Fallback catalog",
      loadedAt: formatLoadedAt(catalog.loadedAt),
      textOptions: mapOptionsToView(catalog.textChoices, currentTextModel),
      imageOptions: mapOptionsToView(catalog.imageChoices, currentImageModel),
      selectedTextModel: toCapabilityViewData(catalog.capabilitiesById[currentTextModel]),
      selectedImageModel: toCapabilityViewData(catalog.capabilitiesById[currentImageModel]),
    };
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find<HTMLButtonElement>("button[data-action='refresh-models']").on("click", (event) => {
      event.preventDefault();
      void this.#refreshModels();
    });
  }

  protected override async _updateObject(_event: Event, formData: Record<string, unknown>): Promise<void> {
    const settings = getSettingsAccessor();
    if (!settings) {
      throw new Error(`${CONSTANTS.MODULE_NAME} | Settings are not available.`);
    }

    const textModel = typeof formData.textModel === "string" ? formData.textModel.trim() : "";
    const imageModel = typeof formData.imageModel === "string" ? formData.imageModel.trim() : "";
    if (!textModel || !imageModel) {
      throw new Error("Text and image model selections are required.");
    }

    await settings.set(CONSTANTS.MODULE_ID, "OpenRouterModel", textModel);
    await settings.set(CONSTANTS.MODULE_ID, "OpenRouterImageModel", imageModel);
    updateOpenRouterClientFromSettings();
    ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | OpenRouter model selections updated.`);
    this.render();
  }

  async #refreshModels(): Promise<void> {
    if (this.#isRefreshing) {
      return;
    }

    this.#isRefreshing = true;
    try {
      await refreshOpenRouterModelChoiceCatalog();
      ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Refreshed OpenRouter model catalog.`);
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Failed to refresh model catalog: ${message}`);
      console.error(`${CONSTANTS.MODULE_NAME} | Failed to refresh model catalog`, error);
    } finally {
      this.#isRefreshing = false;
    }
  }
}
