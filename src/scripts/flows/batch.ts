import { fromFoundryAction, fromFoundryActor, fromFoundryItem } from "../mappers/export";
import { importAction } from "../mappers/import";
import type {
  ActionSchemaData,
  ActorSchemaData,
  EntityType,
  ItemSchemaData,
} from "../schemas";
import type {
  ActionPromptInput,
  ActorPromptInput,
  ItemPromptInput,
} from "../prompts";

type CanonicalEntityMap = {
  action: ActionSchemaData;
  item: ItemSchemaData;
  actor: ActorSchemaData;
};

type PromptInputMap = {
  action: ActionPromptInput;
  item: ItemPromptInput;
  actor: ActorPromptInput;
};

type BatchEntityType = EntityType | "unknown";

type BatchStatus = "success" | "failure";

export interface ExportBatchEntry<T extends BatchEntityType = BatchEntityType> {
  readonly type: T;
  readonly name: string;
  readonly id?: string;
  readonly uuid?: string;
  readonly status: BatchStatus;
  readonly data?: T extends EntityType ? CanonicalEntityMap[T] : never;
  readonly error?: Error;
}

export interface ExportSelectionOptions {
  readonly documents?: Iterable<unknown>;
}

export interface ExportSelectionResult {
  readonly entries: ExportBatchEntry[];
  readonly successCount: number;
  readonly failureCount: number;
  readonly summary: string;
  readonly json: string;
}

export interface GenerationBatchEntry<T extends EntityType> {
  readonly type: T;
  readonly input: PromptInputMap[T];
  readonly name: string;
  readonly status: BatchStatus;
  readonly data?: CanonicalEntityMap[T];
  readonly documentUuid?: string;
  readonly error?: Error;
}

export interface GenerationBatchOptions<T extends EntityType> {
  readonly type: T;
  readonly inputs: readonly PromptInputMap[T][];
  readonly packId?: string;
  readonly folderId?: string;
  readonly seed?: number;
  readonly maxAttempts?: number;
  readonly dependencies?: GenerationDependencyOverrides;
}

export interface GenerationBatchResult<T extends EntityType> {
  readonly type: T;
  readonly entries: GenerationBatchEntry<T>[];
  readonly successCount: number;
  readonly failureCount: number;
  readonly summary: string;
}

interface GeneratorMap {
  action: (input: ActionPromptInput, options?: BoundGenerationOptions) => Promise<ActionSchemaData>;
  item: (input: ItemPromptInput, options?: BoundGenerationOptions) => Promise<ItemSchemaData>;
  actor: (input: ActorPromptInput, options?: BoundGenerationOptions) => Promise<ActorSchemaData>;
}

interface ImporterMap {
  action: (json: ActionSchemaData, options?: ImporterOptions) => Promise<ClientDocument>;
  item: (json: ItemSchemaData, options?: ImporterOptions) => Promise<ClientDocument>;
  actor: (json: ActorSchemaData, options?: ImporterOptions) => Promise<ClientDocument>;
}

interface BoundGenerationOptions {
  seed?: number;
  maxAttempts?: number;
}

interface ImporterOptions {
  packId?: string;
  folderId?: string;
}

export interface GenerationDependencyOverrides {
  readonly generators?: Partial<GeneratorMap>;
  readonly importers?: Partial<ImporterMap>;
}

export function formatBatchSummary(
  noun: string,
  total: number,
  successCount: number,
  failureCount: number,
): string {
  if (!total) {
    return `No ${noun} processed.`;
  }

  if (!failureCount) {
    return `Processed ${total} ${noun}: all succeeded.`;
  }

  if (!successCount) {
    return `Processed ${total} ${noun}: all failed.`;
  }

  return `Processed ${total} ${noun}: ${successCount} succeeded, ${failureCount} failed.`;
}

export function collectFailureMessages(entries: readonly { status: BatchStatus; name: string; error?: Error }[]): string[] {
  return entries
    .filter((entry) => entry.status === "failure")
    .map((entry) => `${entry.name}: ${entry.error?.message ?? "Unknown error"}`);
}

export function exportSelectedEntities(options: ExportSelectionOptions = {}): ExportSelectionResult {
  const documents = Array.from(options.documents ?? collectCurrentSelection());
  if (!documents.length) {
    return {
      entries: [],
      successCount: 0,
      failureCount: 0,
      summary: formatBatchSummary("documents", 0, 0, 0),
      json: "[]",
    } satisfies ExportSelectionResult;
  }

  const entries: ExportBatchEntry[] = [];
  for (const doc of documents) {
    entries.push(convertDocument(doc));
  }

  const successes = entries.filter((entry) => entry.status === "success");
  const json = JSON.stringify(successes.map((entry) => entry.data), null, 2);
  const successCount = successes.length;
  const failureCount = entries.length - successCount;

  return {
    entries,
    successCount,
    failureCount,
    summary: formatBatchSummary("documents", entries.length, successCount, failureCount),
    json,
  } satisfies ExportSelectionResult;
}

