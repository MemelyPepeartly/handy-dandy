import { CONSTANTS } from "../constants";
import { DEFAULT_MAP_MARKER_ICON, MAP_MARKER_ICON_OPTIONS, type MapMarkerData, type MapMarkerDefaults } from "./types";
import { generateMapMarkerBoxText } from "./generation";

type MapMarkerDialogAction = "save" | "delete" | "cancel";

export interface MapMarkerDialogResult {
  action: MapMarkerDialogAction;
  marker?: MapMarkerData;
  defaults?: MapMarkerDefaults;
}

function escapeHtml(value: string): string {
  const utils = foundry.utils as { escapeHTML?: (input: string) => string };
  if (typeof utils.escapeHTML === "function") {
    return utils.escapeHTML(value);
  }

  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function buildIconOptions(selected: string): string {
  return MAP_MARKER_ICON_OPTIONS.map((value) => {
    const active = value === selected ? " selected" : "";
    return `<option value="${escapeHtml(value)}"${active}>${escapeHtml(value)}</option>`;
  }).join("");
}

function buildDialogContent(marker: MapMarkerData): string {
  const isMapNote = marker.kind === "map-note";
  const isIconMode = marker.displayMode === "icon";
  const iconOptions = buildIconOptions(marker.iconSymbol || DEFAULT_MAP_MARKER_ICON);

  return `
    <style>
      .handy-dandy-map-marker-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 600px;
      }

      .handy-dandy-map-marker-form .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .handy-dandy-map-marker-grid {
        display: grid;
        gap: 0.6rem;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      }

      .handy-dandy-map-marker-form textarea {
        min-height: 6rem;
        resize: vertical;
      }

      .handy-dandy-map-marker-row {
        align-items: center;
        display: flex;
        gap: 0.5rem;
        justify-content: space-between;
      }

      .handy-dandy-map-marker-row button {
        flex: none;
        white-space: nowrap;
      }

      .handy-dandy-map-marker-form .notes {
        margin: 0;
        font-size: 0.86rem;
        color: var(--color-text-light-6, #bbb);
      }
    </style>
    <form class="handy-dandy-map-marker-form">
      <div class="handy-dandy-map-marker-grid">
        <div class="form-group">
          <label for="handy-dandy-marker-kind">Marker Type</label>
          <select id="handy-dandy-marker-kind" name="kind">
            <option value="specific-room"${isMapNote ? "" : " selected"}>Specific Room</option>
            <option value="map-note"${isMapNote ? " selected" : ""}>Map Note</option>
          </select>
        </div>
        <div class="form-group">
          <label for="handy-dandy-marker-display-mode">Display</label>
          <select id="handy-dandy-marker-display-mode" name="displayMode">
            <option value="number"${isIconMode ? "" : " selected"}>Number</option>
            <option value="icon"${isIconMode ? " selected" : ""}>Icon</option>
          </select>
        </div>
        <div class="form-group" data-display-group="number">
          <label for="handy-dandy-marker-number">Number Label</label>
          <input id="handy-dandy-marker-number" name="numberLabel" type="text" value="${escapeHtml(marker.numberLabel)}" />
        </div>
        <div class="form-group" data-display-group="icon">
          <label for="handy-dandy-marker-icon">Icon</label>
          <select id="handy-dandy-marker-icon" name="iconSymbol">${iconOptions}</select>
        </div>
      </div>

      <label>
        <input type="checkbox" name="hidden"${marker.hidden ? " checked" : ""} />
        Hide from players
      </label>

      <div class="form-group">
        <label for="handy-dandy-marker-prompt">Prompt</label>
        <textarea id="handy-dandy-marker-prompt" name="prompt">${escapeHtml(marker.prompt)}</textarea>
        <p class="notes">Base prompting notes for this room/area. Saved for this marker and remembered for new markers.</p>
      </div>

      <div class="form-group">
        <label for="handy-dandy-marker-theme">Area Specifics and Theme</label>
        <textarea id="handy-dandy-marker-theme" name="areaTheme">${escapeHtml(marker.areaTheme)}</textarea>
        <p class="notes">Regional flavor, room context, hazards, and tone. Saved for this marker and remembered for new markers.</p>
      </div>

      <div class="form-group">
        <div class="handy-dandy-map-marker-row">
          <label for="handy-dandy-marker-boxtext">Boxtext</label>
          <button type="button" data-action="generate-boxtext">Generate Boxtext</button>
        </div>
        <textarea id="handy-dandy-marker-boxtext" name="boxText">${escapeHtml(marker.boxText)}</textarea>
      </div>
    </form>
  `;
}

function setupDialogInteractions(html: JQuery, marker: MapMarkerData): void {
  const root = html[0];
  if (!(root instanceof HTMLElement)) {
    return;
  }

  const form = root.querySelector<HTMLFormElement>(".handy-dandy-map-marker-form");
  if (!form) {
    return;
  }

  const displayField = root.querySelector<HTMLSelectElement>("select[name=\"displayMode\"]");
  const groupedFields = Array.from(root.querySelectorAll<HTMLElement>("[data-display-group]"));
  if (!displayField || !groupedFields.length) {
    return;
  }

  const updateVisibility = (): void => {
    const mode = displayField.value === "icon" ? "icon" : "number";
    for (const field of groupedFields) {
      const shouldShow = field.dataset.displayGroup === mode;
      field.style.display = shouldShow ? "" : "none";
      field.setAttribute("aria-hidden", shouldShow ? "false" : "true");
      const inputs = field.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
      for (const input of inputs) {
        input.disabled = !shouldShow;
      }
    }
  };

  updateVisibility();
  displayField.addEventListener("change", updateVisibility);

  const generateButton = root.querySelector<HTMLButtonElement>("button[data-action=\"generate-boxtext\"]");
  const boxTextField = root.querySelector<HTMLTextAreaElement>("textarea[name=\"boxText\"]");
  if (!generateButton || !boxTextField) {
    return;
  }

  generateButton.addEventListener("click", () => {
    const originalLabel = generateButton.textContent ?? "Generate Boxtext";
    generateButton.disabled = true;
    generateButton.textContent = "Generating...";

    const formData = new FormData(form);
    const parsed = parseMarkerFromFormData(formData, marker);

    void generateMapMarkerBoxText(parsed.marker)
      .then((boxText) => {
        boxTextField.value = boxText;
        ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Generated boxtext.`);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Boxtext generation failed: ${message}`);
      })
      .finally(() => {
        generateButton.disabled = false;
        generateButton.textContent = originalLabel;
      });
  });
}

