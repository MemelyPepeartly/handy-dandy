import { CONSTANTS } from "../constants";
import {
  collectFailureMessages,
  exportSelectedEntities,
  generateWorkbenchEntry,
  DEFAULT_IMAGE_PATH,
  type PromptWorkbenchRequest,
  type PromptWorkbenchResult,
} from "./prompt-workbench";
import { SYSTEM_IDS, type EntityType, type PublicationData, type SystemId } from "../schemas";

interface WorkbenchHistoryEntry {
  readonly id: string;
  readonly result: PromptWorkbenchResult<EntityType>;
  readonly json: string;
  readonly importerAvailable: boolean;
  readonly timestamp: number;
}

const WORKBENCH_HISTORY_LIMIT = 12;
const workbenchHistory: WorkbenchHistoryEntry[] = [];

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
  const content = `
    <style>
      .handy-dandy-workbench-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 640px;
      }

      .handy-dandy-workbench-grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .handy-dandy-workbench-form fieldset {
        margin: 0;
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
    </style>
    <form class="handy-dandy-workbench-form">
      <div class="handy-dandy-workbench-grid">
        <div class="form-group">
          <label>Entity Type</label>
          <select name="entityType">
            <option value="actor">Actor</option>
            <option value="action">Action</option>
            <option value="item">Item</option>
          </select>
        </div>
        <div class="form-group">
          <label>Game System</label>
          <select name="systemId">
            ${systemOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Name / Title</label>
          <input type="text" name="entryName" required />
          <p class="notes">Use the actor name, action title, or item name you want in Foundry.</p>
        </div>
        <div class="form-group">
          <label>Slug (optional)</label>
          <input type="text" name="slug" />
        </div>
      </div>
      <fieldset class="form-group">
        <legend>Publication Details</legend>
        <div class="form-fields">
          <label>Title <input type="text" name="publicationTitle" value="" /></label>
          <label>Authors <input type="text" name="publicationAuthors" value="" /></label>
          <label>License <input type="text" name="publicationLicense" value="OGL" /></label>
          <label><input type="checkbox" name="publicationRemaster" /> Remaster</label>
        </div>
      </fieldset>
      <div class="handy-dandy-workbench-grid">
        <div class="form-group">
          <label>Image Path</label>
          <input type="text" name="img" value="${DEFAULT_IMAGE_PATH}" />
          <p class="notes">Provide a Foundry asset path or URL for the generated image.</p>
        </div>
        <fieldset class="form-group">
          <legend>Advanced Options</legend>
          <div class="form-fields">
            <label>Seed <input type="number" name="seed" /></label>
            <label>Max Attempts <input type="number" name="maxAttempts" min="1" /></label>
            <label>Compendium Pack ID <input type="text" name="packId" /></label>
            <label>Folder ID <input type="text" name="folderId" /></label>
          </div>
        </fieldset>
      </div>
      <div class="form-group">
        <label>Reference Text or Prompt</label>
        <textarea name="referenceText" required></textarea>
        <p class="notes">Paste rules text, stat blocks, or a creative prompt for the generator to follow.</p>
      </div>
    </form>
  `;

  const response = await Dialog.prompt<
    {
      entityType: string;
      systemId: string;
      entryName: string;
      slug: string;
      publicationTitle: string;
      publicationAuthors: string;
      publicationLicense: string;
      publicationRemaster: string | null;
      img: string;
      referenceText: string;
      seed: string;
      maxAttempts: string;
      packId: string;
      folderId: string;
    } | null,
    undefined,
    Partial<Dialog.Options>
  >({
    title: `${CONSTANTS.MODULE_NAME} | Prompt Workbench`,
    content,
    label: "Generate",
    callback: (html) => {
      const form = html[0]?.querySelector("form");
      if (!form) {
        return null;
      }

      const formData = new FormData(form as HTMLFormElement);
      return {
        entityType: String(formData.get("entityType") ?? ""),
        systemId: String(formData.get("systemId") ?? ""),
        entryName: String(formData.get("entryName") ?? ""),
        slug: String(formData.get("slug") ?? ""),
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
      };
    },
    options: { jQuery: true, width: 680 },
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
    seed: parseOptionalNumber(response.seed),
    maxAttempts: parseOptionalNumber(response.maxAttempts),
    packId: response.packId.trim() || undefined,
    folderId: response.folderId.trim() || undefined,
    publication,
    img,
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

  return entry;
}

function createHistoryId(): string {
  return `history-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildWorkbenchDialogContent(currentEntry: WorkbenchHistoryEntry): string {
  const latestMarkup = buildEntryDetailMarkup(currentEntry);
  const historyListMarkup = buildHistoryListMarkup(currentEntry);

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
        display: flex;
        gap: 1rem;
        min-height: 18rem;
      }

      .handy-dandy-workbench-history-list {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        width: 240px;
        max-height: 24rem;
        overflow-y: auto;
      }

      .handy-dandy-workbench-history-item {
        appearance: none;
        background: var(--color-bg-alt, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 6px;
        color: inherit;
        cursor: pointer;
        display: block;
        padding: 0.45rem 0.6rem;
        text-align: left;
        transition: border-color 0.2s ease, background 0.2s ease;
      }

      .handy-dandy-workbench-history-item.active {
        border-color: var(--color-border-highlight, #ff8c00);
        background: var(--color-border-light-1, rgba(255, 255, 255, 0.12));
      }

      .handy-dandy-workbench-history-name {
        display: block;
        font-weight: 600;
        margin-bottom: 0.2rem;
      }

      .handy-dandy-workbench-history-meta {
        color: var(--color-text-light-6, #bbb);
        display: block;
        font-size: 0.85rem;
      }

      .handy-dandy-workbench-history-view {
        border: 1px solid var(--color-border-dark, #333);
        border-radius: 6px;
        flex: 1;
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
          <aside class="handy-dandy-workbench-history-list">
            ${historyListMarkup}
          </aside>
          <div class="handy-dandy-workbench-history-view" data-history-view>
            <p class="notes">Select a previous generation to review its details.</p>
          </div>
        </div>
      </section>
    </div>
  `;
}

function buildHistoryListMarkup(currentEntry: WorkbenchHistoryEntry): string {
  if (!workbenchHistory.length) {
    return '<p class="handy-dandy-workbench-history-empty">No generations yet.</p>';
  }

  return workbenchHistory
    .map((entry) => {
      const isActive = entry.id === currentEntry.id;
      const classes = isActive
        ? "handy-dandy-workbench-history-item active"
        : "handy-dandy-workbench-history-item";
      const name = escapeHtml(entry.result.name.trim() || entry.result.data.name || "Generated Entry");
      const meta = escapeHtml(formatHistoryMeta(entry));
      return `
        <button type="button" class="${classes}" data-entry-id="${entry.id}">
          <span class="handy-dandy-workbench-history-name">${name}</span>
          <span class="handy-dandy-workbench-history-meta">${meta}</span>
        </button>
      `;
    })
    .join("");
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
        <p class="handy-dandy-workbench-meta">${typeLabel}${systemLabel ? ` • ${systemLabel}` : ""} • ${timestamp}</p>
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
  return [type, system, time].filter(Boolean).join(" • ");
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

function setupWorkbenchResultDialog(html: JQuery, currentEntry: WorkbenchHistoryEntry): void {
  const root = html[0];
  if (!(root instanceof HTMLElement)) {
    return;
  }

  const container = root.querySelector<HTMLElement>(".handy-dandy-workbench-dialog");
  if (!container) {
    return;
  }

  const historyView = container.querySelector<HTMLElement>("[data-history-view]");
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

    const actionButton = target.closest<HTMLButtonElement>(".handy-dandy-workbench-action");
    if (actionButton?.dataset.action && actionButton.dataset.entryId) {
      const entry = resolveHistoryEntry(actionButton.dataset.entryId);
      if (entry) {
        void handleWorkbenchAction(actionButton.dataset.action, entry);
      }
      return;
    }

    const historyButton = target.closest<HTMLButtonElement>(".handy-dandy-workbench-history-item");
    if (historyButton?.dataset.entryId && historyView) {
      const entry = resolveHistoryEntry(historyButton.dataset.entryId);
      if (!entry) {
        return;
      }

      setActiveHistoryButton(container, historyButton.dataset.entryId);
      renderHistoryEntry(historyView, entry);
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

function setActiveHistoryButton(container: HTMLElement, entryId: string): void {
  const buttons = container.querySelectorAll<HTMLButtonElement>(".handy-dandy-workbench-history-item");
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.entryId === entryId);
  });
}

function renderHistoryEntry(target: HTMLElement, entry: WorkbenchHistoryEntry): void {
  target.innerHTML = buildEntryDetailMarkup(entry);
}

function resolveHistoryEntry(entryId: string): WorkbenchHistoryEntry | undefined {
  return workbenchHistory.find((entry) => entry.id === entryId);
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

