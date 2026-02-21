import { CONSTANTS } from "../constants";
import {
  DEFAULT_MAP_MARKER_BOXTEXT_LENGTH,
  DEFAULT_MAP_MARKER_ICON,
  DEFAULT_MAP_MARKER_TONE,
  MAP_MARKER_ICON_OPTIONS,
  type MapMarkerBoxTextLength,
  type MapMarkerData,
  type MapMarkerDefaults,
  type MapMarkerTone,
} from "./types";
import { generateMapMarkerBoxText } from "./generation";

type MapMarkerDialogAction = "save" | "delete" | "cancel";

export interface MapMarkerDialogResult {
  action: MapMarkerDialogAction;
  marker?: MapMarkerData;
  defaults?: MapMarkerDefaults;
}

const TONE_OPTIONS: ReadonlyArray<{ value: MapMarkerTone; label: string }> = [
  { value: "neutral", label: "Neutral" },
  { value: "mysterious", label: "Mysterious" },
  { value: "ominous", label: "Ominous" },
  { value: "wondrous", label: "Wondrous" },
  { value: "grim", label: "Grim" },
  { value: "lively", label: "Lively" },
];

const BOXTEXT_LENGTH_OPTIONS: ReadonlyArray<{ value: MapMarkerBoxTextLength; label: string }> = [
  { value: "short", label: "Short (2-3)" },
  { value: "medium", label: "Medium (3-5)" },
  { value: "long", label: "Long (5-7)" },
];

const PREP_TEMPLATE_VALUES = {
  prompt: "Introduce the room's core purpose and immediate player focus.",
  areaTheme: "Architecture, era, atmosphere, and the emotional tone of this space.",
  sensoryDetails: "Light, smell, temperature, ambient sounds, and first visual impression.",
  notableFeatures: "Landmarks, interactables, unusual details, and points of curiosity.",
  occupants: "Creatures/NPCs present, current activity, or signs of recent activity.",
  hazards: "Environmental danger, tension, instability, or signs of imminent risk.",
  gmNotes: "Hidden context, encounter intent, pacing notes, and secret reveals.",
} as const;

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

function buildSelectOptions<TValue extends string>(
  options: ReadonlyArray<{ value: TValue; label: string }>,
  selected: string,
): string {
  return options
    .map((option) => {
      const active = option.value === selected ? " selected" : "";
      return `<option value="${escapeHtml(option.value)}"${active}>${escapeHtml(option.label)}</option>`;
    })
    .join("");
}

