import { CONSTANTS } from "../constants";
import {
  collectFailureMessages,
  exportSelectedEntities,
  generateWorkbenchEntry,
  type PromptWorkbenchRequest,
  type PromptWorkbenchResult,
} from "./prompt-workbench";
import { SYSTEM_IDS, type EntityType, type SystemId } from "../schemas";

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

  try {
    const result = await generateWorkbenchEntry(request);
    await showWorkbenchResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Prompt workbench failed: ${message}`);
    console.error(`${CONSTANTS.MODULE_NAME} | Prompt workbench failed`, error);
  }
}

async function promptWorkbenchRequest(): Promise<PromptWorkbenchRequest<EntityType> | null> {
  const systemOptions = SYSTEM_IDS.map((id) => `<option value="${id}">${id.toUpperCase()}</option>`).join("");
  const content = `
    <form class="handy-dandy-workbench-form">
      <div class="form-group">
        <label>Entity Type</label>
        <select name="entityType">
          <option value="action">Action</option>
          <option value="item">Item</option>
          <option value="actor">Actor</option>
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
        <p class="notes">Use the action title, item name, or actor name you want in Foundry.</p>
      </div>
      <div class="form-group">
        <label>Slug (optional)</label>
        <input type="text" name="slug" />
      </div>
      <div class="form-group">
        <label>Reference Text or Prompt</label>
        <textarea name="referenceText" rows="8" style="width: 100%;" required></textarea>
        <p class="notes">Paste rules text, stat blocks, or a creative prompt for the generator to follow.</p>
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
    </form>
  `;

  const response = await Dialog.prompt<
    {
      entityType: string;
      systemId: string;
      entryName: string;
      slug: string;
      referenceText: string;
      seed: string;
      maxAttempts: string;
      packId: string;
      folderId: string;
    } | null,
    undefined,
    { jQuery: true }
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
        referenceText: String(formData.get("referenceText") ?? ""),
        seed: String(formData.get("seed") ?? ""),
        maxAttempts: String(formData.get("maxAttempts") ?? ""),
        packId: String(formData.get("packId") ?? ""),
        folderId: String(formData.get("folderId") ?? ""),
      };
    },
    options: { jQuery: true },
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

async function showWorkbenchResult(result: PromptWorkbenchResult<EntityType>): Promise<void> {
  const json = JSON.stringify(result.data, null, 2);
  const escaped = escapeJsonForTextarea(json);
  const importerAvailable = typeof result.importer === "function";

  const content = `
    <form class="handy-dandy-workbench-result">
      <p class="notes">Review the generated JSON below. Use the buttons to copy, download, or import.</p>
      <textarea name="generatedJson" rows="16" readonly style="width: 100%;">${escaped}</textarea>
    </form>
  `;

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title: `${CONSTANTS.MODULE_NAME} | ${result.name}`,
      content,
      buttons: buildResultButtons(result, json, importerAvailable),
      close: () => resolve(),
      default: "close",
    }, { jQuery: true });

    dialog.render(true);
  });
}

function escapeJsonForTextarea(json: string): string {
  const utils = foundry.utils as { escapeHTML?: (value: string) => string };
  if (typeof utils.escapeHTML === "function") {
    return utils.escapeHTML(json);
  }

  const div = document.createElement("div");
  div.textContent = json;
  return div.innerHTML;
}

function buildResultButtons(
  result: PromptWorkbenchResult<EntityType>,
  json: string,
  importerAvailable: boolean,
): Record<string, Dialog.Button> {
  const filenameSlug = result.data.slug || result.name.toLowerCase().replace(/\s+/g, "-");
  const filename = `${filenameSlug || "generated-entry"}.json`;

  const buttons: Record<string, Dialog.Button> = {
    copy: {
      icon: "fas fa-copy",
      label: "Copy JSON",
      callback: async () => {
        try {
          await navigator.clipboard.writeText(json);
          ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Copied JSON to clipboard.`);
        } catch (error) {
          ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Clipboard copy failed.`);
          console.warn(`${CONSTANTS.MODULE_NAME} | Clipboard copy failed`, error);
        }
      },
    },
    download: {
      icon: "fas fa-download",
      label: "Download JSON",
      callback: () => {
        downloadJson(json, filename);
      },
    },
    close: {
      icon: "fas fa-check",
      label: "Close",
    },
  };

  if (importerAvailable && result.importer) {
    buttons.import = {
      icon: "fas fa-cloud-upload-alt",
      label: "Import to World",
      callback: async () => {
        try {
          const document = await result.importer?.();
          const resolvedName = result.name.trim() || result.data.name;
          ui.notifications?.info(
            `${CONSTANTS.MODULE_NAME} | Imported ${resolvedName}${document?.uuid ? ` (${document.uuid})` : ""}.`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Import failed: ${message}`);
          console.error(`${CONSTANTS.MODULE_NAME} | Import failed`, error);
        }
      },
    } satisfies Dialog.Button;
  }

  return buttons;
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

