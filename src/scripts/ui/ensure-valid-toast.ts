import { CONSTANTS } from "../constants";
import type { EntityType, SchemaDataFor } from "../schemas";
import type { EnsureValidError } from "../validation/ensure-valid";
import type { ImporterOptions } from "../flows/batch";

interface EnsureValidRetryToastOptions<T extends EntityType> {
  type: T;
  name: string;
  error: EnsureValidError<T>;
  importer: (json: SchemaDataFor<T>, options: ImporterOptions) => Promise<unknown>;
  importerOptions: ImporterOptions;
  registerHandler?: (handler: () => Promise<void>) => void;
}

const createId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

export function createEnsureValidRetryHandler<T extends EntityType>(
  options: EnsureValidRetryToastOptions<T>,
): () => Promise<void> {
  const { error, importer, importerOptions, name, type } = options;

  return async () => {
    try {
      const repaired = await error.repair();
      await importer(repaired, importerOptions);
      ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Repaired ${type} "${name}" successfully.`);
    } catch (repairError) {
      const message = repairError instanceof Error ? repairError.message : String(repairError);
      ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Repair attempt failed: ${message}`);
      console.error(`${CONSTANTS.MODULE_NAME} | Repair attempt failed`, repairError);
      throw repairError;
    }
  };
}

export function showEnsureValidRetryToast<T extends EntityType>(
  options: EnsureValidRetryToastOptions<T>,
): void {
  const id = createId();
  const message = `${CONSTANTS.MODULE_NAME} | Failed to import ${options.type} "${options.name}". `;
  const html = `${message}<button type="button" class="handy-dandy-retry" data-retry-id="${id}">Retry with repair</button>`;

  ui.notifications?.error(html, { permanent: true });

  const handler = createEnsureValidRetryHandler(options);

  if (typeof options.registerHandler === "function") {
    options.registerHandler(handler);
    return;
  }

  setTimeout(() => {
    const container = ui.notifications?.element?.[0];
    if (!container) return;
    const button = container.querySelector<HTMLButtonElement>(`button.handy-dandy-retry[data-retry-id="${id}"]`);
    if (!button) return;

    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        await handler();
        button.closest<HTMLElement>(".notification")?.remove();
      } catch (_error) {
        button.disabled = false;
      }
    });
  }, 0);
}