function buildDialogContent(marker: MapMarkerData): string {
  const isMapNote = marker.kind === "map-note";
  const isIconMode = marker.displayMode === "icon";
  const iconOptions = buildIconOptions(marker.iconSymbol || DEFAULT_MAP_MARKER_ICON);
  const toneOptions = buildSelectOptions(TONE_OPTIONS, marker.tone);
  const lengthOptions = buildSelectOptions(BOXTEXT_LENGTH_OPTIONS, marker.boxTextLength);

  return `
    <style>
      .handy-dandy-map-marker-form {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        min-width: min(980px, 96vw);
        max-height: 78vh;
        overflow-y: auto;
        padding: 0.1rem 0.2rem 0.2rem;
      }

      .handy-dandy-map-marker-card {
        margin: 0;
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.7rem;
      }

      .handy-dandy-map-marker-card > legend {
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        font-size: 0.78rem;
        padding: 0 0.25rem;
      }

      .handy-dandy-map-marker-form .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .handy-dandy-map-marker-form .form-group > label {
        font-weight: 600;
      }

      .handy-dandy-map-marker-form input,
      .handy-dandy-map-marker-form select,
      .handy-dandy-map-marker-form textarea {
        width: 100%;
      }

      .handy-dandy-map-marker-grid {
        display: grid;
        gap: 0.6rem;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }

      .handy-dandy-map-marker-context-grid {
        display: grid;
        gap: 0.65rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .handy-dandy-map-marker-form textarea {
        line-height: 1.35;
        min-height: 5.8rem;
        max-height: 20rem;
        overflow-y: auto;
        resize: vertical;
        width: 100%;
      }

      .handy-dandy-map-marker-form textarea[name="boxText"] {
        min-height: 13rem;
      }

      .handy-dandy-map-marker-expand-row {
        display: flex;
        justify-content: flex-end;
        margin: -0.15rem 0 0.15rem;
      }

      .handy-dandy-map-marker-expand-button {
        font-size: 0.82rem;
        line-height: 1;
        padding: 0.2rem 0.45rem;
      }

      .handy-dandy-map-marker-toolbar {
        display: flex;
        justify-content: flex-end;
      }

      .handy-dandy-map-marker-row {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        justify-content: space-between;
      }

      .handy-dandy-map-marker-row button {
        flex: none;
        white-space: nowrap;
      }

      .handy-dandy-map-marker-actions {
        align-items: center;
        display: inline-flex;
        flex-wrap: nowrap;
        gap: 0.4rem;
        justify-content: flex-end;
      }

      .handy-dandy-map-marker-actions button {
        align-items: center;
        display: inline-flex;
        justify-content: center;
        line-height: 1.15;
        min-height: 2.35rem;
        min-width: 7.2rem;
        padding: 0.35rem 0.75rem;
        white-space: nowrap;
        width: auto;
      }

      .handy-dandy-map-marker-form .notes {
        margin: 0;
        font-size: 0.86rem;
        line-height: 1.3;
        color: var(--color-text-light-6, #bbb);
      }

      .handy-dandy-map-marker-checkbox {
        align-items: center;
        display: inline-flex;
        gap: 0.45rem;
        font-weight: 600;
        margin-bottom: 0.2rem;
      }

      .handy-dandy-map-marker-gm-notes[data-active="false"] textarea {
        opacity: 0.72;
      }

      @media (max-width: 880px) {
        .handy-dandy-map-marker-context-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
    <form class="handy-dandy-map-marker-form">
      <fieldset class="handy-dandy-map-marker-card">
        <legend>Marker Setup</legend>
        <div class="handy-dandy-map-marker-grid">
          <div class="form-group">
            <label for="handy-dandy-marker-kind">Marker Type</label>
            <select id="handy-dandy-marker-kind" name="kind">
              <option value="specific-room"${isMapNote ? "" : " selected"}>Specific Room</option>
              <option value="map-note"${isMapNote ? " selected" : ""}>Map Note</option>
            </select>
          </div>
          <div class="form-group">
            <label for="handy-dandy-marker-title">Room/Area Name</label>
            <input id="handy-dandy-marker-title" name="title" type="text" value="${escapeHtml(marker.title)}" placeholder="The Caved-In Observatory" />
          </div>
          <div class="form-group">
            <label for="handy-dandy-marker-display-mode">Marker Display</label>
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
          <div class="form-group">
            <label for="handy-dandy-marker-tone">Tone</label>
            <select id="handy-dandy-marker-tone" name="tone">${toneOptions}</select>
          </div>
          <div class="form-group">
            <label for="handy-dandy-marker-length">Boxtext Length</label>
            <select id="handy-dandy-marker-length" name="boxTextLength">${lengthOptions}</select>
          </div>
        </div>
      </fieldset>

      <fieldset class="handy-dandy-map-marker-card">
        <legend>Scene Prep Context</legend>
        <div class="handy-dandy-map-marker-toolbar">
          <button type="button" data-action="insert-template">Insert Prep Template</button>
        </div>
        <p class="notes">These fields are stored on the marker and used to generate stronger read-aloud text.</p>
        <div class="handy-dandy-map-marker-context-grid">
          <div class="form-group">
            <label for="handy-dandy-marker-prompt">Prompt Objective</label>
            <textarea id="handy-dandy-marker-prompt" name="prompt" rows="5" placeholder="What should the boxed text accomplish?">${escapeHtml(marker.prompt)}</textarea>
          </div>
          <div class="form-group">
            <label for="handy-dandy-marker-theme">Area Specifics and Theme</label>
            <textarea id="handy-dandy-marker-theme" name="areaTheme" rows="5" placeholder="Architecture, history, vibe, and environmental flavor.">${escapeHtml(marker.areaTheme)}</textarea>
          </div>
          <div class="form-group">
            <label for="handy-dandy-marker-sensory">First Sensory Impression</label>
            <textarea id="handy-dandy-marker-sensory" name="sensoryDetails" rows="5" placeholder="What do players see, hear, smell, or feel first?">${escapeHtml(marker.sensoryDetails)}</textarea>
          </div>
          <div class="form-group">
            <label for="handy-dandy-marker-features">Notable Features and Interactables</label>
            <textarea id="handy-dandy-marker-features" name="notableFeatures" rows="5" placeholder="Landmarks, objects, clues, and interactable set pieces.">${escapeHtml(marker.notableFeatures)}</textarea>
          </div>
          <div class="form-group">
            <label for="handy-dandy-marker-occupants">Occupants and Activity</label>
            <textarea id="handy-dandy-marker-occupants" name="occupants" rows="5" placeholder="Creatures, NPCs, movement, or signs of recent presence.">${escapeHtml(marker.occupants)}</textarea>
          </div>
          <div class="form-group">
            <label for="handy-dandy-marker-hazards">Hazards and Tension</label>
            <textarea id="handy-dandy-marker-hazards" name="hazards" rows="5" placeholder="Danger cues, unstable elements, and pressure in the scene.">${escapeHtml(marker.hazards)}</textarea>
          </div>
        </div>
      </fieldset>

      <fieldset class="handy-dandy-map-marker-card handy-dandy-map-marker-gm-notes" data-active="${marker.includeGmNotes ? "true" : "false"}">
        <legend>GM Notes</legend>
        <label class="handy-dandy-map-marker-checkbox">
          <input type="checkbox" name="includeGmNotes"${marker.includeGmNotes ? " checked" : ""} />
          Allow generation to lightly weave these notes into read-aloud text
        </label>
        <textarea name="gmNotes" rows="5" placeholder="Secret context, pacing notes, and what this area is doing in your adventure.">${escapeHtml(marker.gmNotes)}</textarea>
        <p class="notes">Keep secrets here. Disable the checkbox above if you want boxtext to avoid revealing them.</p>
      </fieldset>

      <fieldset class="handy-dandy-map-marker-card">
        <legend>Boxtext Output</legend>
        <div class="handy-dandy-map-marker-toolbar">
          <div class="handy-dandy-map-marker-actions">
            <button type="button" data-action="copy-boxtext">Copy</button>
            <button type="button" data-action="generate-boxtext">Generate Boxtext</button>
          </div>
        </div>
        <textarea id="handy-dandy-marker-boxtext" name="boxText" rows="10" placeholder="Generated read-aloud text appears here.">${escapeHtml(marker.boxText)}</textarea>
        <p class="notes">Generated text is editable. Save when it reads the way you want.</p>
      </fieldset>
    </form>
  `;
}

