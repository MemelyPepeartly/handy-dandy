import { CONSTANTS } from "../constants";
import {
  collectFailureMessages,
  exportSelectedEntities,
  generateWorkbenchEntry,
  DEFAULT_IMAGE_PATH,
  type PromptWorkbenchRequest,
  type PromptWorkbenchResult,
} from "./prompt-workbench";
import {
  ITEM_CATEGORIES,
  SYSTEM_IDS,
  type EntityType,
  type GeneratedEntityMap,
  type ItemCategory,
  type PublicationData,
  type SystemId,
} from "../schemas";
import { importAction, importActor, importItem } from "../mappers/import";

interface WorkbenchHistoryEntry {
  readonly id: string;
  readonly result: PromptWorkbenchResult<EntityType>;
  readonly json: string;
  readonly importerAvailable: boolean;
  readonly timestamp: number;
}

const WORKBENCH_HISTORY_LIMIT = 12;
const WORKBENCH_HISTORY_FLAG_KEY = "workbenchHistory" as const;

type SerializableWorkbenchResult = Pick<
  PromptWorkbenchResult<EntityType>,
  "type" | "name" | "data" | "input"
>;

interface StoredWorkbenchHistoryEntry {
  readonly id: string;
  readonly json: string;
  readonly timestamp: number;
  readonly importerAvailable: boolean;
  readonly result: SerializableWorkbenchResult;
}

type WorkbenchFormResponse = {
  readonly entityType: string;
  readonly systemId: string;
  readonly entryName: string;
  readonly slug: string;
  readonly itemType: string;
  readonly level: string;
  readonly publicationTitle: string;
  readonly publicationAuthors: string;
  readonly publicationLicense: string;
  readonly publicationRemaster: string | null;
  readonly img: string;
  readonly referenceText: string;
  readonly seed: string;
  readonly maxAttempts: string;
  readonly packId: string;
  readonly folderId: string;
  readonly includeSpellcasting: string | null;
  readonly includeInventory: string | null;
  readonly generateTokenImage: string | null;
  readonly tokenPrompt: string;
};

const workbenchHistory: WorkbenchHistoryEntry[] = [];

Hooks.once("ready", () => {
  initialiseWorkbenchHistory();
});

Hooks.on("updateUser", (user: User, changes: Record<string, unknown>) => {
  const currentUserId = game.userId;
  if (!currentUserId || user.id !== currentUserId) {
    return;
  }

  const flags = (changes as { flags?: unknown }).flags;
  if (!flags || typeof flags !== "object") {
    return;
  }

  const moduleFlags = (flags as Record<string, unknown>)[CONSTANTS.MODULE_ID];
  if (!moduleFlags || typeof moduleFlags !== "object") {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(moduleFlags, WORKBENCH_HISTORY_FLAG_KEY)) {
    return;
  }

  const value = (moduleFlags as Record<string, unknown>)[WORKBENCH_HISTORY_FLAG_KEY];
  applyStoredWorkbenchHistory(value);
});

export async function runExportSelectionFlow(): Promise<void> {
  try {
    const result = exportSelectedEntities();
    if (!result.entries.length) {
      ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | No controlled tokens or directory selections to export.`);
      return;
    }

    const prefix = `${CONSTANTS.MODULE_NAME} |`;
    const failures = collectFailureMessages(result.entries);
    const summary = result.summary;

    if (result.successCount > 0) {
      let message = summary;
      try {
        await navigator.clipboard.writeText(result.json);
        message = `${summary} Copied JSON to clipboard.`;
      } catch (error) {
        console.warn(`${CONSTANTS.MODULE_NAME} | Clipboard copy failed`, error);
      }
      ui.notifications?.info(`${prefix} ${message}`);
      console.info(`${CONSTANTS.MODULE_NAME} | Exported canonical JSON`, JSON.parse(result.json));
    } else {
      ui.notifications?.warn(`${prefix} ${summary}`);
    }

    if (failures.length) {
      ui.notifications?.warn(`${prefix} ${failures.length} selection(s) failed. Check console for details.`);
      console.warn(`${CONSTANTS.MODULE_NAME} | Export failures`, failures);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Export failed: ${message}`);
    console.error(`${CONSTANTS.MODULE_NAME} | Export selection failed`, error);
  }
}

