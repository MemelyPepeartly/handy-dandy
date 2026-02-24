import { CONSTANTS } from "../constants";
import {
  generateWorkbenchEntry,
  DEFAULT_IMAGE_PATH,
  type PromptWorkbenchRequest,
  type PromptWorkbenchResult,
} from "./prompt-workbench";
import { DEFAULT_GENERATION_SEED, type GenerationProgressUpdate } from "../generation";
import { readOpenRouterSettings } from "../openrouter/client";
import {
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
const PROMPT_WORKBENCH_LOADING_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-loading.hbs`;
const PROMPT_WORKBENCH_GENERATION_SETUP_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-generation-setup.hbs`;
const PROMPT_WORKBENCH_HISTORY_LIST_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-history-list.hbs`;
const PROMPT_WORKBENCH_HISTORY_PLACEHOLDER_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-history-placeholder.hbs`;
const PROMPT_WORKBENCH_ENTRY_DETAIL_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-entry-detail.hbs`;
const PROMPT_WORKBENCH_REQUEST_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-request.hbs`;
const PROMPT_WORKBENCH_RESULT_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/prompt-workbench-result.hbs`;

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
  readonly includeOfficialContent: string | null;
  readonly includeGeneratedContent: string | null;
  readonly tokenPrompt: string;
};

interface PromptWorkbenchGenerationSetup {
  readonly connected: boolean;
  readonly textModel: string;
  readonly imageModel: string;
  readonly temperature: number;
  readonly topP: number;
  readonly configuredSeed?: number;
}

const workbenchHistory: WorkbenchHistoryEntry[] = [];
const WORKBENCH_ACTOR_TYPES = ["npc", "loot", "hazard"] as const satisfies readonly ActorCategory[];
type WorkbenchActorType = (typeof WORKBENCH_ACTOR_TYPES)[number];

function isWorkbenchActorType(value: string): value is WorkbenchActorType {
  return (WORKBENCH_ACTOR_TYPES as readonly string[]).includes(value);
}

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

export async function runPromptWorkbenchFlow(): Promise<void> {
  if (!ensureWorkbenchGenerationReady()) {
    return;
  }

  const request = await promptWorkbenchRequest();
  if (!request) {
    return;
  }

  let loading: WorkbenchLoadingController | null = null;
  try {
    loading = await showGeneratingDialog(request);
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
  const generationSetup = readPromptWorkbenchGenerationSetup();
  const generationSetupMarkup = await buildGenerationSetupMarkup(generationSetup);
  const defaultSeedValue = typeof generationSetup.configuredSeed === "number"
    ? generationSetup.configuredSeed
    : DEFAULT_GENERATION_SEED;
  const itemTypeOptions = ITEM_CATEGORIES.map(
    (category) => ({
      value: category,
      label: formatItemTypeLabel(category),
    }),
  );
  const actorTypeOptions = resolveAvailableActorCategories().map(
    (category) => ({
      value: category,
      label: formatActorTypeLabel(category),
      selected: category === "npc",
    }),
  );
  const initialHistoryId = workbenchHistory[0]?.id;
  const [historyListMarkup, historyPlaceholder] = await Promise.all([
    buildHistoryListMarkup(initialHistoryId),
    buildHistoryViewPlaceholder(),
  ]);

  const content = await renderTemplate(PROMPT_WORKBENCH_REQUEST_TEMPLATE, {
    generationSetupMarkup,
    itemTypeOptions,
    actorTypeOptions,
    defaultImagePath: DEFAULT_IMAGE_PATH,
    defaultSeedValue,
    systemId: fixedSystemId,
    historyListMarkup,
    historyPlaceholder,
  });

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
                includeOfficialContent: formData.get("includeOfficialContent") as string | null,
                includeGeneratedContent: formData.get("includeGeneratedContent") as string | null,
                tokenPrompt: String(formData.get("tokenPrompt") ?? ""),
              });
            },
          },
          cancel: {
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

  const usesActorContentModes = type === "actor" && (actorType === "loot" || actorType === "hazard");
  const includeOfficialContent = usesActorContentModes ? Boolean(response.includeOfficialContent) : undefined;
  const includeGeneratedContent = usesActorContentModes ? Boolean(response.includeGeneratedContent) : undefined;

  if (usesActorContentModes && !includeOfficialContent && !includeGeneratedContent) {
    ui.notifications?.error(
      `${CONSTANTS.MODULE_NAME} | Select at least one content mode (Official content and/or Generated content).`,
    );
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
  const actorDefaultImagePath = resolveActorDefaultImagePath(actorType);
  const actorImageInput = response.actorImagePath.trim();
  const actorImagePath = actorImageInput.length === 0
    ? actorDefaultImagePath
    : actorImageInput === DEFAULT_IMAGE_PATH && actorDefaultImagePath !== DEFAULT_IMAGE_PATH
      ? actorDefaultImagePath
      : actorImageInput;
  const itemImagePath = response.itemImagePath.trim() || DEFAULT_IMAGE_PATH;
  const img = type === "actor"
    ? (generateTokenImage ? undefined : actorImagePath)
    : type === "item"
      ? (generateItemImage ? undefined : itemImagePath)
      : (response.img.trim() || DEFAULT_IMAGE_PATH);
  const tokenPrompt = generateTokenImage ? response.tokenPrompt.trim() || undefined : undefined;
  const itemImagePrompt = generateItemImage ? response.itemImagePrompt.trim() || undefined : undefined;
  const level = parseOptionalInteger(response.level);
  if (response.level.trim() && level === undefined) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Actor level must be a whole number.`);
    return null;
  }

  const seed = parseOptionalInteger(response.seed);
  if (response.seed.trim() && seed === undefined) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Seed must be a whole number.`);
    return null;
  }

  const maxAttempts = parseOptionalPositiveInteger(response.maxAttempts);
  if (response.maxAttempts.trim() && maxAttempts === undefined) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Max Attempts must be a whole number greater than 0.`);
    return null;
  }

  return {
    type,
    systemId,
    entryName,
    referenceText,
    slug: response.slug.trim() || undefined,
    itemType,
    actorType,
    level,
    seed,
    maxAttempts,
    packId: response.packId.trim() || undefined,
    folderId: response.folderId.trim() || undefined,
    publication,
    img,
    includeSpellcasting: type === "actor" && actorType === "npc" && response.includeSpellcasting ? true : undefined,
    includeInventory: type === "actor" && actorType === "npc" && response.includeInventory ? true : undefined,
    includeOfficialContent,
    includeGeneratedContent,
    generateTokenImage: generateTokenImage ? true : undefined,
    generateItemImage: generateItemImage ? true : undefined,
    tokenPrompt,
    itemImagePrompt,
  } satisfies PromptWorkbenchRequest<EntityType>;
}

