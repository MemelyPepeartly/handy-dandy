import {
  buildActionPrompt,
  buildActorPrompt,
  buildItemPrompt,
  type ActionPromptInput,
  type ActorPromptInput,
  type ItemPromptInput,
} from "../prompts";
import { getDefaultItemImage } from "../data/item-images";
import { generateItemImage, generateTransparentTokenImage } from "./token-image";
import {
  type ActionSchemaData,
  type ActorSchemaData,
  type ActorGenerationResult,
  type ItemSchemaData,
} from "../schemas";
import {
  generateStructuredOutput,
  getSchemaDefinition,
  mapCanonicalActor,
  normalizeGeneratedEntity,
} from "./pipeline";
import type {
  GenerateWithSchemaOptions,
  OpenRouterRoutingRetryEvent,
  OpenRouterClient,
} from "../openrouter/client";

export interface GenerateOptions extends GenerateWithSchemaOptions {
  openRouterClient: Pick<OpenRouterClient, "generateWithSchema"> &
    Partial<Pick<OpenRouterClient, "generateImage">>;
  onProgress?: (update: GenerationProgressUpdate) => void;
}

function canGenerateImages(
  client: GenerateOptions["openRouterClient"],
): client is GenerateOptions["openRouterClient"] & Pick<OpenRouterClient, "generateImage"> {
  return typeof client.generateImage === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const DEFAULT_GENERATION_SEED = 1337;

export type GenerationProgressStep =
  | "prompt"
  | "model"
  | "routing"
  | "generation"
  | "validation"
  | "image"
  | "mapping"
  | "done";

export interface GenerationProgressUpdate {
  step: GenerationProgressStep;
  message: string;
  percent?: number;
}

function reportProgress(
  options: Pick<GenerateOptions, "onProgress">,
  update: GenerationProgressUpdate,
): void {
  try {
    options.onProgress?.(update);
  } catch (error) {
    console.warn("Handy Dandy | Progress callback failed", error);
  }
}

function formatRoutingRetryLabel(label: string): string {
  switch (label) {
    case "profiled-base":
      return "trying saved provider profile";
    case "base":
      return "retrying with default provider bundle";
    case "without-web-plugin":
      return "retrying without web-search plugin";
    case "relaxed-provider-parameters":
      return "retrying with relaxed provider parameters";
    case "relaxed-provider-parameters-without-web-plugin":
      return "retrying with relaxed provider parameters and no web plugin";
    case "minimal-parameters":
      return "retrying with minimal optional parameters";
    default:
      return label.replace(/[-_]+/g, " ");
  }
}

function createRoutingRetryReporter(
  options: Pick<GenerateOptions, "onProgress">,
  percent: number,
): NonNullable<GenerateWithSchemaOptions["onRoutingRetry"]> {
  return (event: OpenRouterRoutingRetryEvent): void => {
    const details = formatRoutingRetryLabel(event.label);
    reportProgress(options, {
      step: "routing",
      message:
        `Finding compatible provider route (${event.attemptNumber}/${event.totalAttempts}: ${details})...`,
      percent,
    });
  };
}

function createRoutingResolvedReporter(
  options: Pick<GenerateOptions, "onProgress">,
  messageFactory: (event: OpenRouterRoutingRetryEvent) => string,
  percent: number,
): NonNullable<GenerateWithSchemaOptions["onRoutingResolved"]> {
  return (event: OpenRouterRoutingRetryEvent): void => {
    reportProgress(options, {
      step: "generation",
      message: messageFactory(event),
      percent,
    });
  };
}

export async function generateAction(
  input: ActionPromptInput,
  options: GenerateOptions,
): Promise<ActionSchemaData> {
  const { openRouterClient, seed = DEFAULT_GENERATION_SEED } = options;
  reportProgress(options, {
    step: "prompt",
    message: "Preparing action prompt...",
    percent: 10,
  });
  const prompt = buildActionPrompt(input);
  reportProgress(options, {
    step: "model",
    message: "Starting generation request...",
    percent: 35,
  });
  reportProgress(options, {
    step: "routing",
    message: "Finding compatible provider route...",
    percent: 45,
  });
  const draft = await generateStructuredOutput<ActionSchemaData>(
    openRouterClient,
    prompt,
    getSchemaDefinition("action"),
    {
      seed,
      onRoutingRetry: createRoutingRetryReporter(options, 55),
      onRoutingResolved: createRoutingResolvedReporter(
        options,
        (event) => `Provider route selected (${formatRoutingRetryLabel(event.label)}). Generating action JSON...`,
        62,
      ),
    },
  );
  reportProgress(options, {
    step: "validation",
    message: "Normalizing and validating action structure...",
    percent: 75,
  });
  const validated = await normalizeGeneratedEntity("action", draft);
  reportProgress(options, {
    step: "done",
    message: "Action generation complete.",
    percent: 100,
  });
  return validated;
}

export async function generateItem(
  input: ItemPromptInput,
  options: GenerateOptions,
): Promise<ItemSchemaData> {
  const { openRouterClient, seed = DEFAULT_GENERATION_SEED } = options;
  reportProgress(options, {
    step: "prompt",
    message: "Preparing item prompt...",
    percent: 10,
  });
  const prompt = buildItemPrompt(input);
  reportProgress(options, {
    step: "model",
    message: "Starting generation request...",
    percent: 35,
  });
  reportProgress(options, {
    step: "routing",
    message: "Finding compatible provider route...",
    percent: 43,
  });
  const draft = await generateStructuredOutput<ItemSchemaData>(
    openRouterClient,
    prompt,
    getSchemaDefinition("item"),
    {
      seed,
      onRoutingRetry: createRoutingRetryReporter(options, 52),
      onRoutingResolved: createRoutingResolvedReporter(
        options,
        (event) => `Provider route selected (${formatRoutingRetryLabel(event.label)}). Generating item JSON...`,
        58,
      ),
    },
  );
  reportProgress(options, {
    step: "validation",
    message: "Normalizing and validating item structure...",
    percent: 70,
  });
  const canonical = await normalizeGeneratedEntity("item", draft);

  if (input.generateItemImage && canGenerateImages(openRouterClient)) {
    reportProgress(options, {
      step: "image",
      message: "Generating transparent item icon...",
      percent: 85,
    });
    try {
      const generatedImage = await generateItemImage(openRouterClient, {
        itemName: canonical.name,
        itemSlug: canonical.slug,
        itemDescription: canonical.description ?? input.referenceText,
        customPrompt: input.itemImagePrompt,
      });
      canonical.img = generatedImage;
    } catch (error) {
      console.warn("Handy Dandy | Item image generation failed; using fallback item image", error);
    }
  }

  const trimmedImg = canonical.img?.trim() ?? "";
  const resolvedImg = trimmedImg || getDefaultItemImage(canonical.itemType);
  const finalized = resolvedImg === canonical.img
    ? canonical
    : {
      ...canonical,
      img: resolvedImg,
    } satisfies ItemSchemaData;
  reportProgress(options, {
    step: "done",
    message: "Item generation complete.",
    percent: 100,
  });
  return finalized;
}

export async function generateActor(
  input: ActorPromptInput,
  options: GenerateOptions,
): Promise<ActorGenerationResult> {
  const { openRouterClient, seed = DEFAULT_GENERATION_SEED } = options;
  reportProgress(options, {
    step: "prompt",
    message: "Preparing actor prompt...",
    percent: 8,
  });
  const prompt = buildActorPrompt(input);
  reportProgress(options, {
    step: "model",
    message: "Starting generation request...",
    percent: 25,
  });
  reportProgress(options, {
    step: "routing",
    message: "Finding compatible provider route...",
    percent: 32,
  });
  const draft = await generateStructuredOutput<ActorSchemaData>(
    openRouterClient,
    prompt,
    getSchemaDefinition("actor"),
    {
      seed,
      onRoutingRetry: createRoutingRetryReporter(options, 42),
      onRoutingResolved: createRoutingResolvedReporter(
        options,
        (event) => `Provider route selected (${formatRoutingRetryLabel(event.label)}). Generating actor JSON...`,
        48,
      ),
    },
  );
  reportProgress(options, {
    step: "validation",
    message: "Normalizing and validating actor structure...",
    percent: 55,
  });
  const canonical = await normalizeGeneratedEntity("actor", draft);

  if (input.actorType) {
    canonical.actorType = input.actorType;
  }

  if (input.includeSpellcasting === false) {
    delete canonical.spellcasting;
  }

  if (input.includeInventory === false) {
    delete canonical.inventory;
  }

  if (input.generateTokenImage && canGenerateImages(openRouterClient)) {
    reportProgress(options, {
      step: "image",
      message: "Generating transparent token image...",
      percent: 75,
    });
    try {
      const generatedToken = await generateTransparentTokenImage(openRouterClient, {
        actorName: canonical.name,
        actorSlug: canonical.slug,
        actorDescription: canonical.description ?? input.referenceText,
        customPrompt: input.tokenPrompt,
        imageCategory: "actor",
      });
      canonical.img = generatedToken;
    } catch (error) {
      console.warn("Handy Dandy | Token image generation failed; using fallback actor image", error);
    }
  }

  reportProgress(options, {
    step: "mapping",
    message: input.includeOfficialContent === false
      ? "Finalizing actor data without official compendium linking..."
      : "Resolving compendium links and finalizing actor data...",
    percent: 90,
  });
  const foundry = await mapCanonicalActor(canonical, {
    resolveOfficialContent: input.includeOfficialContent !== false,
  });

  if (input.generateTokenImage && canonical.img?.trim()) {
    const generatedImage = canonical.img.trim();
    foundry.img = generatedImage;

    const prototypeToken = isRecord(foundry.prototypeToken) ? foundry.prototypeToken : {};
    const texture = isRecord(prototypeToken.texture) ? prototypeToken.texture : {};
    texture.src = generatedImage;
    prototypeToken.texture = texture;
    foundry.prototypeToken = prototypeToken;
  }

  const finalized = {
    schema_version: canonical.schema_version,
    systemId: canonical.systemId,
    slug: canonical.slug,
    name: foundry.name,
    type: foundry.type as ActorGenerationResult["type"],
    img: foundry.img,
    system: foundry.system,
    prototypeToken: foundry.prototypeToken,
    items: foundry.items,
    effects: foundry.effects,
    folder: (foundry.folder ?? null) as ActorGenerationResult["folder"],
    flags: (foundry.flags ?? {}) as ActorGenerationResult["flags"],
  } satisfies ActorGenerationResult;
  reportProgress(options, {
    step: "done",
    message: "Actor generation complete.",
    percent: 100,
  });
  return finalized;
}
