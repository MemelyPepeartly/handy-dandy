import assert from "node:assert/strict";
import { test } from "node:test";
import { createEnsureValidRetryHandler } from "../src/scripts/ui/ensure-valid-toast";
import { EnsureValidError } from "../src/scripts/validation/ensure-valid";

(globalThis as any).ui = {
  notifications: {
    info: () => undefined,
    error: () => undefined,
  },
};

test("createEnsureValidRetryHandler invokes repair and importer", async () => {
  let repairCalls = 0;
  const error = new EnsureValidError<"item">(
    "Failed",
    [],
    {},
    {},
    {
      type: "item",
      repair: async () => {
        repairCalls += 1;
        return {
          schema_version: 3,
          systemId: "pf2e",
          type: "item",
          slug: "retry",
          name: "Retry",
          itemType: "wand",
          rarity: "common",
          source: "",
        } as any;
      },
    },
  );

  let importerCalled = false;
  const handler = createEnsureValidRetryHandler({
    type: "item",
    name: "Retry",
    error,
    importer: async (json) => {
      importerCalled = true;
      assert.equal(json.name, "Retry");
      return {};
    },
    importerOptions: {},
  });

  await handler();

  assert.equal(repairCalls, 1);
  assert.equal(importerCalled, true);
});