function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return undefined;
  }

  return parsed;
}

function parseOptionalPositiveInteger(value: string): number | undefined {
  const parsed = parseOptionalInteger(value);
  if (parsed === undefined || parsed < 1) {
    return undefined;
  }

  return parsed;
}

function ensureWorkbenchGenerationReady(): boolean {
  const namespace = game.handyDandy;
  if (!namespace?.generation) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Generation helpers are unavailable.`);
    return false;
  }

  namespace.refreshAIClient?.();
  if (!namespace.openRouterClient) {
    ui.notifications?.error(
      `${CONSTANTS.MODULE_NAME} | OpenRouter is not connected for this user. ` +
        `Open Module Settings -> OpenRouter Account and connect before running Prompt Workbench.`,
    );
    return false;
  }

  return true;
}

function readPromptWorkbenchGenerationSetup(): PromptWorkbenchGenerationSetup {
  const configured = readOpenRouterSettings();
  const seed = typeof configured.seed === "number" && Number.isFinite(configured.seed)
    ? configured.seed
    : undefined;

  return {
    connected: Boolean(game.handyDandy?.openRouterClient),
    textModel: configured.model,
    imageModel: configured.imageModel,
    temperature: configured.temperature,
    topP: configured.top_p,
    configuredSeed: seed,
  };
}

async function buildGenerationSetupMarkup(setup: PromptWorkbenchGenerationSetup): Promise<string> {
  const connectionClass = setup.connected ? "is-connected" : "is-disconnected";
  const connectionLabel = setup.connected ? "Connected" : "Not connected";
  const seedLabel = typeof setup.configuredSeed === "number"
    ? String(setup.configuredSeed)
    : `Default (${DEFAULT_GENERATION_SEED})`;

  return renderTemplate(PROMPT_WORKBENCH_GENERATION_SETUP_TEMPLATE, {
    connectionClass,
    connectionLabel,
    textModel: setup.textModel,
    imageModel: setup.imageModel,
    temperature: setup.temperature,
    topP: setup.topP,
    seedLabel,
  });
}

function sanitizeItemType(value: string): ItemCategory | null {
  const normalized = value.trim().toLowerCase();
  return ITEM_CATEGORIES.includes(normalized as ItemCategory)
    ? (normalized as ItemCategory)
    : null;
}

function resolveActorDefaultImagePath(actorType: ActorCategory | undefined): string {
  switch (actorType) {
    case "hazard":
      return "systems/pf2e/icons/default-icons/hazard.svg";
    case "loot":
      return "systems/pf2e/icons/default-icons/loot.svg";
    default:
      return DEFAULT_IMAGE_PATH;
  }
}

function sanitizeActorType(value: string): ActorCategory | null {
  const normalized = value.trim().toLowerCase();
  return isWorkbenchActorType(normalized)
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
    return [...WORKBENCH_ACTOR_TYPES];
  }

  const supportedTypes = actorTypes
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter((value): value is ActorCategory => isWorkbenchActorType(value));
  if (!supportedTypes.length) {
    return [...WORKBENCH_ACTOR_TYPES];
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

async function showGeneratingDialog(request: PromptWorkbenchRequest<EntityType>): Promise<WorkbenchLoadingController> {
  const entryName = request.entryName.trim() || "entry";
  const loadingSteps = buildLoadingSteps(request);
  const content = await renderTemplate(PROMPT_WORKBENCH_LOADING_TEMPLATE, {
    safeEntryName: entryName,
    loadingSteps: loadingSteps.map((step, index) => ({
      index,
      label: step.label,
    })),
  });

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

  const content = await buildWorkbenchDialogContent(currentEntry);

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title: `${CONSTANTS.MODULE_NAME} | Prompt Workbench`,
      content,
      buttons: {
        close: {
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
  const openRouterClient = game.handyDandy?.openRouterClient ?? undefined;

  switch (type) {
    case "action": {
      const repaired = await ensureValid({
        type: "action",
        payload: data,
        openRouterClient,
      });
      return repaired as GeneratedEntityMap[EntityType];
    }
    case "item": {
      const repaired = await ensureValid({
        type: "item",
        payload: data,
        openRouterClient,
      });
      return repaired as GeneratedEntityMap[EntityType];
    }
    case "actor": {
      const actorData = data as GeneratedEntityMap["actor"];
      const canonicalDraft = fromFoundryActor(actorData as unknown as FoundryActor);
      const canonical = await ensureValid({
        type: "actor",
        payload: canonicalDraft,
        openRouterClient,
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

async function buildWorkbenchDialogContent(currentEntry: WorkbenchHistoryEntry): Promise<string> {
  const [latestMarkup, historyListMarkup, historyPlaceholder] = await Promise.all([
    buildEntryDetailMarkup(currentEntry),
    buildHistoryListMarkup(currentEntry.id),
    buildHistoryViewPlaceholder(),
  ]);

  return renderTemplate(PROMPT_WORKBENCH_RESULT_TEMPLATE, {
    currentEntryId: currentEntry.id,
    latestMarkup,
    historyListMarkup,
    historyPlaceholder,
  });
}

function normalizeHistoryFilter(filterText: string | undefined): string {
  return (filterText ?? "").trim().toLowerCase();
}

function getFilteredHistoryEntries(filterText?: string): WorkbenchHistoryEntry[] {
  const query = normalizeHistoryFilter(filterText);
  if (!query) {
    return [...workbenchHistory];
  }

  return workbenchHistory.filter((entry) => {
    const name = (entry.result.name.trim() || entry.result.data.name || "").toLowerCase();
    const type = entry.result.type.toLowerCase();
    const system = (entry.result.input.systemId ?? "").toLowerCase();
    return name.includes(query) || type.includes(query) || system.includes(query);
  });
}

function buildHistorySummaryLabel(visibleCount: number, totalCount: number, hasFilter: boolean): string {
  if (totalCount === 0) {
    return "No entries yet";
  }
  if (hasFilter) {
    return `Showing ${visibleCount} of ${totalCount}`;
  }
  return `${totalCount} entr${totalCount === 1 ? "y" : "ies"}`;
}

async function buildHistoryListMarkup(activeEntryId?: string, filterText?: string): Promise<string> {
  if (!workbenchHistory.length) {
    return renderTemplate(PROMPT_WORKBENCH_HISTORY_LIST_TEMPLATE, {
      hasEntries: false,
      emptyMessage: "No generations yet.",
      entries: [],
    });
  }

  const filteredEntries = getFilteredHistoryEntries(filterText);
  if (!filteredEntries.length) {
    return renderTemplate(PROMPT_WORKBENCH_HISTORY_LIST_TEMPLATE, {
      hasEntries: false,
      emptyMessage: "No entries match this filter.",
      entries: [],
    });
  }

  return renderTemplate(PROMPT_WORKBENCH_HISTORY_LIST_TEMPLATE, {
    hasEntries: true,
    entries: filteredEntries.map((entry) => ({
      id: entry.id,
      isActive: entry.id === activeEntryId,
      typeLabel: formatTypeLabel(entry.result.type),
      name: entry.result.name.trim() || entry.result.data.name || "Generated Entry",
      meta: formatHistoryRowMeta(entry),
    })),
  });
}

async function buildHistoryViewPlaceholder(filterText?: string): Promise<string> {
  if (!workbenchHistory.length) {
    return renderTemplate(PROMPT_WORKBENCH_HISTORY_PLACEHOLDER_TEMPLATE, {
      className: "handy-dandy-workbench-history-empty",
      message: "No generations yet.",
    });
  }

  if (!getFilteredHistoryEntries(filterText).length) {
    return renderTemplate(PROMPT_WORKBENCH_HISTORY_PLACEHOLDER_TEMPLATE, {
      className: "handy-dandy-workbench-history-empty",
      message: "No entries match this filter.",
    });
  }

  return renderTemplate(PROMPT_WORKBENCH_HISTORY_PLACEHOLDER_TEMPLATE, {
    className: "notes",
    message: "Select a previous generation to review its details.",
  });
}

async function buildEntryDetailMarkup(entry: WorkbenchHistoryEntry): Promise<string> {
  const typeLabel = formatTypeLabel(entry.result.type);
  const systemLabel = formatSystemLabel(entry.result.input.systemId);
  const timestamp = formatTimestamp(entry.timestamp);
  const importLabel = entry.result.type === "actor" ? "Create Actor" : "Import to World";
  const meta = `${typeLabel}${systemLabel ? ` - ${systemLabel}` : ""} - ${timestamp}`;

  return renderTemplate(PROMPT_WORKBENCH_ENTRY_DETAIL_TEMPLATE, {
    id: entry.id,
    name: entry.result.name.trim() || entry.result.data.name || "Generated Entry",
    meta,
    importLabel,
    importerAvailable: entry.importerAvailable,
    jsonText: formatJsonForDisplay(entry.json),
  });
}

function formatJsonForDisplay(rawJson: string): string {
  let current = rawJson;

  for (let index = 0; index < 3; index += 1) {
    try {
      const parsed = JSON.parse(current) as unknown;

      if (isObject(parsed)) {
        const parsedRecord = parsed as Record<string, unknown>;
        const nestedJson = parsedRecord.json;
        if (typeof nestedJson === "string" && nestedJson.trim().startsWith("{")) {
          current = nestedJson;
          continue;
        }

        const dataValue = parsedRecord.data;
        if (isObject(dataValue)) {
          const rootValue = (dataValue as Record<string, unknown>).root;
          if (isObject(rootValue)) {
            return JSON.stringify(rootValue, null, 2);
          }
        }
      }

      return JSON.stringify(parsed, null, 2);
    } catch {
      break;
    }
  }

  return rawJson;
}

function formatHistoryRowMeta(entry: WorkbenchHistoryEntry): string {
  const system = formatSystemLabel(entry.result.input.systemId);
  const time = formatTimestamp(entry.timestamp);
  return [system, time].filter(Boolean).join(" - ");
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
  const actorTypeField = container.querySelector<HTMLSelectElement>("#handy-dandy-workbench-actor-type");
  const actorTypeScopedFields = Array.from(container.querySelectorAll<HTMLElement>("[data-actor-type-scope]"));
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

  const updateActorTypeScopedVisibility = (): void => {
    const currentType = entityTypeField?.value ?? "";
    const isActor = currentType === "actor";
    const currentActorType = actorTypeField?.value?.trim().toLowerCase() ?? "";

    for (const field of actorTypeScopedFields) {
      const scopes = (field.dataset.actorTypeScope ?? "")
        .split(/\s+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const shouldShow = isActor && scopes.includes(currentActorType);
      field.style.display = shouldShow ? "" : "none";
      field.setAttribute("aria-hidden", shouldShow ? "false" : "true");

      const controls = Array.from(
        field.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"),
      );
      for (const control of controls) {
        control.disabled = !shouldShow;
      }
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
    updateActorTypeScopedVisibility();
  };

  const historyFilterInput = container.querySelector<HTMLInputElement>("[data-history-filter]");
  const initialEntry = workbenchHistory[0] ?? null;
  const initialEntryId = initialEntry?.id;

  setHistoryFilter(container, historyFilterInput?.value ?? "");
  void refreshHistoryViews(container, initialEntryId);

  updateDialogButtonsVisibility();
  updateScopedFieldVisibility();
  entityTypeField?.addEventListener("change", updateScopedFieldVisibility);
  actorTypeField?.addEventListener("change", updateActorTypeScopedVisibility);
  for (const input of actorArtModeInputs) {
    input.addEventListener("change", updateActorArtModeVisibility);
  }
  for (const input of itemArtModeInputs) {
    input.addEventListener("change", updateItemArtModeVisibility);
  }
  historyFilterInput?.addEventListener("input", () => {
    setHistoryFilter(container, historyFilterInput.value);
    void refreshHistoryViews(container, container.dataset.currentEntry);
  });

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

      void refreshHistoryViews(container, activeEntry?.id);
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
    if (historySelect?.dataset.entryId) {
      const entry = resolveHistoryEntry(historySelect.dataset.entryId);
      if (!entry) {
        return;
      }

      void refreshHistoryViews(container, entry.id);
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

  const historyFilterInput = container.querySelector<HTMLInputElement>("[data-history-filter]");
  setHistoryFilter(container, historyFilterInput?.value ?? "");
  void refreshHistoryViews(container, currentEntry.id);

  historyFilterInput?.addEventListener("input", () => {
    setHistoryFilter(container, historyFilterInput.value);
    void refreshHistoryViews(container, container.dataset.currentEntry);
  });

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

      void refreshHistoryViews(container, activeEntry?.id);
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
    if (historySelect?.dataset.entryId) {
      const entry = resolveHistoryEntry(historySelect.dataset.entryId);
      if (!entry) {
        return;
      }

      void refreshHistoryViews(container, entry.id);
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

function readHistoryFilter(container: HTMLElement): string {
  const input = container.querySelector<HTMLInputElement>("[data-history-filter]");
  if (input) {
    return input.value;
  }
  return container.dataset.historyFilter ?? "";
}

function setHistoryFilter(container: HTMLElement, value: string): void {
  const normalized = value.trim();
  if (normalized) {
    container.dataset.historyFilter = normalized;
  } else {
    delete container.dataset.historyFilter;
  }
}

function renderHistorySummary(container: HTMLElement, filterText: string): void {
  const summary = container.querySelector<HTMLElement>("[data-history-summary]");
  if (!summary) {
    return;
  }

  const visibleCount = getFilteredHistoryEntries(filterText).length;
  const totalCount = workbenchHistory.length;
  summary.textContent = buildHistorySummaryLabel(visibleCount, totalCount, Boolean(normalizeHistoryFilter(filterText)));
}

async function renderHistoryList(target: HTMLElement, activeEntryId?: string, filterText?: string): Promise<void> {
  target.innerHTML = await buildHistoryListMarkup(activeEntryId, filterText);
}

async function renderHistoryEntry(
  target: HTMLElement,
  entry: WorkbenchHistoryEntry | null | undefined,
  filterText?: string,
): Promise<void> {
  if (!entry) {
    target.innerHTML = await buildHistoryViewPlaceholder(filterText);
    return;
  }

  target.innerHTML = await buildEntryDetailMarkup(entry);
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

async function refreshHistoryViews(container: HTMLElement, preferredEntryId?: string): Promise<void> {
  const historyList = container.querySelector<HTMLElement>("[data-history-list]");
  const historyView = container.querySelector<HTMLElement>("[data-history-view]");
  const latestPanel = container.querySelector<HTMLElement>("[data-panel=\"latest\"]");
  const filterText = readHistoryFilter(container);
  const filteredEntries = getFilteredHistoryEntries(filterText);
  const activeEntry = (preferredEntryId
    ? filteredEntries.find((entry) => entry.id === preferredEntryId)
    : undefined)
    ?? (container.dataset.currentEntry
      ? filteredEntries.find((entry) => entry.id === container.dataset.currentEntry)
      : undefined)
    ?? filteredEntries[0]
    ?? null;
  const activeEntryId = activeEntry?.id;

  setCurrentHistoryEntry(container, activeEntryId);
  setActiveHistoryItem(container, activeEntryId ?? "");

  if (historyList) {
    await renderHistoryList(historyList, activeEntryId, filterText);
  }
  if (historyView) {
    await renderHistoryEntry(historyView, activeEntry, filterText);
  }
  renderHistorySummary(container, filterText);
  if (latestPanel) {
    const latestEntry = (preferredEntryId ? resolveHistoryEntry(preferredEntryId) : undefined)
      ?? (container.dataset.currentEntry ? resolveHistoryEntry(container.dataset.currentEntry) : undefined)
      ?? workbenchHistory[0]
      ?? null;
    if (latestEntry) {
      latestPanel.innerHTML = await buildEntryDetailMarkup(latestEntry);
    }
  }
}

async function handleRepairAction(entry: WorkbenchHistoryEntry, container?: HTMLElement): Promise<void> {
  try {
    const repaired = await repairHistoryEntry(entry);
    ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Repaired generation JSON for ${repaired.result.name}.`);
    if (container) {
      await refreshHistoryViews(container, repaired.id);
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