export async function generateAndImportBatch<T extends EntityType>(
  options: GenerationBatchOptions<T>,
): Promise<GenerationBatchResult<T>> {
  const {
    type,
    inputs,
    packId,
    folderId,
    seed,
    maxAttempts,
    dependencies = {},
  } = options;

  const generator = resolveGenerator(type, dependencies.generators);
  const importer = resolveImporter(type, dependencies.importers);
  const batchEntries: GenerationBatchEntry<T>[] = [];

  for (const input of inputs) {
    const label = inferInputName(type, input as PromptInputMap[T]);
    try {
      const data = await generator(input as PromptInputMap[T], { seed, maxAttempts });
      const document = await importer(data as CanonicalEntityMap[T], { packId, folderId });
      batchEntries.push({
        type,
        input: input as PromptInputMap[T],
        name: typeof (data as { name?: string }).name === "string" && (data as { name?: string }).name?.trim()
          ? (data as { name: string }).name
          : label,
        status: "success",
        data: data as CanonicalEntityMap[T],
        documentUuid: typeof document?.uuid === "string" ? document.uuid : undefined,
      });
    } catch (error) {
      batchEntries.push({
        type,
        input: input as PromptInputMap[T],
        name: label,
        status: "failure",
        error: normalizeError(error),
      });
    }
  }

  const successCount = batchEntries.filter((entry) => entry.status === "success").length;
  const failureCount = batchEntries.length - successCount;
  const summary = formatBatchSummary(nounForType(type), batchEntries.length, successCount, failureCount);

  return {
    type,
    entries: batchEntries,
    successCount,
    failureCount,
    summary,
  } satisfies GenerationBatchResult<T>;
}

