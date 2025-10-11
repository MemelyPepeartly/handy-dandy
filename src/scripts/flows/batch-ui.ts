import { CONSTANTS } from "../constants";
import {
  collectFailureMessages,
  exportSelectedEntities,
  generateAndImportBatch,
  type GenerationBatchEntry,
  type GenerationBatchOptions,
  type GenerationBatchResult,
} from "./batch";
import type { EntityType } from "../schemas";

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

export async function runBatchGenerationFlow(): Promise<void> {
  const request = await promptBatchGeneration();
  if (!request) {
    return;
  }

  try {
    const result = await generateAndImportBatch(request);
    reportGenerationResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Batch generation failed: ${message}`);
    console.error(`${CONSTANTS.MODULE_NAME} | Batch generation failed`, error);
  }
}

async function promptBatchGeneration(): Promise<GenerationBatchOptions<EntityType> | null> {
  const content = `
    <form class="handy-dandy-batch-form">
      <div class="form-group">
        <label>Entity Type</label>
        <select name="entityType">
          <option value="action">Action</option>
          <option value="item">Item</option>
          <option value="actor">Actor</option>
        </select>
      </div>
      <div class="form-group">
        <label>Prompt Inputs (JSON Array)</label>
        <textarea name="payload" rows="8" style="width: 100%;"></textarea>
      </div>
      <div class="form-group">
        <label>Compendium Pack ID (optional)</label>
        <input type="text" name="packId" />
      </div>
      <div class="form-group">
        <label>Folder ID (optional)</label>
        <input type="text" name="folderId" />
      </div>
      <div class="form-group">
        <label>Seed (optional)</label>
        <input type="number" name="seed" />
      </div>
      <div class="form-group">
        <label>Max Attempts (optional)</label>
        <input type="number" name="maxAttempts" min="1" />
      </div>
    </form>
  `;

  const response = await Dialog.prompt<
    {
      entityType: string;
      payload: string;
      packId: string;
      folderId: string;
      seed: string;
      maxAttempts: string;
    } | null,
    undefined,
    { jQuery: true }
  >({
    title: `${CONSTANTS.MODULE_NAME} | Batch Generate`,
    content,
    label: "Run Batch",
    callback: (html) => {
      const form = html[0]?.querySelector("form");
      if (!form) {
        return null;
      }

      const formData = new FormData(form as HTMLFormElement);
      const entityType = String(formData.get("entityType") ?? "");
      const payload = String(formData.get("payload") ?? "");
      const packId = String(formData.get("packId") ?? "").trim();
      const folderId = String(formData.get("folderId") ?? "").trim();
      const seed = String(formData.get("seed") ?? "").trim();
      const maxAttempts = String(formData.get("maxAttempts") ?? "").trim();

      return { entityType, payload, packId, folderId, seed, maxAttempts };
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

  let inputs: unknown;
  try {
    inputs = response.payload ? JSON.parse(response.payload) : [];
  } catch (error) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Failed to parse JSON: ${(error as Error).message}`);
    return null;
  }

  if (!Array.isArray(inputs)) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Prompt input must be an array.`);
    return null;
  }

  return {
    type,
    inputs: inputs as GenerationBatchOptions<EntityType>["inputs"],
    packId: response.packId || undefined,
    folderId: response.folderId || undefined,
    seed: parseOptionalNumber(response.seed),
    maxAttempts: parseOptionalNumber(response.maxAttempts),
  } satisfies GenerationBatchOptions<EntityType>;
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

function reportGenerationResult(result: GenerationBatchResult<EntityType>): void {
  const prefix = `${CONSTANTS.MODULE_NAME} |`;
  const summary = result.summary;
  const failures = collectFailureMessages(result.entries as GenerationBatchEntry<EntityType>[]);

  if (result.successCount > 0) {
    ui.notifications?.info(`${prefix} ${summary}`);
  } else {
    ui.notifications?.warn(`${prefix} ${summary}`);
  }

  if (failures.length) {
    ui.notifications?.warn(`${prefix} ${failures.length} batch item(s) failed. Check console for details.`);
    console.warn(`${CONSTANTS.MODULE_NAME} | Batch generation failures`, failures);
  }
}
