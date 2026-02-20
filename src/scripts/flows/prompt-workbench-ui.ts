import { CONSTANTS } from "../constants";
import {
  collectFailureMessages,
  exportSelectedEntities,
  generateWorkbenchEntry,
  DEFAULT_IMAGE_PATH,
  type PromptWorkbenchRequest,
  type PromptWorkbenchResult,
} from "./prompt-workbench";
import type { GenerationProgressUpdate } from "../generation";
import {
  ACTOR_CATEGORIES,
  ITEM_CATEGORIES,
  SYSTEM_IDS,
  type ActorCategory,
  type EntityType,
  type GeneratedEntityMap,
  type ItemCategory,
  type PublicationData,
  type SystemId,
} from "../schemas";
import { fromFoundryActor, type FoundryActor } from "../mappers/export";
import { importAction, importActor, importItem, toFoundryActorDataWithCompendium } from "../mappers/import";
import { ensureValid } from "../validation/ensure-valid";

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
  readonly actorType: string;
  readonly level: string;
  readonly publicationTitle: string;
  readonly publicationAuthors: string;
  readonly publicationLicense: string;
  readonly publicationRemaster: string | null;
  readonly img: string;
  readonly actorImagePath: string;
  readonly actorArtMode: string;
  readonly itemImagePath: string;
  readonly itemArtMode: string;
  readonly itemImagePrompt: string;
  readonly referenceText: string;
  readonly seed: string;
  readonly maxAttempts: string;
  readonly packId: string;
  readonly folderId: string;
  readonly includeSpellcasting: string | null;
  readonly includeInventory: string | null;
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

  let loading: WorkbenchLoadingController | null = null;
  try {
    loading = showGeneratingDialog(request);
    const result = await generateWorkbenchEntry({
      ...request,
      onProgress: (update) => loading?.update(update),
    });
    loading.close();
    loading = null;
    await showWorkbenchResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Prompt workbench failed: ${message}`);
    console.error(`${CONSTANTS.MODULE_NAME} | Prompt workbench failed`, error);
  } finally {
    loading?.close();
  }
}

async function promptWorkbenchRequest(): Promise<PromptWorkbenchRequest<EntityType> | null> {
  const fixedSystemId: SystemId = "pf2e";
  const itemTypeOptions = ITEM_CATEGORIES.map(
    (category) => `<option value="${category}">${formatItemTypeLabel(category)}</option>`
  ).join("");
  const actorTypeOptions = resolveAvailableActorCategories().map(
    (category) => `<option value="${category}"${category === "npc" ? " selected" : ""}>${formatActorTypeLabel(category)}</option>`
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
        min-width: 760px;
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

      .handy-dandy-workbench-quickstart {
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 6px;
        padding: 0.6rem 0.75rem;
        background: linear-gradient(
          140deg,
          rgba(255, 255, 255, 0.06),
          rgba(255, 255, 255, 0.02)
        );
      }

      .handy-dandy-workbench-quickstart-title {
        margin: 0 0 0.45rem;
        font-size: 0.78rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--color-text-light-6, #bbb);
      }

      .handy-dandy-workbench-steps {
        display: grid;
        gap: 0.45rem;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .handy-dandy-workbench-step {
        display: flex;
        gap: 0.45rem;
        align-items: flex-start;
      }

      .handy-dandy-workbench-step-index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.2rem;
        height: 1.2rem;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.14);
        color: var(--color-text-bright, #f0f0f0);
      }

      .handy-dandy-workbench-step-text {
        font-size: 0.84rem;
        color: var(--color-text-light-6, #bbb);
        line-height: 1.25;
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

      .handy-dandy-workbench-form .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
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
        text-transform: uppercase;
        letter-spacing: 0.03em;
        font-size: 0.78rem;
        padding: 0 0.25rem;
      }

      .handy-dandy-workbench-form .notes {
        margin: 0.25rem 0 0;
        font-size: 0.85em;
        color: var(--color-text-light-6, #bbb);
      }

      .handy-dandy-workbench-form textarea {
        min-height: 13rem;
        resize: vertical;
        width: 100%;
      }

      .handy-dandy-workbench-form .form-fields {
        display: grid;
        gap: 0.5rem;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        align-items: center;
      }

      .handy-dandy-workbench-form [data-actor-art-mode] {
        margin-top: 0.5rem;
      }

      .handy-dandy-workbench-art-mode {
        display: grid;
        gap: 0.45rem;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }

      .handy-dandy-workbench-art-choice {
        position: relative;
        display: block;
      }

      .handy-dandy-workbench-art-choice input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .handy-dandy-workbench-art-choice span {
        display: block;
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 6px;
        padding: 0.5rem 0.65rem;
        background: rgba(255, 255, 255, 0.03);
        font-size: 0.88rem;
        font-weight: 600;
        cursor: pointer;
        transition: border-color 0.2s ease, background 0.2s ease;
      }

      .handy-dandy-workbench-art-choice input:checked + span {
        border-color: var(--color-border-highlight, #ff8c00);
        background: rgba(255, 140, 0, 0.18);
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

      @media (max-width: 900px) {
        .handy-dandy-workbench-steps {
          grid-template-columns: 1fr;
        }
      }
    </style>
    <div class="handy-dandy-workbench-request">
      <nav class="handy-dandy-workbench-tabs">
        <button type="button" class="handy-dandy-workbench-tab active" data-tab="prompt">Create</button>
        <button type="button" class="handy-dandy-workbench-tab" data-tab="history">History</button>
      </nav>
      <section class="handy-dandy-workbench-panel active" data-panel="prompt">
        <div class="handy-dandy-workbench-quickstart">
          <p class="handy-dandy-workbench-quickstart-title">Workflow</p>
          <div class="handy-dandy-workbench-steps">
            <div class="handy-dandy-workbench-step">
              <span class="handy-dandy-workbench-step-index">1</span>
              <span class="handy-dandy-workbench-step-text">Select entity type, subtype, and title.</span>
            </div>
            <div class="handy-dandy-workbench-step">
              <span class="handy-dandy-workbench-step-index">2</span>
              <span class="handy-dandy-workbench-step-text">Paste source text and choose art mode.</span>
            </div>
            <div class="handy-dandy-workbench-step">
              <span class="handy-dandy-workbench-step-index">3</span>
              <span class="handy-dandy-workbench-step-text">Generate, review JSON, then import.</span>
            </div>
          </div>
        </div>
        <form class="handy-dandy-workbench-form">
          <fieldset class="form-group">
            <legend>Entry Setup</legend>
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
                <label for="handy-dandy-workbench-system-display">Game System</label>
                <input id="handy-dandy-workbench-system-display" type="text" value="PF2E" disabled />
                <input type="hidden" name="systemId" value="${fixedSystemId}" />
                <p class="notes">Locked to PF2E for prompt workbench generation.</p>
              </div>
              <div data-entity-scope="item">
                <label for="handy-dandy-workbench-item-type">Item Type</label>
                <select id="handy-dandy-workbench-item-type" name="itemType">
                  <option value="">Select a type</option>
                  ${itemTypeOptions}
                </select>
                <p class="notes">Match the Foundry item category for the generated entry.</p>
              </div>
              <div data-entity-scope="actor">
                <label for="handy-dandy-workbench-actor-type">Actor Type</label>
                <select id="handy-dandy-workbench-actor-type" name="actorType">
                  ${actorTypeOptions}
                </select>
                <p class="notes">Select the PF2E actor category the generator should target.</p>
              </div>
              <div>
                <label for="handy-dandy-workbench-title">Title</label>
                <input
                  id="handy-dandy-workbench-title"
                  type="text"
                  name="entryName"
                  placeholder="e.g. Clockwork Exarch"
                  required
                />
              </div>
              <div>
                <label for="handy-dandy-workbench-slug">Slug (optional)</label>
                <input id="handy-dandy-workbench-slug" type="text" name="slug" />
              </div>
              <div data-entity-scope="actor">
                <label for="handy-dandy-workbench-level">Actor Level (optional)</label>
                <input id="handy-dandy-workbench-level" type="number" name="level" min="0" />
              </div>
            </div>
            <p class="notes">Define what to generate before supplying the prompt text.</p>
          </fieldset>

          <fieldset class="form-group">
            <legend>Source Material</legend>
            <label for="handy-dandy-workbench-prompt">Reference Text / Prompt</label>
            <textarea id="handy-dandy-workbench-prompt" name="referenceText" required></textarea>
            <p class="notes">Paste stat blocks, raw notes, or structured direction for generation.</p>
          </fieldset>

          <fieldset class="form-group" data-entity-scope="action">
            <legend>Action Art</legend>
            <label for="handy-dandy-workbench-image">Image Path</label>
            <input id="handy-dandy-workbench-image" type="text" name="img" value="${DEFAULT_IMAGE_PATH}" />
            <p class="notes">Used as the generated action image path.</p>
          </fieldset>

          <fieldset class="form-group" data-entity-scope="item">
            <legend>Item Art</legend>
            <div class="handy-dandy-workbench-art-mode">
              <label class="handy-dandy-workbench-art-choice">
                <input type="radio" name="itemArtMode" value="path" checked />
                <span>Use image path</span>
              </label>
              <label class="handy-dandy-workbench-art-choice">
                <input type="radio" name="itemArtMode" value="generate" />
                <span>Generate transparent item icon</span>
              </label>
            </div>
            <div class="form-group" data-item-art-mode="path">
              <label for="handy-dandy-workbench-item-image">Item Image Path</label>
              <input
                id="handy-dandy-workbench-item-image"
                type="text"
                name="itemImagePath"
                value="${DEFAULT_IMAGE_PATH}"
              />
              <p class="notes">Used when image-path mode is selected.</p>
            </div>
            <div class="form-group" data-item-art-mode="generate">
              <label for="handy-dandy-workbench-item-image-prompt">Item Image Prompt Override (optional)</label>
              <input
                id="handy-dandy-workbench-item-image-prompt"
                type="text"
                name="itemImagePrompt"
                placeholder="Optional art direction for generated item icon"
              />
              <p class="notes">Leave blank to derive icon direction from the generated item description.</p>
            </div>
            <p class="notes">Choose one art mode for items to avoid conflicting image instructions.</p>
          </fieldset>

          <fieldset class="form-group" data-entity-scope="actor">
            <legend>Actor Art</legend>
            <div class="handy-dandy-workbench-art-mode">
              <label class="handy-dandy-workbench-art-choice">
                <input type="radio" name="actorArtMode" value="path" checked />
                <span>Use image path</span>
              </label>
              <label class="handy-dandy-workbench-art-choice">
                <input type="radio" name="actorArtMode" value="token" />
                <span>Generate transparent token</span>
              </label>
            </div>
            <div class="form-group" data-actor-art-mode="path">
              <label for="handy-dandy-workbench-actor-image">Actor Image Path</label>
              <input
                id="handy-dandy-workbench-actor-image"
                type="text"
                name="actorImagePath"
                value="${DEFAULT_IMAGE_PATH}"
              />
              <p class="notes">Used when image-path mode is selected.</p>
            </div>
            <div class="form-group" data-actor-art-mode="token">
              <label for="handy-dandy-workbench-token-prompt">Token Prompt Override (optional)</label>
              <input
                id="handy-dandy-workbench-token-prompt"
                type="text"
                name="tokenPrompt"
                placeholder="Optional art direction for the generated transparent token"
              />
              <p class="notes">Leave blank to derive token style from the actor description.</p>
            </div>
            <p class="notes">Choose one art mode for actors to avoid conflicting image instructions.</p>
          </fieldset>

          <fieldset class="form-group" data-entity-scope="actor">
            <legend>Actor Content</legend>
            <div class="form-fields">
              <label><input type="checkbox" name="includeSpellcasting" /> Spellcasting?</label>
              <label><input type="checkbox" name="includeInventory" /> Inventory?</label>
            </div>
            <p class="notes">Enable extra actor sections in the generated sheet data.</p>
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
                actorType: String(formData.get("actorType") ?? ""),
                level: String(formData.get("level") ?? ""),
                publicationTitle: String(formData.get("publicationTitle") ?? ""),
                publicationAuthors: String(formData.get("publicationAuthors") ?? ""),
                publicationLicense: String(formData.get("publicationLicense") ?? ""),
                publicationRemaster: formData.get("publicationRemaster") as string | null,
                img: String(formData.get("img") ?? ""),
                actorImagePath: String(formData.get("actorImagePath") ?? ""),
                actorArtMode: String(formData.get("actorArtMode") ?? ""),
                itemImagePath: String(formData.get("itemImagePath") ?? ""),
                itemArtMode: String(formData.get("itemArtMode") ?? ""),
                itemImagePrompt: String(formData.get("itemImagePrompt") ?? ""),
                referenceText: String(formData.get("referenceText") ?? ""),
                seed: String(formData.get("seed") ?? ""),
                maxAttempts: String(formData.get("maxAttempts") ?? ""),
                packId: String(formData.get("packId") ?? ""),
                folderId: String(formData.get("folderId") ?? ""),
                includeSpellcasting: formData.get("includeSpellcasting") as string | null,
                includeInventory: formData.get("includeInventory") as string | null,
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

  let actorType: ActorCategory | undefined;
  if (type === "actor") {
    const resolved = sanitizeActorType(response.actorType);
    if (!resolved) {
      ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Select a valid actor type.`);
      return null;
    }
    actorType = resolved;
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

  const actorArtMode = type === "actor" ? sanitizeActorArtMode(response.actorArtMode) : "path";
  if (type === "actor" && !actorArtMode) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Invalid actor art mode.`);
    return null;
  }

  const itemArtMode = type === "item" ? sanitizeItemArtMode(response.itemArtMode) : "path";
  if (type === "item" && !itemArtMode) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Invalid item art mode.`);
    return null;
  }

  const generateTokenImage = type === "actor" && actorArtMode === "token";
  const generateItemImage = type === "item" && itemArtMode === "generate";
  const actorImagePath = response.actorImagePath.trim() || DEFAULT_IMAGE_PATH;
  const itemImagePath = response.itemImagePath.trim() || DEFAULT_IMAGE_PATH;
  const img = type === "actor"
    ? (generateTokenImage ? undefined : actorImagePath)
    : type === "item"
      ? (generateItemImage ? undefined : itemImagePath)
      : (response.img.trim() || DEFAULT_IMAGE_PATH);
  const tokenPrompt = generateTokenImage ? response.tokenPrompt.trim() || undefined : undefined;
  const itemImagePrompt = generateItemImage ? response.itemImagePrompt.trim() || undefined : undefined;

  return {
    type,
    systemId,
    entryName,
    referenceText,
    slug: response.slug.trim() || undefined,
    itemType,
    actorType,
    level: parseOptionalNumber(response.level),
    seed: parseOptionalNumber(response.seed),
    maxAttempts: parseOptionalNumber(response.maxAttempts),
    packId: response.packId.trim() || undefined,
    folderId: response.folderId.trim() || undefined,
    publication,
    img,
    includeSpellcasting: type === "actor" && response.includeSpellcasting ? true : undefined,
    includeInventory: type === "actor" && response.includeInventory ? true : undefined,
    generateTokenImage: generateTokenImage ? true : undefined,
    generateItemImage: generateItemImage ? true : undefined,
    tokenPrompt,
    itemImagePrompt,
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

function sanitizeActorType(value: string): ActorCategory | null {
  const normalized = value.trim().toLowerCase();
  return ACTOR_CATEGORIES.includes(normalized as ActorCategory)
    ? (normalized as ActorCategory)
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

function sanitizeActorArtMode(value: string): "path" | "token" | null {
  switch (value.trim().toLowerCase()) {
    case "path":
    case "token":
      return value.trim().toLowerCase() as "path" | "token";
    default:
      return null;
  }
}

function sanitizeItemArtMode(value: string): "path" | "generate" | null {
  switch (value.trim().toLowerCase()) {
    case "path":
    case "generate":
      return value.trim().toLowerCase() as "path" | "generate";
    default:
      return null;
  }
}

function formatItemTypeLabel(value: ItemCategory): string {
  return value
    .split(/[-_]/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function formatActorTypeLabel(value: ActorCategory): string {
  return value
    .split(/[-_]/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function resolveAvailableActorCategories(): ActorCategory[] {
  const actorTypes = (game.system as { documentTypes?: { Actor?: unknown } } | undefined)?.documentTypes?.Actor;
  if (!Array.isArray(actorTypes)) {
    return [...ACTOR_CATEGORIES];
  }

  const supportedTypes = actorTypes
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter((value): value is ActorCategory => ACTOR_CATEGORIES.includes(value as ActorCategory));
  if (!supportedTypes.length) {
    return [...ACTOR_CATEGORIES];
  }

  return Array.from(new Set(supportedTypes));
}

type LoadingStep = {
  key: GenerationProgressUpdate["step"];
  label: string;
};

interface WorkbenchLoadingController {
  update: (update: GenerationProgressUpdate) => void;
  close: () => void;
}

function buildLoadingSteps(request: PromptWorkbenchRequest<EntityType>): LoadingStep[] {
  const steps: LoadingStep[] = [
    { key: "prompt", label: "Preparing prompt" },
    { key: "model", label: "Generating JSON draft" },
    { key: "validation", label: "Validating and repairing data" },
  ];

  if (request.type === "actor") {
    if (request.generateTokenImage) {
      steps.push({ key: "image", label: "Generating transparent token image" });
    }
    steps.push({ key: "mapping", label: "Resolving PF2E links and finalizing sheet data" });
  } else if (request.type === "item" && request.generateItemImage) {
    steps.push({ key: "image", label: "Generating transparent item icon" });
  }

  return steps;
}

function applyLoadingProgress(
  root: HTMLElement,
  steps: readonly LoadingStep[],
  update: GenerationProgressUpdate,
): void {
  const messageNode = root.querySelector<HTMLElement>("[data-loading-message]");
  if (messageNode) {
    messageNode.textContent = update.message;
  }

  const stepIndex = steps.findIndex((step) => step.key === update.step);
  const allSteps = Array.from(root.querySelectorAll<HTMLElement>("[data-loading-step]"));
  for (const element of allSteps) {
    const index = Number(element.dataset.stepIndex ?? "-1");
    element.classList.remove("is-active", "is-complete");
    if (stepIndex >= 0 && index < stepIndex) {
      element.classList.add("is-complete");
    } else if (stepIndex >= 0 && index === stepIndex) {
      element.classList.add("is-active");
    }
  }
}

function showGeneratingDialog(request: PromptWorkbenchRequest<EntityType>): WorkbenchLoadingController {
  const entryName = request.entryName.trim() || "entry";
  const safeEntryName = escapeHtml(entryName);
  const loadingSteps = buildLoadingSteps(request);
  const loadingList = loadingSteps
    .map((step, index) => `<li data-loading-step data-step-index="${index}">${escapeHtml(step.label)}</li>`)
    .join("");
  const content = `
    <style>
      .handy-dandy-workbench-loading-steps {
        margin: 0.35rem 0 0.5rem 1.25rem;
        padding: 0;
        display: grid;
        gap: 0.15rem;
      }
      .handy-dandy-workbench-loading-steps li.is-active {
        font-weight: 700;
      }
      .handy-dandy-workbench-loading-steps li.is-complete {
        opacity: 0.7;
      }
    </style>
    <div class="handy-dandy-workbench-loading" data-loading-root>
      <p><i class="fas fa-spinner fa-spin"></i> Generating ${safeEntryName}...</p>
      <p data-loading-message class="notes">Preparing prompt...</p>
      <ol class="handy-dandy-workbench-loading-steps">${loadingList}</ol>
      <p data-loading-elapsed class="notes">Elapsed: 0s</p>
    </div>
  `;

  let root: HTMLElement | null = null;
  let intervalId: number | null = null;
  let closed = false;
  let latestProgress: GenerationProgressUpdate = {
    step: "prompt",
    message: "Preparing prompt...",
    percent: 0,
  };
  const startTime = Date.now();

  const refreshElapsed = (): void => {
    if (!root) return;
    const elapsedNode = root.querySelector<HTMLElement>("[data-loading-elapsed]");
    if (!elapsedNode) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
    elapsedNode.textContent = `Elapsed: ${elapsed}s`;
  };

  const update = (progress: GenerationProgressUpdate): void => {
    latestProgress = progress;
    if (!root) return;
    applyLoadingProgress(root, loadingSteps, latestProgress);
  };

  const dialog = new Dialog({
    title: `${CONSTANTS.MODULE_NAME} | Working`,
    content,
    buttons: {},
    close: () => {
      /* no-op while loading */
    },
  }, { jQuery: true });

  const hookId = Hooks.on("renderDialog", (app: Dialog, html: JQuery) => {
    if (app !== dialog) {
      return;
    }

    Hooks.off("renderDialog", hookId);
    root = html[0]?.querySelector<HTMLElement>("[data-loading-root]") ?? null;
    if (!root) {
      return;
    }

    applyLoadingProgress(root, loadingSteps, latestProgress);
    refreshElapsed();
    intervalId = window.setInterval(refreshElapsed, 1000);
  });

  dialog.render(true);
  return {
    update,
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      dialog.close({ force: true });
    },
  };
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

function toGeneratedActorResultFromFoundry(
  source: GeneratedEntityMap["actor"],
  foundry: Awaited<ReturnType<typeof toFoundryActorDataWithCompendium>>,
): GeneratedEntityMap["actor"] {
  return {
    schema_version: source.schema_version,
    systemId: source.systemId,
    slug: source.slug,
    name: foundry.name,
    type: foundry.type as GeneratedEntityMap["actor"]["type"],
    img: foundry.img,
    system: foundry.system,
    prototypeToken: foundry.prototypeToken,
    items: foundry.items,
    effects: foundry.effects,
    folder: (foundry.folder ?? null) as GeneratedEntityMap["actor"]["folder"],
    flags: (foundry.flags ?? {}) as GeneratedEntityMap["actor"]["flags"],
  } satisfies GeneratedEntityMap["actor"];
}

async function repairGeneratedData(
  type: EntityType,
  data: GeneratedEntityMap[EntityType],
): Promise<GeneratedEntityMap[EntityType]> {
  const gptClient = game.handyDandy?.gptClient ?? undefined;

  switch (type) {
    case "action": {
      const repaired = await ensureValid({
        type: "action",
        payload: data,
        gptClient,
      });
      return repaired as GeneratedEntityMap[EntityType];
    }
    case "item": {
      const repaired = await ensureValid({
        type: "item",
        payload: data,
        gptClient,
      });
      return repaired as GeneratedEntityMap[EntityType];
    }
    case "actor": {
      const actorData = data as GeneratedEntityMap["actor"];
      const canonicalDraft = fromFoundryActor(actorData as unknown as FoundryActor);
      const canonical = await ensureValid({
        type: "actor",
        payload: canonicalDraft,
        gptClient,
      });
      const foundry = await toFoundryActorDataWithCompendium(canonical);
      return toGeneratedActorResultFromFoundry(actorData, foundry) as GeneratedEntityMap[EntityType];
    }
    default:
      return data;
  }
}

function replaceHistoryEntry(
  updated: WorkbenchHistoryEntry,
): void {
  const index = workbenchHistory.findIndex((entry) => entry.id === updated.id);
  if (index === -1) {
    workbenchHistory.unshift(updated);
    if (workbenchHistory.length > WORKBENCH_HISTORY_LIMIT) {
      workbenchHistory.length = WORKBENCH_HISTORY_LIMIT;
    }
  } else {
    workbenchHistory.splice(index, 1, updated);
  }

  void persistWorkbenchHistory();
}

async function repairHistoryEntry(
  entry: WorkbenchHistoryEntry,
): Promise<WorkbenchHistoryEntry> {
  const repairedData = await repairGeneratedData(entry.result.type, entry.result.data);
  const importer = createHistoryImporter(entry.result.type, repairedData);
  const resolvedName = repairedData.name?.trim() || entry.result.name;

  const updated: WorkbenchHistoryEntry = {
    id: entry.id,
    timestamp: Date.now(),
    importerAvailable: typeof importer === "function",
    json: JSON.stringify(repairedData, null, 2),
    result: {
      ...entry.result,
      name: resolvedName,
      data: repairedData,
      importer,
    },
  };

  replaceHistoryEntry(updated);
  return updated;
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
        <button type="button" class="handy-dandy-workbench-action" data-action="repair" data-entry-id="${entry.id}">
          <i class="fas fa-tools"></i>
          <span>Repair JSON</span>
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
  const actorArtModeInputs = Array.from(
    container.querySelectorAll<HTMLInputElement>("input[name=\"actorArtMode\"]"),
  );
  const actorArtModeSections = Array.from(
    container.querySelectorAll<HTMLElement>("[data-actor-art-mode]"),
  );
  const itemArtModeInputs = Array.from(
    container.querySelectorAll<HTMLInputElement>("input[name=\"itemArtMode\"]"),
  );
  const itemArtModeSections = Array.from(
    container.querySelectorAll<HTMLElement>("[data-item-art-mode]"),
  );
  const actorImagePathField = container.querySelector<HTMLInputElement>("input[name=\"actorImagePath\"]");
  const tokenPromptField = container.querySelector<HTMLInputElement>("input[name=\"tokenPrompt\"]");
  const itemImagePathField = container.querySelector<HTMLInputElement>("input[name=\"itemImagePath\"]");
  const itemImagePromptField = container.querySelector<HTMLInputElement>("input[name=\"itemImagePrompt\"]");

  const updateActorArtModeVisibility = (): void => {
    const currentType = entityTypeField?.value ?? "";
    const isActor = currentType === "actor";
    const selectedMode = actorArtModeInputs.find((input) => input.checked)?.value ?? "path";

    for (const section of actorArtModeSections) {
      const shouldShow = isActor && section.dataset.actorArtMode === selectedMode;
      section.style.display = shouldShow ? "" : "none";
      section.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    }

    if (actorImagePathField) {
      actorImagePathField.required = isActor && selectedMode === "path";
      actorImagePathField.disabled = !isActor || selectedMode !== "path";
    }

    if (tokenPromptField) {
      tokenPromptField.disabled = !isActor || selectedMode !== "token";
    }
  };

  const updateItemArtModeVisibility = (): void => {
    const currentType = entityTypeField?.value ?? "";
    const isItem = currentType === "item";
    const selectedMode = itemArtModeInputs.find((input) => input.checked)?.value ?? "path";

    for (const section of itemArtModeSections) {
      const shouldShow = isItem && section.dataset.itemArtMode === selectedMode;
      section.style.display = shouldShow ? "" : "none";
      section.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    }

    if (itemImagePathField) {
      itemImagePathField.required = isItem && selectedMode === "path";
      itemImagePathField.disabled = !isItem || selectedMode !== "path";
    }

    if (itemImagePromptField) {
      itemImagePromptField.disabled = !isItem || selectedMode !== "generate";
    }
  };

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
          itemSelect.disabled = !shouldShow;
        }
      }

      if (field.dataset.entityScope?.includes("actor")) {
        const actorSelect = field.querySelector<HTMLSelectElement>("select[name=\"actorType\"]");
        if (actorSelect) {
          actorSelect.required = shouldShow;
          actorSelect.disabled = !shouldShow;
        }
      }
    }

    updateActorArtModeVisibility();
    updateItemArtModeVisibility();
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
  for (const input of actorArtModeInputs) {
    input.addEventListener("change", updateActorArtModeVisibility);
  }
  for (const input of itemArtModeInputs) {
    input.addEventListener("change", updateItemArtModeVisibility);
  }

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

    const actionButton = target.closest<HTMLButtonElement>(".handy-dandy-workbench-action");
    if (actionButton?.dataset.action && actionButton.dataset.entryId) {
      const entry = resolveHistoryEntry(actionButton.dataset.entryId);
      if (entry) {
        void handleWorkbenchAction(actionButton.dataset.action, entry, container);
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
        void handleWorkbenchAction(actionButton.dataset.action, entry, container);
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

async function handleWorkbenchAction(
  action: string,
  entry: WorkbenchHistoryEntry,
  container?: HTMLElement,
): Promise<void> {
  switch (action) {
    case "copy":
      await handleCopyAction(entry);
      break;
    case "download":
      handleDownloadAction(entry);
      break;
    case "repair":
      await handleRepairAction(entry, container);
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

function refreshHistoryViews(container: HTMLElement, preferredEntryId: string): void {
  const historyList = container.querySelector<HTMLElement>("[data-history-list]");
  const historyView = container.querySelector<HTMLElement>("[data-history-view]");
  const latestPanel = container.querySelector<HTMLElement>("[data-panel=\"latest\"]");
  const activeEntry = resolveHistoryEntry(preferredEntryId) ?? workbenchHistory[0] ?? null;
  const activeEntryId = activeEntry?.id;

  setCurrentHistoryEntry(container, activeEntryId);
  if (activeEntryId) {
    setActiveHistoryItem(container, activeEntryId);
  }

  if (historyList) {
    renderHistoryList(historyList, activeEntryId);
  }
  if (historyView) {
    renderHistoryEntry(historyView, activeEntry);
  }
  if (latestPanel && activeEntry) {
    latestPanel.innerHTML = buildEntryDetailMarkup(activeEntry);
  }
}

async function handleRepairAction(entry: WorkbenchHistoryEntry, container?: HTMLElement): Promise<void> {
  try {
    const repaired = await repairHistoryEntry(entry);
    ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Repaired generation JSON for ${repaired.result.name}.`);
    if (container) {
      refreshHistoryViews(container, repaired.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Repair failed: ${message}`);
    console.error(`${CONSTANTS.MODULE_NAME} | Repair failed`, error);
  }
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

