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

test("repairPf2eInlineMacros canonicalizes broken action links in UUID and Compendium syntax", () => {
  const source =
    "<p>@uuid[compendium.pf2e.actionspf2e.item.strikes]{Strike} then @Compendium[pf2e.actionspf2e.steps]{Steps}</p>";
  const repaired = repairPf2eInlineMacros(source);

  assert.equal(
    repaired,
    "<p>@UUID[Compendium.pf2e.actionspf2e.Item.VjxZFuUXrCU94MWR]{Strike} then @UUID[Compendium.pf2e.actionspf2e.Item.UHpkTuCtyaPqiCAB]{Steps}</p>",
  );
});

test("repairPf2eInlineMacros rewrites action UUID name targets to action IDs", () => {
  const source = `Frequency once per round

Trigger Immediately after Dr. Stone makes a bomb @UUID[Compendium.pf2e.actionspf2e.Item.Strike]{Strike} (a Strike with a thrown bomb).

Dr. Stone vents a sharp burst of propellant and shifts his footing. He @UUID[Compendium.pf2e.actionspf2e.Item.Step]{Steps}.

If Dr. Stone is currently within smoke or behind cover, he can Step into that smoke or cover, or Step to another space within the same smoke or cover, without triggering reactions that would normally be triggered by movement (such as Reactive Strike).`;
  const repaired = repairPf2eInlineMacros(source);

  assert.match(repaired, /@UUID\[Compendium\.pf2e\.actionspf2e\.Item\.VjxZFuUXrCU94MWR\]\{Strike\}/);
  assert.match(repaired, /@UUID\[Compendium\.pf2e\.actionspf2e\.Item\.UHpkTuCtyaPqiCAB\]\{Steps\}/);
});

test("repairPf2eInlineMacros normalizes malformed inline @Damage formulas without nesting macros", () => {
  const source = "Deal @Damage[6d10+20 force damage], then deal 2d6 fire damage.";
  const repaired = repairPf2eInlineMacros(source);

  assert.equal(repaired, "Deal @Damage[(6d10+20)[force]], then deal @Damage[2d6[fire]] damage.");
});

test("repairPf2eInlineMacros normalizes malformed persistent @Damage formulas", () => {
  const source = "On a critical hit, apply @Damage[2d6 persistent fire damage].";
  const repaired = repairPf2eInlineMacros(source);

  assert.equal(repaired, "On a critical hit, apply @Damage[2d6[persistent,fire]].");
});
