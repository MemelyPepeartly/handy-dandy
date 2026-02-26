import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRuleElementGenerationPrompt,
  normalizeRuleElementGenerationResult,
  PF2E_RULE_ELEMENT_KEYS,
} from "../src/scripts/flows/rule-element-generator";

test("buildRuleElementGenerationPrompt includes request content and PF2E key catalog", () => {
  const prompt = buildRuleElementGenerationPrompt({
    objective: "Give +2 circumstance bonus to AC while wielding a shield.",
    targetItemType: "effect",
    preferredRuleKeys: ["FlatModifier", "AdjustModifier"],
    desiredRuleCount: 1,
    contextJson: JSON.stringify([{ key: "RollOption", option: "example" }]),
    constraints: "Use selector ac and avoid temporary hacks.",
  });

  assert.match(prompt, /Give \+2 circumstance bonus to AC/);
  assert.match(prompt, /Target item\/effect type:\neffect/);
  assert.match(prompt, /Preferred rule-element keys:\nFlatModifier, AdjustModifier/);
  assert.match(prompt, /Desired rule count:\n1/);
  assert.match(prompt, /Use only official PF2E rule-element keys/);
  assert.match(prompt, /FlatModifier/);
  assert.match(prompt, /AdjustModifier/);
  assert.equal(prompt.includes(PF2E_RULE_ELEMENT_KEYS[0]), true);
});

test("normalizeRuleElementGenerationResult keeps valid rule entries", () => {
  const normalized = normalizeRuleElementGenerationResult({
    systemId: "pf2e",
    summary: "Generated one modifier.",
    assumptions: ["Assume this is an effect item."],
    validationChecks: ["Selector ac exists for FlatModifier usage."],
    rules: [
      {
        key: "FlatModifier",
        selector: "ac",
        type: "circumstance",
        value: 6,
      },
    ],
  });

  assert.equal(normalized.systemId, "pf2e");
  assert.equal(normalized.rules.length, 1);
  assert.equal(normalized.rules[0].key, "FlatModifier");
  assert.equal(normalized.assumptions.length, 1);
});

test("normalizeRuleElementGenerationResult rejects payloads without valid rules", () => {
  assert.throws(
    () => normalizeRuleElementGenerationResult({
      systemId: "pf2e",
      summary: "No rules",
      assumptions: [],
      validationChecks: [],
      rules: [],
    }),
    /did not include any valid PF2E rule elements/,
  );

  assert.throws(
    () => normalizeRuleElementGenerationResult({
      systemId: "pf2e",
      summary: "Invalid key entries",
      assumptions: [],
      validationChecks: [],
      rules: [{ selector: "ac" }],
    }),
    /did not include any valid PF2E rule elements/,
  );
});
