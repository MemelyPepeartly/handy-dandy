import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateWorkbenchEntry,
  type PromptWorkbenchRequest,
} from "../src/scripts/flows/prompt-workbench";
import type { ActionPromptInput } from "../src/scripts/prompts";
import type { ActionSchemaData } from "../src/scripts/schemas";

test("generateWorkbenchEntry returns data and importer helpers", async () => {
  const generator = async (input: ActionPromptInput): Promise<ActionSchemaData> => {
    if (input.title === "Unlucky Draft") {
      throw new Error("Generation failed for Unlucky Draft");
    }

    const slug = input.slug ?? input.title.toLowerCase().replace(/\s+/g, "-");
    return {
      schema_version: 3,
      systemId: input.systemId,
      type: "action",
      slug,
      name: input.title,
      actionType: "one-action",
      requirements: "",
      description: "Strike with precision.",
      rarity: "common",
      traits: [],
      source: "",
    } satisfies ActionSchemaData;
  };

  const importer = async (data: ActionSchemaData): Promise<any> => {
    if (data.slug === "import-error") {
      throw new Error("Import failed for import-error");
    }

    return { uuid: `Item.${data.slug}` } as any;
  };

  const request: PromptWorkbenchRequest<"action"> = {
    type: "action",
    systemId: "pf2e",
    entryName: "Sure Strike",
    referenceText: "Strike true.",
    dependencies: {
      generators: { action: generator },
      importers: { action: importer },
    },
  };

  const result = await generateWorkbenchEntry(request);

  assert.equal(result.name, "Sure Strike");
  assert.equal(result.data.slug, "sure-strike");
  assert.equal(result.data.type, "action");

  assert.ok(result.importer, "Importer helper should be provided when available");
  const document = await result.importer?.();
  assert.deepEqual(document, { uuid: "Item.sure-strike" });

  const failureRequest: PromptWorkbenchRequest<"action"> = {
    type: "action",
    systemId: "pf2e",
    entryName: "Import Trouble",
    referenceText: "Cause import failure.",
    slug: "import-error",
    dependencies: {
      generators: { action: generator },
      importers: { action: importer },
    },
  };

  const failureResult = await generateWorkbenchEntry(failureRequest);
  await assert.rejects(() => failureResult.importer?.(), /Import failed for import-error/);
});