function nounForType(type: EntityType): string {
  switch (type) {
    case "action":
      return "actions";
    case "item":
      return "items";
    case "actor":
      return "actors";
    default:
      return "entries";
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch (_jsonError) {
    return new Error(String(error));
  }
}

function resolveGenerator<T extends EntityType>(
  type: T,
  overrides: GenerationDependencyOverrides["generators"],
): GeneratorMap[T] {
  if (overrides?.[type]) {
    return overrides[type] as GeneratorMap[T];
  }

  const generation = game.handyDandy?.generation;
  if (!generation) {
    throw new Error("Handy Dandy generation helpers are unavailable.");
  }

  const generator = generation[`generate${capitalize(type)}` as const];
  if (!generator) {
    throw new Error(`No generator available for ${type} entries.`);
  }

  return generator as GeneratorMap[T];
}

function resolveImporter<T extends EntityType>(
  type: T,
  overrides: GenerationDependencyOverrides["importers"],
): ImporterMap[T] {
  if (overrides?.[type]) {
    return overrides[type] as ImporterMap[T];
  }

  switch (type) {
    case "action":
      return importAction as unknown as ImporterMap[T];
    default:
      throw new Error(`No importer configured for ${type} entries.`);
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function collectCurrentSelection(): unknown[] {
  const documents: unknown[] = [];
  const seen = new Set<string>();

  const add = (doc: any) => {
    if (!doc) {
      return;
    }

    const uuid = typeof doc.uuid === "string" ? doc.uuid : undefined;
    if (uuid) {
      if (seen.has(uuid)) {
        return;
      }
      seen.add(uuid);
    }

    documents.push(doc);
  };

  const controlled = canvas?.tokens?.controlled ?? [];
  for (const token of controlled as any[]) {
    add(token?.actor);
  }

  const actorTab = ui.sidebar?.tabs?.actors as SidebarDirectory | undefined;
  for (const actor of collectDirectorySelection(actorTab)) {
    add(actor);
  }

  const itemTab = ui.sidebar?.tabs?.items as SidebarDirectory | undefined;
  for (const item of collectDirectorySelection(itemTab)) {
    add(item);
  }

  return documents;
}

function inferInputName<T extends EntityType>(type: T, input: PromptInputMap[T]): string {
  switch (type) {
    case "action": {
      const actionInput = input as ActionPromptInput;
      return actionInput.title?.trim() || actionInput.slug?.trim() || "Unnamed";
    }
    case "item": {
      const itemInput = input as ItemPromptInput;
      return itemInput.name?.trim() || itemInput.slug?.trim() || "Unnamed";
    }
    case "actor": {
      const actorInput = input as ActorPromptInput;
      return actorInput.name?.trim() || actorInput.slug?.trim() || "Unnamed";
    }
    default:
      return "Unnamed";
  }
}

function collectDirectorySelection(tab: SidebarDirectory | undefined): unknown[] {
  if (!tab) {
    return [];
  }

  const collection = (tab as { collection?: Collection<ClientDocument> }).collection;
  if (!collection || typeof collection.get !== "function") {
    return [];
  }

  const element = (tab as { element?: JQuery | HTMLElement | null }).element;
  const root = resolveHTMLElement(element);
  if (!root) {
    return [];
  }

  const selected = root.querySelectorAll<HTMLElement>(".directory-item.active[data-document-id]");
  const documents: ClientDocument[] = [];
  for (const entry of selected) {
    const id = entry.dataset.documentId;
    if (!id) {
      continue;
    }

    const document = collection.get(id);
    if (document) {
      documents.push(document);
    }
  }

  return documents;
}

function resolveHTMLElement(candidate: JQuery | HTMLElement | null | undefined): HTMLElement | null {
  if (!candidate) {
    return null;
  }

  if (candidate instanceof HTMLElement) {
    return candidate;
  }

  const maybeJQuery = candidate as JQuery;
  if (typeof maybeJQuery.get === "function") {
    const element = maybeJQuery.get(0);
    return element instanceof HTMLElement ? element : null;
  }

  return null;
}

function convertDocument(document: unknown): ExportBatchEntry {
  const base = buildEntryBase(document);
  if (!base) {
    return {
      type: "unknown",
      name: "Unknown Document",
      status: "failure",
      error: new Error("Unsupported document selection."),
    } satisfies ExportBatchEntry;
  }

  const { doc, type } = base;

  try {
    switch (type) {
      case "actor": {
        const source = doc.toObject?.() ?? doc;
        const data = fromFoundryActor(source as any);
        return { ...base.meta, type, status: "success", data } satisfies ExportBatchEntry;
      }
      case "action": {
        const source = doc.toObject?.() ?? doc;
        const data = fromFoundryAction(source as any);
        return { ...base.meta, type, status: "success", data } satisfies ExportBatchEntry;
      }
      case "item": {
        const source = doc.toObject?.() ?? doc;
        const data = fromFoundryItem(source as any);
        return { ...base.meta, type, status: "success", data } satisfies ExportBatchEntry;
      }
      default:
        return {
          ...base.meta,
          type,
          status: "failure",
          error: new Error(`Unsupported document type: ${type}`),
        } satisfies ExportBatchEntry;
    }
  } catch (error) {
    return {
      ...base.meta,
      type,
      status: "failure",
      error: normalizeError(error),
    } satisfies ExportBatchEntry;
  }
}

function buildEntryBase(document: unknown):
  | { doc: any; type: BatchEntityType; meta: Omit<ExportBatchEntry, "type" | "status" | "data" | "error"> }
  | null {
  if (!document || typeof document !== "object") {
    return null;
  }

  const doc = document as { documentName?: string; type?: string; name?: string; id?: string; uuid?: string; actor?: unknown };
  const name = typeof doc.name === "string" && doc.name.trim() ? doc.name : "Unnamed";
  const id = typeof doc.id === "string" ? doc.id : undefined;
  const uuid = typeof doc.uuid === "string" ? doc.uuid : undefined;

  if (isTokenDocument(doc)) {
    const actor = (doc as { actor?: unknown }).actor;
    if (!actor) {
      return {
        doc,
        type: "actor",
        meta: { name, id, uuid },
      };
    }

    return buildEntryBase(actor);
  }

  if (isActorDocument(doc)) {
    return {
      doc,
      type: "actor",
      meta: { name, id, uuid },
    };
  }

  if (isItemDocument(doc)) {
    if (isActionItem(doc)) {
      return {
        doc,
        type: "action",
        meta: { name, id, uuid },
      };
    }

    return {
      doc,
      type: "item",
      meta: { name, id, uuid },
    };
  }

  return {
    doc,
    type: "unknown",
    meta: { name, id, uuid },
  };
}

function isActorDocument(doc: { documentName?: string }): boolean {
  return doc.documentName === "Actor";
}

function isItemDocument(doc: { documentName?: string }): boolean {
  return doc.documentName === "Item";
}

function isActionItem(doc: { type?: string }): boolean {
  return (doc.type ?? "").toLowerCase() === "action";
}

function isTokenDocument(doc: { documentName?: string }): boolean {
  return doc.documentName === "Token" || doc.documentName === "TokenDocument";
}

type SidebarDirectory = { element?: JQuery | HTMLElement | null; collection?: Collection<ClientDocument> };

