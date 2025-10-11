import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectFailureMessages,
  exportSelectedEntities,
  formatBatchSummary,
  generateAndImportBatch,
  type GenerationBatchOptions,
} from "../src/scripts/flows/batch";
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

test("generateAndImportBatch aggregates mixed success and failure", async () => {
  const inputs: ActionPromptInput[] = [
    {
      systemId: "pf2e",
      title: "Sure Strike",
      referenceText: "Strike true.",
    },
    {
      systemId: "pf2e",
      title: "Failed Draft",
      referenceText: "This will fail generation.",
    },
    {
      systemId: "pf2e",
      title: "Import Trouble",
      referenceText: "Cause import failure.",
      slug: "import-error",
    },
  ];

  const generator = async (input: ActionPromptInput): Promise<ActionSchemaData> => {
    if (input.title === "Failed Draft") {
      throw new Error("Generation failed for Failed Draft");
    }

    const slug = input.slug ?? input.title.toLowerCase().replace(/\s+/g, "-");
    return {
      schema_version: 1,
      systemId: input.systemId,
      type: "action",
      slug,
      name: input.title,
      actionType: "one-action",
      requirements: "",
      description: "Strike with precision.",
      rarity: "common",
      traits: [],
      img: "",
    } satisfies ActionSchemaData;
  };

  const importer = async (data: ActionSchemaData): Promise<any> => {
    if (data.slug === "import-error") {
      throw new Error("Import failed for import-error");
    }

    return { uuid: `Item.${data.slug}` } as any;
  };

  const options: GenerationBatchOptions<"action"> = {
    type: "action",
    inputs,
    dependencies: {
      generators: { action: generator },
      importers: { action: importer },
    },
  };

  const result = await generateAndImportBatch(options);

  assert.equal(result.entries.length, 3);
  assert.equal(result.successCount, 1);
  assert.equal(result.failureCount, 2);
  assert.equal(result.summary, "Processed 3 actions: 1 succeeded, 2 failed.");

  const failures = collectFailureMessages(result.entries);
  assert.deepEqual(failures, [
    "Failed Draft: Generation failed for Failed Draft",
    "Import Trouble: Import failed for import-error",
  ]);

  const summaryAllSuccess = formatBatchSummary("actions", 2, 2, 0);
  assert.equal(summaryAllSuccess, "Processed 2 actions: all succeeded.");
});
