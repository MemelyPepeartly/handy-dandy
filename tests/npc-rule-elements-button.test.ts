import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRuleElementsInput } from "../src/scripts/ui/npc-rule-elements-button";

test("parseRuleElementsInput accepts a top-level rules array", () => {
  const input = JSON.stringify([
    { key: "FlatModifier", selector: "attack-roll", type: "status", value: 2 },
    { key: "RollOption", option: "example-option", toggleable: true },
  ]);

  const parsed = parseRuleElementsInput(input);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.key, "FlatModifier");
  assert.equal(parsed[1]?.key, "RollOption");
});

test("parseRuleElementsInput accepts an object with a rules array", () => {
  const input = JSON.stringify({
    rules: [
      { key: "FlatModifier", selector: "fly-speed", type: "status", value: 10 },
    ],
  });

  const parsed = parseRuleElementsInput(input);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.key, "FlatModifier");
});

test("parseRuleElementsInput accepts an object with system.rules", () => {
  const input = JSON.stringify({
    system: {
      rules: [
        { key: "Aura", slug: "smoke-cloud", radius: 15, effects: [] },
      ],
    },
  });

  const parsed = parseRuleElementsInput(input);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.key, "Aura");
});

test("parseRuleElementsInput accepts a single rule element object", () => {
  const input = JSON.stringify({
    key: "RollOption",
    domain: "all",
    option: "example:toggle",
    toggleable: true,
  });

  const parsed = parseRuleElementsInput(input);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.key, "RollOption");
});

test("parseRuleElementsInput rejects malformed entries", () => {
  assert.throws(
    () => parseRuleElementsInput(JSON.stringify([{ selector: "attack-roll" }])),
    /non-empty string key/i,
  );

  assert.throws(
    () => parseRuleElementsInput(JSON.stringify({ data: { values: [] } })),
    /provide a rule element object, a rules array/i,
  );

  assert.throws(
    () => parseRuleElementsInput("{invalid"),
    /valid JSON/i,
  );
});