export async function runPromptWorkbenchFlow(): Promise<void> {
  const request = await promptWorkbenchRequest();
  if (!request) {
    return;
  }

  let waitingDialog: Dialog | null = null;
  try {
    waitingDialog = showGeneratingDialog(request);
    const result = await generateWorkbenchEntry(request);
    waitingDialog.close({ force: true });
    waitingDialog = null;
    await showWorkbenchResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Prompt workbench failed: ${message}`);
    console.error(`${CONSTANTS.MODULE_NAME} | Prompt workbench failed`, error);
  } finally {
    waitingDialog?.close({ force: true });
  }
}

async function promptWorkbenchRequest(): Promise<PromptWorkbenchRequest<EntityType> | null> {
  const systemOptions = SYSTEM_IDS.map((id) => `<option value="${id}">${id.toUpperCase()}</option>`).join("");
  const itemTypeOptions = ITEM_CATEGORIES.map(
    (category) => `<option value="${category}">${formatItemTypeLabel(category)}</option>`
  ).join("");
  const initialHistoryId = workbenchHistory[0]?.id;
  const historyListMarkup = buildHistoryListMarkup(initialHistoryId);
  const historyPlaceholder = buildHistoryViewPlaceholder();

  const content = `
    <style>
      .handy-dandy-workbench-request {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 720px;
      }

      .handy-dandy-workbench-tabs {
        display: flex;
        gap: 0.5rem;
        border-bottom: 1px solid var(--color-border-dark, #333);
        padding-bottom: 0.25rem;
      }

      .handy-dandy-workbench-tab {
        appearance: none;
        background: var(--color-bg-alt, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--color-border-dark, #333);
        border-bottom: none;
        border-radius: 6px 6px 0 0;
        color: inherit;
        cursor: pointer;
        font-weight: 600;
        padding: 0.35rem 0.9rem;
        transition: background 0.2s ease, color 0.2s ease;
      }

      .handy-dandy-workbench-tab.active {
        background: var(--color-border-light-1, rgba(255, 255, 255, 0.12));
        color: var(--color-text-bright, #f0f0f0);
      }

      .handy-dandy-workbench-panel {
        display: none;
        flex-direction: column;
        gap: 0.75rem;
      }

      .handy-dandy-workbench-panel.active {
        display: flex;
      }

      .handy-dandy-workbench-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .handy-dandy-workbench-grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .handy-dandy-workbench-form fieldset {
        margin: 0;
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 6px;
        padding: 0.75rem;
      }

      .handy-dandy-workbench-form fieldset > legend {
        font-weight: 600;
        padding: 0 0.25rem;
      }

      .handy-dandy-workbench-form .notes {
        margin: 0.25rem 0 0;
        font-size: 0.85em;
        color: var(--color-text-light-6, #bbb);
      }

      .handy-dandy-workbench-form textarea {
        min-height: 12rem;
        resize: vertical;
        width: 100%;
      }

      .handy-dandy-workbench-form .form-fields {
        display: grid;
        gap: 0.5rem;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        align-items: center;
      }

      .handy-dandy-workbench-inline {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
        margin-top: 0.5rem;
      }

      .handy-dandy-workbench-inline label {
        font-weight: 600;
      }

      .handy-dandy-workbench-inline input {
        max-width: 120px;
      }

      .handy-dandy-workbench-advanced {
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 6px;
        padding: 0.75rem;
        background: var(--color-bg-alt, rgba(255, 255, 255, 0.04));
      }

      .handy-dandy-workbench-advanced > summary {
        cursor: pointer;
        font-weight: 600;
        list-style: none;
        margin: -0.75rem -0.75rem 0;
        padding: 0.75rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .handy-dandy-workbench-advanced > summary::-webkit-details-marker {
        display: none;
      }

      .handy-dandy-workbench-advanced > summary::after {
        content: "\\25BC";
        font-size: 0.85em;
        transition: transform 0.2s ease;
      }

      .handy-dandy-workbench-advanced[open] > summary {
        border-bottom: 1px solid var(--color-border-dark, #333);
        margin-bottom: 0.75rem;
      }

      .handy-dandy-workbench-advanced[open] > summary::after {
        transform: rotate(-180deg);
      }

      .handy-dandy-workbench-advanced-fields {
        display: grid;
        gap: 0.5rem;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      }

      .handy-dandy-workbench-history {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: minmax(180px, 220px) 1fr;
        align-items: start;
      }

      .handy-dandy-workbench-history-list {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        max-height: 24rem;
        overflow-y: auto;
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 6px;
        padding: 0.35rem;
        background: var(--color-bg-alt, rgba(255, 255, 255, 0.04));
      }

      .handy-dandy-workbench-history-item {
        align-items: center;
        border-radius: 4px;
        border: 1px solid transparent;
        display: flex;
        transition: border-color 0.2s ease, background 0.2s ease;
      }

      .handy-dandy-workbench-history-item.active {
        border-color: var(--color-border-highlight, #ff8c00);
        background: var(--color-border-light-1, rgba(255, 255, 255, 0.12));
      }

      .handy-dandy-workbench-history-item:not(.active):hover,
      .handy-dandy-workbench-history-item:not(.active):focus-within {
        border-color: var(--color-border-light-2, rgba(255, 255, 255, 0.2));
        background: var(--color-border-dark, rgba(255, 255, 255, 0.08));
      }

      .handy-dandy-workbench-history-select {
        appearance: none;
        background: transparent;
        border: none;
        color: inherit;
        cursor: pointer;
        flex: 1;
        padding: 0.45rem 0.5rem;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .handy-dandy-workbench-history-select:focus {
        outline: none;
      }

      .handy-dandy-workbench-history-select .handy-dandy-workbench-history-name {
        font-weight: 600;
        font-size: 0.95rem;
      }

      .handy-dandy-workbench-history-select .handy-dandy-workbench-history-meta {
        color: var(--color-text-light-6, #bbb);
        font-size: 0.8rem;
      }

      .handy-dandy-workbench-history-delete {
        appearance: none;
        background: transparent;
        border: none;
        border-radius: 0 4px 4px 0;
        color: var(--color-text-light-6, #bbb);
        cursor: pointer;
        padding: 0.35rem;
        transition: color 0.2s ease, background 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .handy-dandy-workbench-history-delete:hover,
      .handy-dandy-workbench-history-delete:focus-visible {
        color: var(--color-text-bright, #f0f0f0);
        background: var(--color-border-dark, rgba(255, 255, 255, 0.12));
        outline: none;
      }

      .handy-dandy-workbench-history-view {
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 6px;
        min-height: 18rem;
        padding: 0.75rem;
        overflow: auto;
        background: var(--color-bg-alt, rgba(255, 255, 255, 0.04));
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .handy-dandy-workbench-history-empty {
        color: var(--color-text-light-6, #bbb);
        font-size: 0.95rem;
        padding: 0.5rem 0;
      }

      .handy-dandy-workbench-request .notes {
        color: var(--color-text-light-6, #bbb);
        font-size: 0.9rem;
        margin: 0;
      }
    </style>
    <div class="handy-dandy-workbench-request">
      <nav class="handy-dandy-workbench-tabs">
        <button type="button" class="handy-dandy-workbench-tab active" data-tab="prompt">Prompt</button>
        <button type="button" class="handy-dandy-workbench-tab" data-tab="history">History</button>
      </nav>
      <section class="handy-dandy-workbench-panel active" data-panel="prompt">
        <form class="handy-dandy-workbench-form">
          <fieldset class="form-group">
            <legend>Type</legend>
            <div class="form-fields">
              <div>
                <label for="handy-dandy-workbench-entity-type">Entity Type</label>
                <select id="handy-dandy-workbench-entity-type" name="entityType">
                  <option value="actor">Actor</option>
                  <option value="action">Action</option>
                  <option value="item">Item</option>
                </select>
              </div>
              <div>
                <label for="handy-dandy-workbench-system">Game System</label>
                <select id="handy-dandy-workbench-system" name="systemId">
                  ${systemOptions}
                </select>
              </div>
              <div data-entity-scope="item">
                <label for="handy-dandy-workbench-item-type">Item Type</label>
                <select id="handy-dandy-workbench-item-type" name="itemType">
                  <option value="">Select a type</option>
                  ${itemTypeOptions}
                </select>
                <p class="notes">Match the Foundry item category for the generated entry.</p>
              </div>
            </div>
          </fieldset>
          <div class="form-group">
            <label for="handy-dandy-workbench-title">Title</label>
            <input id="handy-dandy-workbench-title" type="text" name="entryName" required />
            <p class="notes">Use the actor name, action title, or item name you want in Foundry.</p>
          </div>
          <div class="form-group">
            <label for="handy-dandy-workbench-image">Image Path</label>
            <input id="handy-dandy-workbench-image" type="text" name="img" value="${DEFAULT_IMAGE_PATH}" />
            <p class="notes">Provide a Foundry asset path or URL for the generated image.</p>
          </div>
          <div class="form-group">
            <label for="handy-dandy-workbench-prompt">Prompt</label>
            <textarea id="handy-dandy-workbench-prompt" name="referenceText" required></textarea>
            <p class="notes">Paste rules text, stat blocks, or a creative prompt for the generator to follow.</p>
            <div class="handy-dandy-workbench-inline">
              <label for="handy-dandy-workbench-level">What level?</label>
              <input id="handy-dandy-workbench-level" type="number" name="level" min="0" />
            </div>
            <p class="notes">Provide a level for actors; leave blank for other entries.</p>
          </div>
          <fieldset class="form-group" data-entity-scope="actor">
            <legend>Actor Content</legend>
            <div class="form-fields">
              <label><input type="checkbox" name="includeSpellcasting" /> Spellcasting?</label>
              <label><input type="checkbox" name="includeInventory" /> Inventory?</label>
              <label><input type="checkbox" name="generateTokenImage" /> Generate Transparent Token?</label>
            </div>
            <label>Token Prompt Override <input type="text" name="tokenPrompt" placeholder="Optional art direction" /></label>
            <p class="notes">Use these options to guide actor prompts.</p>
          </fieldset>
          <fieldset class="form-group">
            <legend>Publication Details</legend>
            <div class="form-fields">
              <label>Title <input type="text" name="publicationTitle" value="" /></label>
              <label>Authors <input type="text" name="publicationAuthors" value="" /></label>
              <label>License <input type="text" name="publicationLicense" value="OGL" /></label>
              <label><input type="checkbox" name="publicationRemaster" /> Remaster</label>
            </div>
          </fieldset>
          <div class="form-group">
            <label for="handy-dandy-workbench-slug">Slug (optional)</label>
            <input id="handy-dandy-workbench-slug" type="text" name="slug" />
          </div>
          <details class="handy-dandy-workbench-advanced">
            <summary>Advanced Options</summary>
            <div class="handy-dandy-workbench-advanced-fields">
              <label>Seed <input type="number" name="seed" /></label>
              <label>Max Attempts <input type="number" name="maxAttempts" min="1" /></label>
              <label>Compendium Pack ID <input type="text" name="packId" /></label>
              <label>Folder ID <input type="text" name="folderId" /></label>
            </div>
          </details>
        </form>
      </section>
      <section class="handy-dandy-workbench-panel" data-panel="history">
        <div class="handy-dandy-workbench-history">
          <aside class="handy-dandy-workbench-history-list" data-history-list>
            ${historyListMarkup}
          </aside>
          <div class="handy-dandy-workbench-history-view" data-history-view>${historyPlaceholder}</div>
        </div>
        <p class="notes">History entries persist locally in this browser. Remove any that you no longer need.</p>
      </section>
    </div>
  `;

  const response = await new Promise<WorkbenchFormResponse | null>((resolve) => {
    let settled = false;
    const finish = (value: WorkbenchFormResponse | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | Prompt Workbench`,
        content,
        buttons: {
          generate: {
            icon: '<i class="fas fa-magic"></i>',
            label: "Generate",
            callback: (html) => {
              const form = html[0]?.querySelector("form");
              if (!form) {
                finish(null);
                return;
              }

              const formData = new FormData(form as HTMLFormElement);
              finish({
                entityType: String(formData.get("entityType") ?? ""),
                systemId: String(formData.get("systemId") ?? ""),
                entryName: String(formData.get("entryName") ?? ""),
                slug: String(formData.get("slug") ?? ""),
                itemType: String(formData.get("itemType") ?? ""),
                level: String(formData.get("level") ?? ""),
                publicationTitle: String(formData.get("publicationTitle") ?? ""),
                publicationAuthors: String(formData.get("publicationAuthors") ?? ""),
                publicationLicense: String(formData.get("publicationLicense") ?? ""),
                publicationRemaster: formData.get("publicationRemaster") as string | null,
                img: String(formData.get("img") ?? ""),
                referenceText: String(formData.get("referenceText") ?? ""),
                seed: String(formData.get("seed") ?? ""),
                maxAttempts: String(formData.get("maxAttempts") ?? ""),
                packId: String(formData.get("packId") ?? ""),
                folderId: String(formData.get("folderId") ?? ""),
                includeSpellcasting: formData.get("includeSpellcasting") as string | null,
                includeInventory: formData.get("includeInventory") as string | null,
                generateTokenImage: formData.get("generateTokenImage") as string | null,
                tokenPrompt: String(formData.get("tokenPrompt") ?? ""),
              });
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => finish(null),
          },
        },
        default: "generate",
        close: () => finish(null),
      },
      { jQuery: true, width: 820 },
    );

    const hookId = Hooks.on("renderDialog", (app: Dialog, html: JQuery) => {
      if (app !== dialog) {
        return;
      }

      Hooks.off("renderDialog", hookId);
      setupWorkbenchRequestDialog(html);
    });

    dialog.render(true);
  });

  if (!response) {
    return null;
  }

  const type = sanitizeEntityType(response.entityType);
  if (!type) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Invalid entity type.`);
    return null;
  }

  const systemId = sanitizeSystemId(response.systemId);
  if (!systemId) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Invalid system selection.`);
    return null;
  }

  const entryName = response.entryName.trim();
  if (!entryName) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Please provide a name or title.`);
    return null;
  }

  let itemType: ItemCategory | undefined;
  if (type === "item") {
    const resolved = sanitizeItemType(response.itemType);
    if (!resolved) {
      ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Select a valid item type.`);
      return null;
    }
    itemType = resolved;
  }

  const referenceText = response.referenceText.trim();
  if (!referenceText) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Reference text or prompt is required.`);
    return null;
  }

  const publication: PublicationData = {
    title: response.publicationTitle.trim(),
    authors: response.publicationAuthors.trim(),
    license: response.publicationLicense.trim(),
    remaster: Boolean(response.publicationRemaster),
  };

  const img = response.img.trim() || DEFAULT_IMAGE_PATH;

  return {
    type,
    systemId,
    entryName,
    referenceText,
    slug: response.slug.trim() || undefined,
    itemType,
    level: parseOptionalNumber(response.level),
    seed: parseOptionalNumber(response.seed),
    maxAttempts: parseOptionalNumber(response.maxAttempts),
    packId: response.packId.trim() || undefined,
    folderId: response.folderId.trim() || undefined,
    publication,
    img,
    includeSpellcasting: response.includeSpellcasting ? true : undefined,
    includeInventory: response.includeInventory ? true : undefined,
    generateTokenImage: response.generateTokenImage ? true : undefined,
    tokenPrompt: response.tokenPrompt.trim() || undefined,
  } satisfies PromptWorkbenchRequest<EntityType>;
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeItemType(value: string): ItemCategory | null {
  const normalized = value.trim().toLowerCase();
  return ITEM_CATEGORIES.includes(normalized as ItemCategory)
    ? (normalized as ItemCategory)
    : null;
}

function sanitizeEntityType(value: string): EntityType | null {
  switch (value) {
    case "action":
    case "item":
    case "actor":
      return value;
    default:
      return null;
  }
}

function sanitizeSystemId(value: string): SystemId | null {
  const normalised = value.trim().toLowerCase();
  return SYSTEM_IDS.includes(normalised as SystemId) ? (normalised as SystemId) : null;
}

function formatItemTypeLabel(value: ItemCategory): string {
  return value
    .split(/[-_]/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function showGeneratingDialog(request: PromptWorkbenchRequest<EntityType>): Dialog {
  const entryName = request.entryName.trim() || "entry";
  const safeEntryName = escapeHtml(entryName);
  const content = `
    <div class="handy-dandy-workbench-loading">
      <p><i class="fas fa-spinner fa-spin"></i> Generating ${safeEntryName}...</p>
      <p class="notes">This can take a few moments. Feel free to grab a beverage while you wait.</p>
    </div>
  `;

  const dialog = new Dialog({
    title: `${CONSTANTS.MODULE_NAME} | Working`,
    content,
    buttons: {},
    close: () => {
      /* no-op while loading */
    },
  }, { jQuery: true });

  dialog.render(true);
  return dialog;
}

async function showWorkbenchResult(result: PromptWorkbenchResult<EntityType>): Promise<void> {
  const json = JSON.stringify(result.data, null, 2);
  const importerAvailable = typeof result.importer === "function";
  const currentEntry = recordHistoryEntry(result, json, importerAvailable);

  const content = buildWorkbenchDialogContent(currentEntry);

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title: `${CONSTANTS.MODULE_NAME} | Prompt Workbench`,
      content,
      buttons: {
        close: {
          icon: '<i class="fas fa-check"></i>',
          label: "Close",
        },
      },
      close: () => resolve(),
      default: "close",
    }, { jQuery: true, width: 760 });

    const hookId = Hooks.on("renderDialog", (app: Dialog, html: JQuery) => {
      if (app !== dialog) {
        return;
      }

      Hooks.off("renderDialog", hookId);
      setupWorkbenchResultDialog(html, currentEntry);
    });

    dialog.render(true);
  });
}

function escapeJsonForTextarea(json: string): string {
  return escapeHtml(json);
}

function initialiseWorkbenchHistory(): void {
  const storedValue = getWorkbenchHistoryFlag();
  applyStoredWorkbenchHistory(storedValue);
}

function getWorkbenchHistoryFlag(): unknown {
  const user = game.user;
  if (!user) {
    return [];
  }

  try {
    return user.getFlag(CONSTANTS.MODULE_ID, WORKBENCH_HISTORY_FLAG_KEY) ?? [];
  } catch (error) {
    console.warn(`${CONSTANTS.MODULE_NAME} | Failed to load prompt workbench history`, error);
    return [];
  }
}

function applyStoredWorkbenchHistory(value: unknown): void {
  const entries = normaliseStoredWorkbenchHistory(value);
  workbenchHistory.splice(0, workbenchHistory.length, ...entries);
}

function normaliseStoredWorkbenchHistory(value: unknown): WorkbenchHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries = value
    .map((entry) => deserializeHistoryEntry(entry))
    .filter((entry): entry is WorkbenchHistoryEntry => Boolean(entry));

  return entries.slice(0, WORKBENCH_HISTORY_LIMIT);
}

async function persistWorkbenchHistory(): Promise<void> {
  const user = game.user;
  if (!user) {
    return;
  }

  try {
    const serializable = workbenchHistory
      .slice(0, WORKBENCH_HISTORY_LIMIT)
      .map((entry) => serializeHistoryEntry(entry));
    await user.setFlag(CONSTANTS.MODULE_ID, WORKBENCH_HISTORY_FLAG_KEY, serializable);
  } catch (error) {
    console.warn(`${CONSTANTS.MODULE_NAME} | Failed to persist prompt workbench history`, error);
  }
}

function serializeHistoryEntry(entry: WorkbenchHistoryEntry): StoredWorkbenchHistoryEntry {
  return {
    id: entry.id,
    json: entry.json,
    timestamp: entry.timestamp,
    importerAvailable: entry.importerAvailable,
    result: {
      type: entry.result.type,
      name: entry.result.name,
      data: entry.result.data,
      input: entry.result.input,
    },
  } satisfies StoredWorkbenchHistoryEntry;
}

function deserializeHistoryEntry(value: unknown): WorkbenchHistoryEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = record.id;
  const json = record.json;
  const timestamp = record.timestamp;
  const importerAvailable = record.importerAvailable;
  const result = record.result;

  if (typeof id !== "string" || typeof json !== "string" || typeof timestamp !== "number") {
    return null;
  }

  if (!result || typeof result !== "object") {
    return null;
  }

  const { type, name, data, input } = result as Record<string, unknown>;
  if (!isEntityType(type) || typeof name !== "string" || !isObject(data) || !isObject(input)) {
    return null;
  }

  const typedData = data as unknown as GeneratedEntityMap[EntityType];
  const importer = Boolean(importerAvailable) ? createHistoryImporter(type, typedData) : undefined;
  const resolvedImporterAvailable = Boolean(importer);

  const historyEntry: WorkbenchHistoryEntry = {
    id,
    json,
    timestamp,
    importerAvailable: resolvedImporterAvailable,
    result: {
      type,
      name,
      data: typedData,
      input: input as unknown as PromptWorkbenchResult<EntityType>["input"],
      importer,
    },
  };

  return historyEntry;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEntityType(value: unknown): value is EntityType {
  return value === "action" || value === "item" || value === "actor";
}

function createHistoryImporter(
  type: EntityType,
  data: GeneratedEntityMap[EntityType],
): WorkbenchHistoryEntry["result"]["importer"] {
  switch (type) {
    case "action":
      return () => importAction(data as GeneratedEntityMap["action"]);
    case "item":
      return () => importItem(data as GeneratedEntityMap["item"]);
    case "actor":
      return () => importActor(data as GeneratedEntityMap["actor"]);
    default:
      return undefined;
  }
}

function recordHistoryEntry(
  result: PromptWorkbenchResult<EntityType>,
  json: string,
  importerAvailable: boolean,
): WorkbenchHistoryEntry {
  const entry: WorkbenchHistoryEntry = {
    id: createHistoryId(),
    result,
    json,
    importerAvailable,
    timestamp: Date.now(),
  };

  workbenchHistory.unshift(entry);
  if (workbenchHistory.length > WORKBENCH_HISTORY_LIMIT) {
    workbenchHistory.length = WORKBENCH_HISTORY_LIMIT;
  }

  void persistWorkbenchHistory();

  return entry;
}

function createHistoryId(): string {
  return `history-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildWorkbenchDialogContent(currentEntry: WorkbenchHistoryEntry): string {
  const latestMarkup = buildEntryDetailMarkup(currentEntry);
  const historyListMarkup = buildHistoryListMarkup(currentEntry.id);
  const historyPlaceholder = buildHistoryViewPlaceholder();

  return `
    <style>
      .handy-dandy-workbench-dialog {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .handy-dandy-workbench-tabs {
        display: flex;
        gap: 0.5rem;
        border-bottom: 1px solid var(--color-border-dark, #333);
        padding-bottom: 0.25rem;
      }

      .handy-dandy-workbench-tab {
        appearance: none;
        background: var(--color-bg-alt, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--color-border-dark, #333);
        border-bottom: none;
        border-radius: 6px 6px 0 0;
        color: inherit;
        cursor: pointer;
        font-weight: 600;
        padding: 0.35rem 0.9rem;
        transition: background 0.2s ease, color 0.2s ease;
      }

      .handy-dandy-workbench-tab.active {
        background: var(--color-border-light-1, rgba(255, 255, 255, 0.12));
        color: var(--color-text-bright, #f0f0f0);
      }

      .handy-dandy-workbench-panel {
        display: none;
        flex-direction: column;
        gap: 0.75rem;
      }

      .handy-dandy-workbench-panel.active {
        display: flex;
      }

      .handy-dandy-workbench-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .handy-dandy-workbench-heading {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .handy-dandy-workbench-name {
        margin: 0;
        font-size: 1.35rem;
      }

      .handy-dandy-workbench-meta {
        margin: 0;
        color: var(--color-text-light-6, #bbb);
        font-size: 0.9rem;
      }

      .handy-dandy-workbench-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .handy-dandy-workbench-action {
        align-items: center;
        appearance: none;
        background: var(--color-border-light-1, rgba(255, 255, 255, 0.12));
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 4px;
        color: inherit;
        cursor: pointer;
        display: inline-flex;
        font-weight: 600;
        gap: 0.4rem;
        padding: 0.35rem 0.75rem;
        text-decoration: none;
        transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
      }

      .handy-dandy-workbench-action[disabled] {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .handy-dandy-workbench-json {
        width: 100%;
        min-height: 16rem;
        resize: vertical;
      }

      .handy-dandy-workbench-history {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: minmax(180px, 220px) 1fr;
        align-items: start;
      }

      .handy-dandy-workbench-history-list {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        max-height: 24rem;
        overflow-y: auto;
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 6px;
        padding: 0.35rem;
        background: var(--color-bg-alt, rgba(255, 255, 255, 0.04));
      }

      .handy-dandy-workbench-history-view {
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 6px;
        min-height: 18rem;
        padding: 0.75rem;
        overflow: auto;
        background: var(--color-bg-alt, rgba(255, 255, 255, 0.04));
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .handy-dandy-workbench-history-empty {
        color: var(--color-text-light-6, #bbb);
        font-size: 0.95rem;
        padding: 0.5rem 0;
      }

      .handy-dandy-workbench-history-view .handy-dandy-workbench-header {
        padding: 0;
      }

      .handy-dandy-workbench-history-view .handy-dandy-workbench-json {
        min-height: 14rem;
      }

      .handy-dandy-workbench-dialog .notes {
        margin: 0;
        color: var(--color-text-light-6, #bbb);
        font-size: 0.9rem;
      }

      .handy-dandy-workbench-history-item {
        align-items: center;
        border-radius: 4px;
        border: 1px solid transparent;
        display: flex;
        transition: border-color 0.2s ease, background 0.2s ease;
      }

      .handy-dandy-workbench-history-item.active {
        border-color: var(--color-border-highlight, #ff8c00);
        background: var(--color-border-light-1, rgba(255, 255, 255, 0.12));
      }

      .handy-dandy-workbench-history-item:not(.active):hover,
      .handy-dandy-workbench-history-item:not(.active):focus-within {
        border-color: var(--color-border-light-2, rgba(255, 255, 255, 0.2));
        background: var(--color-border-dark, rgba(255, 255, 255, 0.08));
      }

      .handy-dandy-workbench-history-select {
        appearance: none;
        background: transparent;
        border: none;
        color: inherit;
        cursor: pointer;
        flex: 1;
        padding: 0.45rem 0.5rem;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .handy-dandy-workbench-history-select:focus {
        outline: none;
      }

      .handy-dandy-workbench-history-select .handy-dandy-workbench-history-name {
        font-weight: 600;
        font-size: 0.95rem;
      }

      .handy-dandy-workbench-history-select .handy-dandy-workbench-history-meta {
        color: var(--color-text-light-6, #bbb);
        font-size: 0.8rem;
      }

      .handy-dandy-workbench-history-delete {
        appearance: none;
        background: transparent;
        border: none;
        border-radius: 0 4px 4px 0;
        color: var(--color-text-light-6, #bbb);
        cursor: pointer;
        padding: 0.35rem;
        transition: color 0.2s ease, background 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .handy-dandy-workbench-history-delete:hover,
      .handy-dandy-workbench-history-delete:focus-visible {
        color: var(--color-text-bright, #f0f0f0);
        background: var(--color-border-dark, rgba(255, 255, 255, 0.12));
        outline: none;
      }

    </style>

    <div class="handy-dandy-workbench-dialog" data-current-entry="${currentEntry.id}">
      <nav class="handy-dandy-workbench-tabs">
        <button type="button" class="handy-dandy-workbench-tab active" data-tab="latest">Latest</button>
        <button type="button" class="handy-dandy-workbench-tab" data-tab="history">History</button>
      </nav>
      <section class="handy-dandy-workbench-panel active" data-panel="latest">
        ${latestMarkup}
      </section>
      <section class="handy-dandy-workbench-panel" data-panel="history">
        <div class="handy-dandy-workbench-history">
          <aside class="handy-dandy-workbench-history-list" data-history-list>
            ${historyListMarkup}
          </aside>
          <div class="handy-dandy-workbench-history-view" data-history-view>${historyPlaceholder}</div>
        </div>
      </section>
    </div>
  `;
}

function buildHistoryListMarkup(activeEntryId?: string): string {
  if (!workbenchHistory.length) {
    return '<p class="handy-dandy-workbench-history-empty">No generations yet.</p>';
  }

  return workbenchHistory
    .map((entry) => {
      const isActive = entry.id === activeEntryId;
      const classes = isActive
        ? "handy-dandy-workbench-history-item active"
        : "handy-dandy-workbench-history-item";
      const name = escapeHtml(entry.result.name.trim() || entry.result.data.name || "Generated Entry");
      const meta = escapeHtml(formatHistoryMeta(entry));
      return `
        <div class="${classes}" data-entry-id="${entry.id}">
          <button type="button" class="handy-dandy-workbench-history-select" data-entry-id="${entry.id}">
            <span class="handy-dandy-workbench-history-name">${name}</span>
            <span class="handy-dandy-workbench-history-meta">${meta}</span>
          </button>
          <button type="button" class="handy-dandy-workbench-history-delete" data-entry-id="${entry.id}" aria-label="Remove from history">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
    })
    .join("");
}

function buildHistoryViewPlaceholder(): string {
  if (!workbenchHistory.length) {
    return '<p class="handy-dandy-workbench-history-empty">No generations yet.</p>';
  }

  return '<p class="notes">Select a previous generation to review its details.</p>';
}

function buildEntryDetailMarkup(entry: WorkbenchHistoryEntry): string {
  const name = escapeHtml(entry.result.name.trim() || entry.result.data.name || "Generated Entry");
  const typeLabel = escapeHtml(formatTypeLabel(entry.result.type));
  const systemLabel = escapeHtml(formatSystemLabel(entry.result.input.systemId));
  const timestamp = escapeHtml(formatTimestamp(entry.timestamp));
  const importLabel = entry.result.type === "actor" ? "Create Actor" : "Import to World";
  const importDisabled = entry.importerAvailable ? "" : " disabled title=\"Import is unavailable for this entry.\"";

  return `
    <header class="handy-dandy-workbench-header">
      <div class="handy-dandy-workbench-heading">
        <h2 class="handy-dandy-workbench-name">${name}</h2>
        <p class="handy-dandy-workbench-meta">${typeLabel}${systemLabel ? ` - ${systemLabel}` : ""} - ${timestamp}</p>
      </div>
      <div class="handy-dandy-workbench-actions">
        <button type="button" class="handy-dandy-workbench-action" data-action="copy" data-entry-id="${entry.id}">
          <i class="fas fa-copy"></i>
          <span>Copy JSON</span>
        </button>
        <button type="button" class="handy-dandy-workbench-action" data-action="download" data-entry-id="${entry.id}">
          <i class="fas fa-download"></i>
          <span>Download</span>
        </button>
        <button type="button" class="handy-dandy-workbench-action" data-action="import" data-entry-id="${entry.id}"${importDisabled}>
          <i class="fas fa-cloud-upload-alt"></i>
          <span>${importLabel}</span>
        </button>
      </div>
    </header>
    <p class="notes">Review the generated JSON below or revisit previous generations from the history tab.</p>
    <textarea class="handy-dandy-workbench-json" rows="16" readonly>${escapeJsonForTextarea(entry.json)}</textarea>
  `;
}

function formatHistoryMeta(entry: WorkbenchHistoryEntry): string {
  const type = formatTypeLabel(entry.result.type);
  const system = formatSystemLabel(entry.result.input.systemId);
  const time = formatTimestamp(entry.timestamp);
  return [type, system, time].filter(Boolean).join(" - ");
}

function formatTypeLabel(type: EntityType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatSystemLabel(systemId: string | undefined): string {
  if (!systemId) {
    return "";
  }

  return systemId.toUpperCase();
}

function formatTimestamp(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString();
}

function setupWorkbenchRequestDialog(html: JQuery): void {
  const root = html[0];
  if (!(root instanceof HTMLElement)) {
    return;
  }

  const container = root.querySelector<HTMLElement>(".handy-dandy-workbench-request");
  if (!container) {
    return;
  }

  const dialogApp = root.closest<HTMLElement>(".window-app");
  const dialogButtons = dialogApp?.querySelector<HTMLElement>(".dialog-buttons");

  const updateDialogButtonsVisibility = (): void => {
    if (!dialogButtons) {
      return;
    }

    const activeTab = container.querySelector<HTMLButtonElement>(".handy-dandy-workbench-tab.active");
    const shouldShowButtons = activeTab?.dataset.tab !== "history";
    dialogButtons.style.display = shouldShowButtons ? "" : "none";
  };

  const entityTypeField = container.querySelector<HTMLSelectElement>("#handy-dandy-workbench-entity-type");
  const scopedFields = Array.from(container.querySelectorAll<HTMLElement>("[data-entity-scope]"));

  const updateScopedFieldVisibility = (): void => {
    const currentType = entityTypeField?.value ?? "";
    for (const field of scopedFields) {
      const scopes = (field.dataset.entityScope ?? "")
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const shouldShow = scopes.includes(currentType);
      field.style.display = shouldShow ? "" : "none";
      field.setAttribute("aria-hidden", shouldShow ? "false" : "true");

      if (field.dataset.entityScope?.includes("item")) {
        const itemSelect = field.querySelector<HTMLSelectElement>("select[name=\"itemType\"]");
        if (itemSelect) {
          itemSelect.required = shouldShow;
        }
      }
    }
  };

  const historyList = container.querySelector<HTMLElement>("[data-history-list]");
  const historyView = container.querySelector<HTMLElement>("[data-history-view]");
  const initialEntry = workbenchHistory[0] ?? null;
  const initialEntryId = initialEntry?.id;

  setCurrentHistoryEntry(container, initialEntryId);
  if (historyList) {
    renderHistoryList(historyList, initialEntryId);
  }
  if (historyView) {
    renderHistoryEntry(historyView, initialEntry);
  }

  updateDialogButtonsVisibility();
  updateScopedFieldVisibility();
  entityTypeField?.addEventListener("change", updateScopedFieldVisibility);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const tabButton = target.closest<HTMLButtonElement>(".handy-dandy-workbench-tab");
    if (tabButton?.dataset.tab) {
      activateWorkbenchTab(container, tabButton.dataset.tab);
      updateDialogButtonsVisibility();
      return;
    }

    const deleteButton = target.closest<HTMLButtonElement>(".handy-dandy-workbench-history-delete");
    if (deleteButton?.dataset.entryId) {
      const removal = removeHistoryEntry(deleteButton.dataset.entryId);
      if (!removal) {
        return;
      }

      const wasActive = container.dataset.currentEntry === deleteButton.dataset.entryId;
      let activeEntry: WorkbenchHistoryEntry | null = null;
      if (wasActive) {
        activeEntry = removal.fallback;
      } else if (container.dataset.currentEntry) {
        activeEntry = resolveHistoryEntry(container.dataset.currentEntry) ?? removal.fallback;
      } else {
        activeEntry = removal.fallback ?? workbenchHistory[0] ?? null;
      }

      const activeEntryId = activeEntry?.id;
      setCurrentHistoryEntry(container, activeEntryId);
      if (historyList) {
        renderHistoryList(historyList, activeEntryId);
      }
      if (historyView) {
        renderHistoryEntry(historyView, activeEntry);
      }
      return;
    }

    const historySelect = target.closest<HTMLButtonElement>(".handy-dandy-workbench-history-select");
    if (historySelect?.dataset.entryId && historyView) {
      const entry = resolveHistoryEntry(historySelect.dataset.entryId);
      if (!entry) {
        return;
      }

      setCurrentHistoryEntry(container, entry.id);
      setActiveHistoryItem(container, entry.id);
      renderHistoryEntry(historyView, entry);
    }
  });
}

function setupWorkbenchResultDialog(html: JQuery, currentEntry: WorkbenchHistoryEntry): void {
  const root = html[0];
  if (!(root instanceof HTMLElement)) {
    return;
  }

  const container = root.querySelector<HTMLElement>(".handy-dandy-workbench-dialog");
  if (!container) {
    return;
  }

  const historyList = container.querySelector<HTMLElement>("[data-history-list]");
  const historyView = container.querySelector<HTMLElement>("[data-history-view]");
  setCurrentHistoryEntry(container, currentEntry.id);
  if (historyList) {
    renderHistoryList(historyList, currentEntry.id);
  }
  if (historyView) {
    renderHistoryEntry(historyView, currentEntry);
  }

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const tabButton = target.closest<HTMLButtonElement>(".handy-dandy-workbench-tab");
    if (tabButton?.dataset.tab) {
      activateWorkbenchTab(container, tabButton.dataset.tab);
      return;
    }

    const deleteButton = target.closest<HTMLButtonElement>(".handy-dandy-workbench-history-delete");
    if (deleteButton?.dataset.entryId) {
      const removal = removeHistoryEntry(deleteButton.dataset.entryId);
      if (!removal) {
        return;
      }

      const wasActive = container.dataset.currentEntry === deleteButton.dataset.entryId;
      let activeEntry: WorkbenchHistoryEntry | null = null;
      if (wasActive) {
        activeEntry = removal.fallback;
      } else if (container.dataset.currentEntry) {
        activeEntry = resolveHistoryEntry(container.dataset.currentEntry) ?? removal.fallback;
      } else {
        activeEntry = removal.fallback ?? workbenchHistory[0] ?? null;
      }

      const activeEntryId = activeEntry?.id;
      setCurrentHistoryEntry(container, activeEntryId);
      if (historyList) {
        renderHistoryList(historyList, activeEntryId);
      }
      if (historyView) {
        renderHistoryEntry(historyView, activeEntry);
      }
      return;
    }

    const actionButton = target.closest<HTMLButtonElement>(".handy-dandy-workbench-action");
    if (actionButton?.dataset.action && actionButton.dataset.entryId) {
      const entry = resolveHistoryEntry(actionButton.dataset.entryId);
      if (entry) {
        void handleWorkbenchAction(actionButton.dataset.action, entry);
      }
      return;
    }

    const historySelect = target.closest<HTMLButtonElement>(".handy-dandy-workbench-history-select");
    if (historySelect?.dataset.entryId && historyView) {
      const entry = resolveHistoryEntry(historySelect.dataset.entryId);
      if (!entry) {
        return;
      }

      setCurrentHistoryEntry(container, entry.id);
      setActiveHistoryItem(container, entry.id);
      renderHistoryEntry(historyView, entry);
      return;
    }
  });
}

function activateWorkbenchTab(container: HTMLElement, tabId: string): void {
  const tabs = container.querySelectorAll<HTMLButtonElement>(".handy-dandy-workbench-tab");
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabId);
  });

  const panels = container.querySelectorAll<HTMLElement>(".handy-dandy-workbench-panel");
  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabId);
  });
}

function setActiveHistoryItem(container: HTMLElement, entryId: string): void {
  const items = container.querySelectorAll<HTMLElement>(".handy-dandy-workbench-history-item");
  items.forEach((item) => {
    item.classList.toggle("active", item.dataset.entryId === entryId);
  });
}

function renderHistoryList(target: HTMLElement, activeEntryId?: string): void {
  target.innerHTML = buildHistoryListMarkup(activeEntryId);
}

function renderHistoryEntry(target: HTMLElement, entry: WorkbenchHistoryEntry | null | undefined): void {
  if (!entry) {
    target.innerHTML = buildHistoryViewPlaceholder();
    return;
  }

  target.innerHTML = buildEntryDetailMarkup(entry);
}

function resolveHistoryEntry(entryId: string): WorkbenchHistoryEntry | undefined {
  return workbenchHistory.find((entry) => entry.id === entryId);
}

function setCurrentHistoryEntry(container: HTMLElement, entryId: string | undefined): void {
  if (entryId) {
    container.dataset.currentEntry = entryId;
  } else {
    delete container.dataset.currentEntry;
  }
}

function removeHistoryEntry(
  entryId: string,
): { removed: WorkbenchHistoryEntry; fallback: WorkbenchHistoryEntry | null } | null {
  const index = workbenchHistory.findIndex((entry) => entry.id === entryId);
  if (index === -1) {
    return null;
  }

  const [removed] = workbenchHistory.splice(index, 1);
  const fallback = workbenchHistory[index] ?? workbenchHistory[index - 1] ?? null;
  void persistWorkbenchHistory();

  return { removed, fallback };
}

async function handleWorkbenchAction(action: string, entry: WorkbenchHistoryEntry): Promise<void> {
  switch (action) {
    case "copy":
      await handleCopyAction(entry);
      break;
    case "download":
      handleDownloadAction(entry);
      break;
    case "import":
      await handleImportAction(entry);
      break;
    default:
      break;
  }
}

async function handleCopyAction(entry: WorkbenchHistoryEntry): Promise<void> {
  try {
    await navigator.clipboard.writeText(entry.json);
    ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Copied JSON to clipboard.`);
  } catch (error) {
    ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Clipboard copy failed.`);
    console.warn(`${CONSTANTS.MODULE_NAME} | Clipboard copy failed`, error);
  }
}

function handleDownloadAction(entry: WorkbenchHistoryEntry): void {
  const filename = resolveFilename(entry.result);
  downloadJson(entry.json, filename);
}

async function handleImportAction(entry: WorkbenchHistoryEntry): Promise<void> {
  if (!entry.importerAvailable || typeof entry.result.importer !== "function") {
    ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Import is not available for this entry.`);
    return;
  }

  try {
    const document = await entry.result.importer();
    const resolvedName = entry.result.name.trim() || entry.result.data.name;
    ui.notifications?.info(
      `${CONSTANTS.MODULE_NAME} | Imported ${resolvedName}${document?.uuid ? ` (${document.uuid})` : ""}.`,
    );
    if (entry.result.type === "actor" && document instanceof Actor) {
      document.sheet?.render(true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Import failed: ${message}`);
    console.error(`${CONSTANTS.MODULE_NAME} | Import failed`, error);
  }
}

function resolveFilename(result: PromptWorkbenchResult<EntityType>): string {
  const slug = (result.data as { slug?: string }).slug;
  const fallback = result.name.trim().toLowerCase().replace(/\s+/g, "-");
  const resolvedSlug = (slug ?? fallback) || "generated-entry";
  const safeSlug = resolvedSlug.replace(/[^a-z0-9-]+/gi, "-");
  return `${safeSlug}.json`;
}

function downloadJson(json: string, filename: string): void {
  const saver = (globalThis as { saveDataToFile?: (data: string, type: string, filename: string) => void }).saveDataToFile;
  if (typeof saver === "function") {
    saver(json, "application/json", filename);
    return;
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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

