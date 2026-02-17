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
import { generateTransparentTokenImage } from "./token-image";
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
}

function canGenerateImages(
  client: GenerateOptions["gptClient"],
): client is GenerateOptions["gptClient"] & Pick<GPTClient, "generateImage"> {
  return typeof client.generateImage === "function";
}

export const DEFAULT_GENERATION_SEED = 1337;

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
  const prompt = buildActionPrompt(input);
  const draft = await gptClient.generateWithSchema<ActionSchemaData>(
    prompt,
    ACTION_SCHEMA_DEFINITION,
    { seed },
  );

  return ensureValid({
    type: "action",
    payload: draft,
    gptClient,
    maxAttempts,
    schema: ACTION_SCHEMA_DEFINITION,
  });
}

export async function generateItem(
  input: ItemPromptInput,
  options: GenerateOptions,
): Promise<ItemSchemaData> {
  const { gptClient, maxAttempts, seed = DEFAULT_GENERATION_SEED } = options;
  const prompt = buildItemPrompt(input);
  const draft = await gptClient.generateWithSchema<ItemSchemaData>(
    prompt,
    ITEM_SCHEMA_DEFINITION,
    { seed },
  );

  const canonical = await ensureValid({
    type: "item",
    payload: draft,
    gptClient,
    maxAttempts,
    schema: ITEM_SCHEMA_DEFINITION,
  });

  const trimmedImg = canonical.img?.trim() ?? "";
  const resolvedImg = trimmedImg || getDefaultItemImage(canonical.itemType);

  if (resolvedImg === canonical.img) {
    return canonical;
  }

  return {
    ...canonical,
    img: resolvedImg,
  } satisfies ItemSchemaData;
}

export async function generateActor(
  input: ActorPromptInput,
  options: GenerateOptions,
): Promise<ActorGenerationResult> {
  const { gptClient, maxAttempts, seed = DEFAULT_GENERATION_SEED } = options;
  const prompt = buildActorPrompt(input);
  const draft = await gptClient.generateWithSchema<ActorSchemaData>(
    prompt,
    ACTOR_SCHEMA_DEFINITION,
    { seed },
  );

  const canonical = await ensureValid({
    type: "actor",
    payload: draft,
    gptClient,
    maxAttempts,
    schema: ACTOR_SCHEMA_DEFINITION,
  });

  if (input.generateTokenImage && canGenerateImages(gptClient)) {
    try {
      const generatedToken = await generateTransparentTokenImage(gptClient, {
        actorName: canonical.name,
        actorSlug: canonical.slug,
        actorDescription: canonical.description ?? input.referenceText,
        customPrompt: input.tokenPrompt,
      });
      canonical.img = generatedToken;
    } catch (error) {
      console.warn("Handy Dandy | Token image generation failed; using fallback actor image", error);
    }
  }

  const foundry = await toFoundryActorDataWithCompendium(canonical);

  return {
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
}
