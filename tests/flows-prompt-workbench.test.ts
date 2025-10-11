import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectFailureMessages,
  exportSelectedEntities,
  formatBatchSummary,
  generateWorkbenchEntry,
  type PromptWorkbenchRequest,
} from "../src/scripts/flows/prompt-workbench";
import type { ActionPromptInput } from "../src/scripts/prompts";
import type { ActionSchemaData } from "../src/scripts/schemas";

function createActionDocument(overrides: Partial<Record<string, unknown>> = {}): any {
  return {
    documentName: "Item",
    name: "Power Attack",
    type: "action",
    toObject: () => ({
      name: "Power Attack",
      type: "action",
      img: "icons/actions/power-attack.webp",
      system: {
        slug: "power-attack",
        description: { value: "<p>Strike with force.</p>" },
        traits: { value: ["attack"], rarity: "common" },
        actionType: { value: "one" },
        requirements: { value: "Wield a melee weapon." }
      }
    }),
    ...overrides,
  };
}

function createItemDocument(): any {
  return {
    documentName: "Item",
    name: "Resonant Blade",
    type: "weapon",
    toObject: () => ({
      name: "Resonant Blade",
      type: "weapon",
      img: "systems/pf2e/icons/default-icons/weapon.svg",
      system: {
        description: { value: "<p>Shiny blade.</p>" },
        level: { value: 2 },
        traits: { value: ["magical"], rarity: "uncommon" },
        price: { value: { gp: 12 } }
      }
    })
  };
}

test("exportSelectedEntities returns canonical JSON and failure details", () => {
  const successAction = createActionDocument();
  const successItem = createItemDocument();
  const failingDoc = createActionDocument({
    name: "Broken",
    toObject: () => {
      throw new Error("Document access failed");
    }
  });

  const result = exportSelectedEntities({ documents: [successAction, successItem, failingDoc] });

  assert.equal(result.entries.length, 3);
  assert.equal(result.successCount, 2);
  assert.equal(result.failureCount, 1);
  assert.equal(result.summary, "Processed 3 documents: 2 succeeded, 1 failed.");

  const exported = JSON.parse(result.json) as unknown[];
  assert.equal(exported.length, 2);
  assert.ok(exported.every((entry) => typeof entry === "object" && entry !== null));

  const failures = collectFailureMessages(result.entries);
  assert.deepEqual(failures, ["Broken: Document access failed"]);
});

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

  const summaryAllSuccess = formatBatchSummary("actions", 2, 2, 0);
  assert.equal(summaryAllSuccess, "Processed 2 actions: all succeeded.");

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
