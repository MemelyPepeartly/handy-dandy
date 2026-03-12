import { toFoundryActorDataWithCompendium } from "../mappers/import";
import type {
  ActorSchemaData,
  SchemaDataFor,
  SchemaMap,
  ValidatorKey,
} from "../schemas";
import { schemas } from "../schemas";
import type {
  GenerateWithSchemaOptions,
  JsonSchemaDefinition,
  OpenRouterClient,
} from "../openrouter/client";
import { ensureValid } from "../validation/ensure-valid";

export type StructuredGenerationClient = Pick<OpenRouterClient, "generateWithSchema">;

type ActorMappingOptions = Parameters<typeof toFoundryActorDataWithCompendium>[1];

function getSchemaName<K extends ValidatorKey>(type: K, schema: SchemaMap[K]): string {
  if (typeof schema === "object" && schema !== null && "$id" in schema) {
    const schemaId = (schema as { $id?: unknown }).$id;
    if (typeof schemaId === "string" && schemaId.trim().length > 0) {
      return schemaId;
    }
  }

  return `${type}-schema`;
}

export function getSchemaDefinition<K extends ValidatorKey>(type: K): JsonSchemaDefinition {
  const schema = schemas[type];
  return {
    name: getSchemaName(type, schema),
    schema: schema as unknown as Record<string, unknown>,
    description: `Schema for ${type} entries`,
  };
}

export async function generateStructuredOutput<T>(
  client: StructuredGenerationClient,
  prompt: string,
  schema: JsonSchemaDefinition,
  options?: GenerateWithSchemaOptions,
): Promise<T> {
  return client.generateWithSchema<T>(prompt, schema, options);
}

export async function normalizeGeneratedEntity<K extends ValidatorKey>(
  type: K,
  payload: unknown,
): Promise<SchemaDataFor<K>> {
  return ensureValid({
    type,
    payload,
  });
}

export async function generateCanonicalEntity<K extends ValidatorKey>(
  client: StructuredGenerationClient,
  type: K,
  prompt: string,
  options?: GenerateWithSchemaOptions,
): Promise<SchemaDataFor<K>> {
  const draft = await generateStructuredOutput<SchemaDataFor<K>>(
    client,
    prompt,
    getSchemaDefinition(type),
    options,
  );

  return normalizeGeneratedEntity(type, draft);
}

export async function mapCanonicalActor(
  canonical: ActorSchemaData,
  options?: ActorMappingOptions,
): Promise<Awaited<ReturnType<typeof toFoundryActorDataWithCompendium>>> {
  return toFoundryActorDataWithCompendium(canonical, options);
}