function normalizeTone(value: unknown, fallback: MapMarkerTone): MapMarkerTone {
  switch (value) {
    case "mysterious":
    case "ominous":
    case "wondrous":
    case "grim":
    case "lively":
    case "neutral":
      return value;
    default:
      return fallback;
  }
}

function normalizeBoxTextLength(value: unknown, fallback: MapMarkerBoxTextLength): MapMarkerBoxTextLength {
  switch (value) {
    case "short":
    case "long":
    case "medium":
      return value;
    default:
      return fallback;
  }
}

function applyPrepTemplate(root: HTMLElement): void {
  const selectors = {
    prompt: "textarea[name=\"prompt\"]",
    areaTheme: "textarea[name=\"areaTheme\"]",
    sensoryDetails: "textarea[name=\"sensoryDetails\"]",
    notableFeatures: "textarea[name=\"notableFeatures\"]",
    occupants: "textarea[name=\"occupants\"]",
    hazards: "textarea[name=\"hazards\"]",
    gmNotes: "textarea[name=\"gmNotes\"]",
  } as const;

  let updated = 0;
  for (const [key, selector] of Object.entries(selectors) as Array<
    [keyof typeof PREP_TEMPLATE_VALUES, string]
  >) {
    const field = root.querySelector<HTMLTextAreaElement>(selector);
    if (!field || field.value.trim()) {
      continue;
    }

    field.value = PREP_TEMPLATE_VALUES[key];
    updated += 1;
  }

  if (updated > 0) {
    ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Added prep-template hints to ${updated} field${updated === 1 ? "" : "s"}.`);
  } else {
    ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Prep template skipped (fields already contain text).`);
  }
}

