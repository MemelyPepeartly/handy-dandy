import { importAction, importActor, importItem } from "../mappers/import";
import type { GenerationProgressUpdate } from "../generation";
import {
  PUBLICATION_DEFAULT,
  type ActorCategory,
  type EntityType,
  type GeneratedEntityMap,
  type ItemCategory,
  type PublicationData,
  type SystemId,
} from "../schemas";
import type { ActionPromptInput, ActorPromptInput, ItemPromptInput } from "../prompts";

type PromptInputMap = {
  action: ActionPromptInput;
  item: ItemPromptInput;
  actor: ActorPromptInput;
};

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
  readonly itemType?: ItemCategory;
  readonly actorType?: ActorCategory;
  readonly level?: number;
  readonly seed?: number;
  readonly maxAttempts?: number;
  readonly dependencies?: GenerationDependencyOverrides;
  readonly img?: string;
  readonly publication?: PublicationData;
  readonly includeSpellcasting?: boolean;
  readonly includeInventory?: boolean;
  readonly includeOfficialContent?: boolean;
  readonly includeGeneratedContent?: boolean;
  readonly generateTokenImage?: boolean;
  readonly tokenPrompt?: string;
  readonly generateItemImage?: boolean;
  readonly itemImagePrompt?: string;
  readonly onProgress?: (update: GenerationProgressUpdate) => void;
}

export interface PromptWorkbenchResult<T extends EntityType> {
  readonly type: T;
  readonly name: string;
  readonly data: GeneratedEntityMap[T];
  readonly input: PromptInputMap[T];
  readonly importer?: (options?: ImporterOptions) => Promise<ClientDocument>;
}

type GeneratorMap = {
  [K in EntityType]: (
    input: PromptInputMap[K],
    options?: BoundGenerationOptions,
  ) => Promise<GeneratedEntityMap[K]>;
};

type ImporterMap = {
  [K in EntityType]: (
    json: GeneratedEntityMap[K],
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
  item: async (json, options) => importItem(json, options),
  actor: async (json, options) => importActor(json, { ...options, createNew: true }),
};

interface BoundGenerationOptions {
  readonly seed?: number;
  readonly maxAttempts?: number;
  readonly onProgress?: (update: GenerationProgressUpdate) => void;
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
    itemType,
    actorType,
    level,
    seed,
    maxAttempts,
    packId,
    folderId,
    dependencies = {},
    img,
    publication,
    includeSpellcasting,
    includeInventory,
    includeOfficialContent,
    includeGeneratedContent,
    generateTokenImage,
    tokenPrompt,
    generateItemImage,
    itemImagePrompt,
    onProgress,
  } = request;

  const generator = resolveGenerator(type, dependencies.generators);
  const importer = maybeResolveImporter(type, dependencies.importers);
  const input = buildPromptInput(type, {
    systemId,
    entryName,
    referenceText,
    slug,
    itemType,
    actorType,
    img,
    publication,
    level,
    includeSpellcasting,
    includeInventory,
    includeOfficialContent,
    includeGeneratedContent,
    generateTokenImage,
    tokenPrompt,
    generateItemImage,
    itemImagePrompt,
  });

  const data = await generator(input, { seed, maxAttempts, onProgress });
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

export const DEFAULT_IMAGE_PATH = "systems/pf2e/icons/default-icons/npc.svg" as const;

function buildPromptInput<T extends EntityType>(
  type: T,
  context: {
    systemId: SystemId;
    entryName: string;
    referenceText: string;
    slug?: string;
    itemType?: ItemCategory;
    actorType?: ActorCategory;
    img?: string;
    publication?: PublicationData;
    level?: number;
    includeSpellcasting?: boolean;
    includeInventory?: boolean;
    includeOfficialContent?: boolean;
    includeGeneratedContent?: boolean;
    generateTokenImage?: boolean;
    tokenPrompt?: string;
    generateItemImage?: boolean;
    itemImagePrompt?: string;
  },
): PromptInputMap[T] {
  const {
    systemId,
    entryName,
    referenceText,
    slug,
    itemType,
    actorType,
    level,
    includeSpellcasting,
    includeInventory,
    includeOfficialContent,
    includeGeneratedContent,
    generateTokenImage,
    tokenPrompt,
    generateItemImage,
    itemImagePrompt,
  } = context;
  const trimmedImg = context.img?.trim();
  const defaultedImg = trimmedImg || DEFAULT_IMAGE_PATH;
  const actorImg = generateTokenImage ? undefined : defaultedImg;
  const itemImg = generateItemImage ? undefined : defaultedImg;
  const publication = normalizePublicationInput(context.publication);
  switch (type) {
    case "action":
      return {
        systemId,
        title: entryName,
        referenceText,
        slug,
        img: defaultedImg,
        publication,
      } satisfies ActionPromptInput as PromptInputMap[T];
    case "item":
      return {
        systemId,
        name: entryName,
        referenceText,
        slug,
        itemType,
        img: itemImg,
        generateItemImage,
        itemImagePrompt,
        publication,
      } satisfies ItemPromptInput as PromptInputMap[T];
    case "actor":
      return {
        systemId,
        name: entryName,
        referenceText,
        slug,
        actorType,
        img: actorImg,
        publication,
        level,
        includeSpellcasting,
        includeInventory,
        includeOfficialContent,
        includeGeneratedContent,
        generateTokenImage,
        tokenPrompt,
      } satisfies ActorPromptInput as PromptInputMap[T];
    default:
      throw new Error(`Unsupported entity type: ${type satisfies never}`);
  }
}

function normalizePublicationInput(candidate: PublicationData | undefined): PublicationData {
  const title = candidate?.title?.trim() ?? PUBLICATION_DEFAULT.title;
  const authors = candidate?.authors?.trim() ?? PUBLICATION_DEFAULT.authors;
  const license = candidate?.license?.trim() || PUBLICATION_DEFAULT.license;
  const remaster = candidate?.remaster ?? PUBLICATION_DEFAULT.remaster;
  return { title, authors, license, remaster };
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