function parseMarkerFromFormData(
  formData: FormData,
  marker: MapMarkerData,
): { marker: MapMarkerData; defaults: MapMarkerDefaults } {
  const kindRaw = String(formData.get("kind") ?? "");
  const displayModeRaw = String(formData.get("displayMode") ?? "");
  const kind = kindRaw === "map-note" ? "map-note" : "specific-room";
  const displayMode = displayModeRaw === "icon" ? "icon" : "number";

  const prompt = String(formData.get("prompt") ?? "");
  const areaTheme = String(formData.get("areaTheme") ?? "");

  return {
    marker: {
      ...marker,
      kind,
      displayMode,
      numberLabel: String(formData.get("numberLabel") ?? marker.numberLabel).trim() || marker.numberLabel || "1",
      iconSymbol: String(formData.get("iconSymbol") ?? marker.iconSymbol).trim() || DEFAULT_MAP_MARKER_ICON,
      hidden: formData.has("hidden"),
      prompt,
      areaTheme,
      boxText: String(formData.get("boxText") ?? ""),
      updatedAt: Date.now(),
    },
    defaults: {
      prompt,
      areaTheme,
    },
  };
}

function readDialogForm(html: JQuery, marker: MapMarkerData): { marker: MapMarkerData; defaults: MapMarkerDefaults } {
  const root = html[0];
  if (!(root instanceof HTMLElement)) {
    return { marker, defaults: { prompt: marker.prompt, areaTheme: marker.areaTheme } };
  }

  const form = root.querySelector<HTMLFormElement>(".handy-dandy-map-marker-form");
  if (!form) {
    return { marker, defaults: { prompt: marker.prompt, areaTheme: marker.areaTheme } };
  }

  const formData = new FormData(form);
  return parseMarkerFromFormData(formData, marker);
}

export async function promptMapMarkerDialog(marker: MapMarkerData): Promise<MapMarkerDialogResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: MapMarkerDialogResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | Edit Map Marker`,
        content: buildDialogContent(marker),
        buttons: {
          save: {
            label: "Save",
            icon: "<i class=\"fas fa-save\"></i>",
            callback: (html) => {
              const parsed = readDialogForm(html, marker);
              finish({ action: "save", marker: parsed.marker, defaults: parsed.defaults });
            },
          },
          delete: {
            label: "Delete",
            icon: "<i class=\"fas fa-trash\"></i>",
            callback: () => {
              finish({ action: "delete" });
            },
          },
          cancel: {
            label: "Cancel",
            icon: "<i class=\"fas fa-times\"></i>",
            callback: () => {
              finish({ action: "cancel" });
            },
          },
        },
        default: "save",
        close: () => {
          finish({ action: "cancel" });
        },
      },
      {
        width: 720,
      },
    );

    const hookId = Hooks.on("renderDialog", (app: Dialog, html: JQuery) => {
      if (app !== dialog) {
        return;
      }

      Hooks.off("renderDialog", hookId);
      setupDialogInteractions(html, marker);
    });

    dialog.render(true);
  });
}
