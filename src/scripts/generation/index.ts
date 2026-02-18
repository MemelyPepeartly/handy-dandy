import {
  buildActionPrompt,
  buildActorPrompt,
  buildItemPrompt,
  type ActionPromptInput,
  type ActorPromptInput,
  type ItemPromptInput,
} from "../prompts";
import { ensureValid } from "../validation/ensure-valid";
import { toFoundryActorDataWithCompendium } from "../mappers/import";
import { getDefaultItemImage } from "../data/item-images";
import { generateItemImage, generateTransparentTokenImage } from "./token-image";
import {
  actionSchema,
  actorSchema,
  itemSchema,
  type ActionSchemaData,
  type ActorGenerationResult,
  type ActorSchemaData,
  type ItemSchemaData,
} from "../schemas";
import type {
  GenerateWithSchemaOptions,
  GPTClient,
  JsonSchemaDefinition,
} from "../gpt/client";

export interface GenerateOptions extends GenerateWithSchemaOptions {
  gptClient: Pick<GPTClient, "generateWithSchema"> &
    Partial<Pick<GPTClient, "generateImage">>;
  maxAttempts?: number;
  onProgress?: (update: GenerationProgressUpdate) => void;
}

function canGenerateImages(
  client: GenerateOptions["gptClient"],
): client is GenerateOptions["gptClient"] & Pick<GPTClient, "generateImage"> {
  return typeof client.generateImage === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const DEFAULT_GENERATION_SEED = 1337;

export type GenerationProgressStep =
  | "prompt"
  | "model"
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

const ACTION_SCHEMA_DEFINITION: JsonSchemaDefinition = {
  name: String(actionSchema.$id ?? "Action"),
  schema: actionSchema as unknown as Record<string, unknown>,
  description: "Schema for action entries",
};

const ITEM_SCHEMA_DEFINITION: JsonSchemaDefinition = {
  name: String(itemSchema.$id ?? "Item"),
  schema: itemSchema as unknown as Record<string, unknown>,
  description: "Schema for item entries",
};

const ACTOR_SCHEMA_DEFINITION: JsonSchemaDefinition = {
  name: String(actorSchema.$id ?? "Actor"),
  schema: actorSchema as unknown as Record<string, unknown>,
  description: "Schema for actor entries",
};

export async function generateAction(
  input: ActionPromptInput,
  options: GenerateOptions,
): Promise<ActionSchemaData> {
  const { gptClient, maxAttempts, seed = DEFAULT_GENERATION_SEED } = options;
  reportProgress(options, {
    step: "prompt",
    message: "Preparing action prompt...",
    percent: 10,
  });
  const prompt = buildActionPrompt(input);
  reportProgress(options, {
    step: "model",
    message: "Generating action JSON with GPT...",
    percent: 35,
  });
  const draft = await gptClient.generateWithSchema<ActionSchemaData>(
    prompt,
    ACTION_SCHEMA_DEFINITION,
    { seed },
  );

  reportProgress(options, {
    step: "validation",
    message: "Validating and repairing action structure...",
    percent: 75,
  });
  const validated = await ensureValid({
    type: "action",
    payload: draft,
    gptClient,
    maxAttempts,
    schema: ACTION_SCHEMA_DEFINITION,
  });
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
  const { gptClient, maxAttempts, seed = DEFAULT_GENERATION_SEED } = options;
  reportProgress(options, {
    step: "prompt",
    message: "Preparing item prompt...",
    percent: 10,
  });
  const prompt = buildItemPrompt(input);
  reportProgress(options, {
    step: "model",
    message: "Generating item JSON with GPT...",
    percent: 35,
  });
  const draft = await gptClient.generateWithSchema<ItemSchemaData>(
    prompt,
    ITEM_SCHEMA_DEFINITION,
    { seed },
  );

  reportProgress(options, {
    step: "validation",
    message: "Validating and repairing item structure...",
    percent: 70,
  });
  const canonical = await ensureValid({
    type: "item",
    payload: draft,
    gptClient,
    maxAttempts,
    schema: ITEM_SCHEMA_DEFINITION,
  });

  if (input.generateItemImage && canGenerateImages(gptClient)) {
    reportProgress(options, {
      step: "image",
      message: "Generating transparent item icon...",
      percent: 85,
    });
    try {
      const generatedImage = await generateItemImage(gptClient, {
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
  const { gptClient, maxAttempts, seed = DEFAULT_GENERATION_SEED } = options;
  reportProgress(options, {
    step: "prompt",
    message: "Preparing actor prompt...",
    percent: 8,
  });
  const prompt = buildActorPrompt(input);
  reportProgress(options, {
    step: "model",
    message: "Generating actor JSON with GPT...",
    percent: 25,
  });
  const draft = await gptClient.generateWithSchema<ActorSchemaData>(
    prompt,
    ACTOR_SCHEMA_DEFINITION,
    { seed },
  );

  reportProgress(options, {
    step: "validation",
    message: "Validating and repairing actor structure...",
    percent: 55,
  });
  const canonical = await ensureValid({
    type: "actor",
    payload: draft,
    gptClient,
    maxAttempts,
    schema: ACTOR_SCHEMA_DEFINITION,
  });

  if (input.generateTokenImage && canGenerateImages(gptClient)) {
    reportProgress(options, {
      step: "image",
      message: "Generating transparent token image...",
      percent: 75,
    });
    try {
      const generatedToken = await generateTransparentTokenImage(gptClient, {
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
    message: "Resolving compendium links and finalizing actor data...",
    percent: 90,
  });
  const foundry = await toFoundryActorDataWithCompendium(canonical);

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