function resolveTextareaLabel(root: HTMLElement, textarea: HTMLTextAreaElement): string {
  const id = textarea.id;
  if (id) {
    const byId = root.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
    const text = byId?.textContent?.trim();
    if (text) {
      return text;
    }
  }

  const inGroup = textarea.closest(".form-group")?.querySelector<HTMLLabelElement>("label");
  const inGroupText = inGroup?.textContent?.trim();
  if (inGroupText) {
    return inGroupText;
  }

  const legend = textarea.closest("fieldset")?.querySelector("legend")?.textContent?.trim();
  if (legend) {
    return legend;
  }

  return "Long-Form Text";
}

function readExpandedEditorValue(html: JQuery, fallback: string): string {
  const root = html[0];
  if (!(root instanceof HTMLElement)) {
    return fallback;
  }

  const field = root.querySelector<HTMLTextAreaElement>("textarea[name=\"expandedValue\"]");
  return field ? field.value : fallback;
}

async function promptExpandedTextEditor(label: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: string | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const content = `
      <style>
        .handy-dandy-map-marker-expanded-editor {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: min(1100px, 96vw);
        }

        .handy-dandy-map-marker-expanded-editor textarea {
          min-height: min(68vh, 860px);
          resize: vertical;
          width: 100%;
          line-height: 1.45;
        }

        .handy-dandy-map-marker-expanded-editor .notes {
          margin: 0;
          font-size: 0.88rem;
          color: var(--color-text-light-6, #bbb);
        }
      </style>
      <form class="handy-dandy-map-marker-expanded-editor">
        <textarea name="expandedValue">${escapeHtml(value)}</textarea>
        <p class="notes">Tip: Press Ctrl+Enter to apply.</p>
      </form>
    `;

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | ${label}`,
        content,
        buttons: {
          apply: {
            label: "Apply",
            icon: "<i class=\"fas fa-check\"></i>",
            callback: (html) => {
              finish(readExpandedEditorValue(html, value));
            },
          },
          cancel: {
            label: "Cancel",
            icon: "<i class=\"fas fa-times\"></i>",
            callback: () => {
              finish(null);
            },
          },
        },
        default: "apply",
        close: () => {
          finish(null);
        },
      },
      {
        width: Math.max(760, Math.min(window.innerWidth - 80, 1320)),
        resizable: true,
      },
    );

    const hookId = Hooks.on("renderDialog", (app: Dialog, html: JQuery) => {
      if (app !== dialog) {
        return;
      }

      Hooks.off("renderDialog", hookId);
      const root = html[0];
      if (!(root instanceof HTMLElement)) {
        return;
      }

      const field = root.querySelector<HTMLTextAreaElement>("textarea[name=\"expandedValue\"]");
      if (!field) {
        return;
      }

      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
      field.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          finish(field.value);
          dialog.close({ force: true });
        }
      });
    });

    dialog.render(true);
  });
}

function attachExpandedEditors(root: HTMLElement): void {
  const textareas = Array.from(root.querySelectorAll<HTMLTextAreaElement>(".handy-dandy-map-marker-form textarea[name]"));
  for (const textarea of textareas) {
    const container = textarea.closest<HTMLElement>(".form-group") ?? textarea.closest<HTMLElement>("fieldset");
    if (!container) {
      continue;
    }

    const existing = container.querySelector<HTMLElement>(`.handy-dandy-map-marker-expand-row[data-target="${textarea.name}"]`);
    if (existing) {
      continue;
    }

    const row = document.createElement("div");
    row.className = "handy-dandy-map-marker-expand-row";
    row.dataset.target = textarea.name;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "handy-dandy-map-marker-expand-button";
    button.innerHTML = "<i class=\"fas fa-expand\"></i> Open Editor";
    button.addEventListener("click", () => {
      const label = resolveTextareaLabel(root, textarea);
      void promptExpandedTextEditor(label, textarea.value).then((nextValue) => {
        if (nextValue === null) {
          return;
        }

        textarea.value = nextValue;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        textarea.focus();
      });
    });

    row.appendChild(button);
    container.insertBefore(row, textarea);
  }
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

  attachExpandedEditors(root);

  const displayField = root.querySelector<HTMLSelectElement>("select[name=\"displayMode\"]");
  const groupedFields = Array.from(root.querySelectorAll<HTMLElement>("[data-display-group]"));
  if (displayField && groupedFields.length) {
    const updateDisplayVisibility = (): void => {
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

    updateDisplayVisibility();
    displayField.addEventListener("change", updateDisplayVisibility);
  }

  const gmNotesCard = root.querySelector<HTMLElement>(".handy-dandy-map-marker-gm-notes");
  const includeGmNotesField = root.querySelector<HTMLInputElement>("input[name=\"includeGmNotes\"]");
  if (gmNotesCard && includeGmNotesField) {
    const updateGmNoteState = (): void => {
      gmNotesCard.dataset.active = includeGmNotesField.checked ? "true" : "false";
    };

    updateGmNoteState();
    includeGmNotesField.addEventListener("change", updateGmNoteState);
  }

  const templateButton = root.querySelector<HTMLButtonElement>("button[data-action=\"insert-template\"]");
  if (templateButton) {
    templateButton.addEventListener("click", () => {
      applyPrepTemplate(root);
    });
  }

  const generateButton = root.querySelector<HTMLButtonElement>("button[data-action=\"generate-boxtext\"]");
  const copyButton = root.querySelector<HTMLButtonElement>("button[data-action=\"copy-boxtext\"]");
  const boxTextField = root.querySelector<HTMLTextAreaElement>("textarea[name=\"boxText\"]");
  if (!generateButton || !boxTextField) {
    return;
  }

  if (copyButton) {
    copyButton.addEventListener("click", () => {
      if (!boxTextField.value.trim()) {
        ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | No boxtext to copy yet.`);
        return;
      }

      void navigator.clipboard
        .writeText(boxTextField.value)
        .then(() => {
          ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Boxtext copied to clipboard.`);
        })
        .catch(() => {
          ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Clipboard copy failed.`);
        });
    });
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
  const tone = normalizeTone(formData.get("tone"), marker.tone ?? DEFAULT_MAP_MARKER_TONE);
  const boxTextLength = normalizeBoxTextLength(
    formData.get("boxTextLength"),
    marker.boxTextLength ?? DEFAULT_MAP_MARKER_BOXTEXT_LENGTH,
  );

  return {
    marker: {
      ...marker,
      kind,
      displayMode,
      title: String(formData.get("title") ?? ""),
      numberLabel: String(formData.get("numberLabel") ?? marker.numberLabel).trim() || marker.numberLabel || "1",
      iconSymbol: String(formData.get("iconSymbol") ?? marker.iconSymbol).trim() || DEFAULT_MAP_MARKER_ICON,
      hidden: marker.hidden,
      prompt,
      areaTheme,
      sensoryDetails: String(formData.get("sensoryDetails") ?? ""),
      notableFeatures: String(formData.get("notableFeatures") ?? ""),
      occupants: String(formData.get("occupants") ?? ""),
      hazards: String(formData.get("hazards") ?? ""),
      gmNotes: String(formData.get("gmNotes") ?? ""),
      tone,
      boxTextLength,
      includeGmNotes: formData.get("includeGmNotes") !== null,
      boxText: String(formData.get("boxText") ?? ""),
      updatedAt: Date.now(),
    },
    defaults: {
      prompt,
      areaTheme,
      tone,
      boxTextLength,
    },
  };
}

function readDialogForm(html: JQuery, marker: MapMarkerData): { marker: MapMarkerData; defaults: MapMarkerDefaults } {
  const root = html[0];
  if (!(root instanceof HTMLElement)) {
    return {
      marker,
      defaults: {
        prompt: marker.prompt,
        areaTheme: marker.areaTheme,
        tone: marker.tone,
        boxTextLength: marker.boxTextLength,
      },
    };
  }

  const form = root.querySelector<HTMLFormElement>(".handy-dandy-map-marker-form");
  if (!form) {
    return {
      marker,
      defaults: {
        prompt: marker.prompt,
        areaTheme: marker.areaTheme,
        tone: marker.tone,
        boxTextLength: marker.boxTextLength,
      },
    };
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
        title: `${CONSTANTS.MODULE_NAME} | Map Note / Room Prep`,
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
        width: 980,
        resizable: true,
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
