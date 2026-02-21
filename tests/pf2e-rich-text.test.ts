import assert from "node:assert/strict";
import { test } from "node:test";

import { repairPf2eInlineMacros } from "../src/scripts/text/pf2e-rich-text";

test("repairPf2eInlineMacros repairs check, damage, and template text inside HTML descriptions", () => {
  const source = "<p>DC 24 Reflex save, 2d6 fire damage, and a 20-foot burst.</p>";
  const repaired = repairPf2eInlineMacros(source);

  assert.equal(
    repaired,
    "<p>@Check[reflex|dc:24] save, @Damage[2d6[fire]] damage, and a @Template[type:burst|distance:20].</p>",
  );
});

test("repairPf2eInlineMacros preserves HTML wrappers while normalizing macro casing", () => {
  const source = "<p>@check[will|dc:20] and @damage[1d4[acid]]</p>";
  const repaired = repairPf2eInlineMacros(source);

  assert.equal(repaired, "<p>@Check[will|dc:20] and @Damage[1d4[acid]]</p>");
});

test("repairPf2eInlineMacros links condition text to PF2E UUID macros", () => {
  const source = "The target is off-guard 2 until the start of your next turn.";
  const repaired = repairPf2eInlineMacros(source);

  assert.equal(
    repaired,
    "The target is @UUID[Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg]{Off-Guard 2} until the start of your next turn.",
  );
});
