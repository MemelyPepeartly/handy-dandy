import { fromFoundryAction, fromFoundryActor, fromFoundryItem } from "../mappers/export";
import { importAction } from "../mappers/import";
import type { CanonicalEntityMap, EntityType, SystemId } from "../schemas";
import type { ActionPromptInput, ActorPromptInput, ItemPromptInput } from "../prompts";

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

export interface ImporterOptions {
  readonly packId?: string;
  readonly folderId?: string;
}

export interface GenerationDependencyOverrides {
  readonly generators?: Partial<GeneratorMap>;
  readonly importers?: Partial<ImporterMap>;
}

export interface PromptWorkbenchRequest<T extends EntityType> extends ImporterOptions {
  readonly type: T;
  readonly systemId: SystemId;
  readonly entryName: string;
  readonly referenceText: string;
  readonly slug?: string;
  readonly seed?: number;
  readonly maxAttempts?: number;
  readonly dependencies?: GenerationDependencyOverrides;
}

export interface PromptWorkbenchResult<T extends EntityType> {
  readonly type: T;
  readonly name: string;
  readonly data: CanonicalEntityMap[T];
  readonly input: PromptInputMap[T];
  readonly importer?: (options?: ImporterOptions) => Promise<ClientDocument>;
}

type GeneratorMap = {
  [K in EntityType]: (
    input: PromptInputMap[K],
    options?: BoundGenerationOptions,
  ) => Promise<CanonicalEntityMap[K]>;
};

type ImporterMap = {
  [K in EntityType]: (
    json: CanonicalEntityMap[K],
    options?: ImporterOptions,
  ) => Promise<ClientDocument>;
};

const GENERATION_METHOD_MAP: Record<EntityType, keyof NonNullable<Game["handyDandy"]>["generation"]> = {
  action: "generateAction",
  item: "generateItem",
  actor: "generateActor",
};

const DEFAULT_IMPORTERS: Partial<ImporterMap> = {
  action: async (json, options) => importAction(json, options),
};

interface BoundGenerationOptions {
  readonly seed?: number;
  readonly maxAttempts?: number;
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

export async function generateWorkbenchEntry<T extends EntityType>(
  request: PromptWorkbenchRequest<T>,
): Promise<PromptWorkbenchResult<T>> {
  const {
    type,
    systemId,
    entryName,
    referenceText,
    slug,
    seed,
    maxAttempts,
    packId,
    folderId,
    dependencies = {},
  } = request;

  const generator = resolveGenerator(type, dependencies.generators);
  const importer = maybeResolveImporter(type, dependencies.importers);
  const input = buildPromptInput(type, {
    systemId,
    entryName,
    referenceText,
    slug,
  });

  const data = await generator(input, { seed, maxAttempts });
  const resolvedName = data.name.trim() || inferInputName(type, input);

  const importerFn = importer
    ? (options?: ImporterOptions) => importer(data, { packId, folderId, ...options })
    : undefined;

  return {
    type,
    name: resolvedName,
    data,
    input,
    importer: importerFn,
  } satisfies PromptWorkbenchResult<T>;
}

function buildPromptInput<T extends EntityType>(
  type: T,
  context: { systemId: SystemId; entryName: string; referenceText: string; slug?: string },
): PromptInputMap[T] {
  const { systemId, entryName, referenceText, slug } = context;
  switch (type) {
    case "action":
      return {
        systemId,
        title: entryName,
        referenceText,
        slug,
      } satisfies ActionPromptInput as PromptInputMap[T];
    case "item":
      return {
        systemId,
        name: entryName,
        referenceText,
        slug,
      } satisfies ItemPromptInput as PromptInputMap[T];
    case "actor":
      return {
        systemId,
        name: entryName,
        referenceText,
        slug,
      } satisfies ActorPromptInput as PromptInputMap[T];
    default:
      throw new Error(`Unsupported entity type: ${type satisfies never}`);
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

  const method = GENERATION_METHOD_MAP[type];
  const generator = generation[method];
  if (!generator) {
    throw new Error(`No generator available for ${type} entries.`);
  }

  return generator as GeneratorMap[T];
}

function maybeResolveImporter<T extends EntityType>(
  type: T,
  overrides: GenerationDependencyOverrides["importers"],
): ImporterMap[T] | null {
  if (overrides?.[type]) {
    return overrides[type] as ImporterMap[T];
  }

  const importer = DEFAULT_IMPORTERS[type];
  return importer ? (importer as ImporterMap[T]) : null;
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

type SidebarDirectory = { element?: JQuery | HTMLElement | null; collection?: Collection<ClientDocument> };

