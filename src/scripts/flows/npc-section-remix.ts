import { CONSTANTS } from "../constants";
import { fromFoundryActor } from "../mappers/export";
import type { ActorSchemaData } from "../schemas";
import { runNpcRemixWithRequest, type NpcRemixRequest } from "./npc-remix";

type InventoryRemixFormResponse = {
  goal: string;
  targetLevel: string;
  minimumItems: string;
  preserveExisting: string | null;
  includeWeapon: string | null;
  includeArmor: string | null;
  includeConsumable: string | null;
  includeEquipment: string | null;
  mustInclude: string;
  avoid: string;
  instructions: string;
};

type SpellRemixFormResponse = {
  goal: string;
  targetLevel: string;
  minimumEntries: string;
  minimumSpells: string;
  preserveExisting: string | null;
  includeCantrips: string | null;
  focusOffense: string | null;
  focusControl: string | null;
  focusDefense: string | null;
  focusUtility: string | null;
  mustInclude: string;
  avoid: string;
  instructions: string;
};

type MainSheetRemixFormResponse = {
  targetLevel: string;
  regenerateCore: string | null;
  regenerateDefenses: string | null;
  regenerateSkills: string | null;
  regenerateStrikes: string | null;
  regenerateActions: string | null;
  regenerateInventory: string | null;
  regenerateSpells: string | null;
  regenerateNarrative: string | null;
  generateTokenImage: string | null;
  tokenPrompt: string;
  instructions: string;
};

function escapeHtml(value: string): string {
  const utils = foundry.utils as { escapeHTML?: (input: string) => string };
  if (typeof utils.escapeHTML === "function") {
    return utils.escapeHTML(value);
  }

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMinimum(value: string, fallback: number): number {
  const parsed = parseOptionalNumber(value);
  if (typeof parsed !== "number") {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
}

function splitCsvList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function summarizeInventory(canonical: ActorSchemaData): string {
  const entries = canonical.inventory ?? [];
  if (!entries.length) {
    return "No inventory entries.";
  }
  return entries.slice(0, 12).map((entry) => entry.name).join(", ");
}

function summarizeSpells(canonical: ActorSchemaData): string {
  const entries = canonical.spellcasting ?? [];
  if (!entries.length) {
    return "No spellcasting entries.";
  }

  const labels: string[] = [];
  for (const entry of entries.slice(0, 4)) {
    const sample = entry.spells
      .slice(0, 6)
      .map((spell) => spell.name)
      .join(", ");
    labels.push(`${entry.name}: ${sample || "no spells listed"}`);
  }

  return labels.join(" | ");
}

function countSpells(canonical: ActorSchemaData): number {
  const entries = canonical.spellcasting ?? [];
  let total = 0;
  for (const entry of entries) {
    total += entry.spells.length;
  }
  return total;
}

function summarizeMainSheetProfile(canonical: ActorSchemaData): string {
  const saves = canonical.attributes.saves;
  const hp = canonical.attributes.hp;
  const ac = canonical.attributes.ac;
  const perception = canonical.attributes.perception;
  const skills = canonical.skills?.length ?? 0;
  const strikes = canonical.strikes?.length ?? 0;
  const actions = canonical.actions?.length ?? 0;
  const inventory = canonical.inventory?.length ?? 0;
  const spellEntries = canonical.spellcasting?.length ?? 0;
  const spellCount = countSpells(canonical);

  return [
    `Level ${canonical.level}`,
    `HP ${hp.value}/${hp.max}`,
    `AC ${ac.value}`,
    `Perception +${perception.value}`,
    `Saves F+${saves.fortitude.value} R+${saves.reflex.value} W+${saves.will.value}`,
    `${skills} skills`,
    `${strikes} strikes`,
    `${actions} actions`,
    `${inventory} inventory`,
    `${spellEntries} spell entr${spellEntries === 1 ? "y" : "ies"} (${spellCount} spells)`,
  ].join(" | ");
}

function buildInventoryGoalDirective(goal: string): string {
  switch (goal) {
    case "expand":
      return "Expand the current inventory with more tactical and utility coverage.";
    case "retheme":
      return "Retheme the inventory while keeping role-appropriate effectiveness.";
    case "rebuild":
      return "Rebuild the inventory from scratch while maintaining PF2E correctness.";
    case "upgrade":
    default:
      return "Upgrade the current inventory with level-appropriate improvements.";
  }
}

function buildSpellGoalDirective(goal: string): string {
  switch (goal) {
    case "retheme":
      return "Retheme spellcasting around a new magical concept while keeping robust coverage.";
    case "rebuild":
      return "Rebuild spellcasting from scratch while preserving PF2E validity and breadth.";
    case "boss":
      return "Upgrade spellcasting for a high-impact encounter profile.";
    case "expand":
    default:
      return "Expand and improve the existing spell package rather than shrinking it.";
  }
}

function buildFocusList(response: SpellRemixFormResponse): string[] {
  const result: string[] = [];
  if (response.focusOffense) result.push("offense");
  if (response.focusControl) result.push("control");
  if (response.focusDefense) result.push("defense");
  if (response.focusUtility) result.push("utility");
  return result;
}

async function promptInventoryRemixRequest(
  canonical: ActorSchemaData,
): Promise<NpcRemixRequest | null> {
  const inventoryCount = canonical.inventory?.length ?? 0;
  const defaultMinimum = Math.max(3, Math.min(inventoryCount || 4, 12));
  const defaultTargetLevel = String(Math.max(0, Math.trunc(canonical.level)));

  const content = `
    <form class="handy-dandy-remix-inventory-form" style="display:flex;flex-direction:column;gap:0.75rem;min-width:620px;">
      <div style="padding:0.5rem 0.65rem;border:1px solid rgba(0,0,0,0.18);border-radius:8px;background:rgba(0,0,0,0.04);">
        <strong>Inventory Remix Planner</strong>
        <div class="notes">Current items (${inventoryCount}): ${escapeHtml(summarizeInventory(canonical))}</div>
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-inv-goal">Remix Goal</label>
        <select id="handy-dandy-remix-inv-goal" name="goal">
          <option value="upgrade">Upgrade Existing Loadout</option>
          <option value="expand">Expand Tactical Coverage</option>
          <option value="retheme">Retheme Gear Package</option>
          <option value="rebuild">Full Gear Rebuild</option>
        </select>
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-inv-target-level">Target Level (optional)</label>
        <input id="handy-dandy-remix-inv-target-level" type="number" name="targetLevel" min="0" value="${escapeHtml(defaultTargetLevel)}" />
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-inv-min-items">Minimum Inventory Entries</label>
        <input id="handy-dandy-remix-inv-min-items" type="number" name="minimumItems" min="1" value="${defaultMinimum}" />
      </div>
      <div class="form-group">
        <label><input type="checkbox" name="preserveExisting" checked /> Preserve existing named items where practical</label>
      </div>
      <fieldset style="border:1px solid rgba(0,0,0,0.2);border-radius:6px;padding:0.5rem 0.65rem;">
        <legend style="padding:0 0.2rem;">Required Item Categories</legend>
        <label style="display:block;"><input type="checkbox" name="includeWeapon" checked /> Weapon</label>
        <label style="display:block;"><input type="checkbox" name="includeArmor" checked /> Armor/Protection</label>
        <label style="display:block;"><input type="checkbox" name="includeConsumable" checked /> Consumable</label>
        <label style="display:block;"><input type="checkbox" name="includeEquipment" checked /> Utility Equipment</label>
      </fieldset>
      <div class="form-group">
        <label for="handy-dandy-remix-inv-must-include">Must Include (comma-separated names/tags)</label>
        <input id="handy-dandy-remix-inv-must-include" type="text" name="mustInclude" placeholder="cold iron weapon, healing potion, climbing kit" />
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-inv-avoid">Avoid (comma-separated)</label>
        <input id="handy-dandy-remix-inv-avoid" type="text" name="avoid" placeholder="fire items, shields, bombs" />
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-inv-instructions">Additional Instructions</label>
        <textarea id="handy-dandy-remix-inv-instructions" name="instructions" rows="5" placeholder="Any role/theme details for this inventory remix."></textarea>
      </div>
    </form>
  `;

  const response = await new Promise<InventoryRemixFormResponse | null>((resolve) => {
    let settled = false;
    const finish = (value: InventoryRemixFormResponse | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | Inventory Remix`,
        content,
        buttons: {
          remix: {
            icon: '<i class="fas fa-toolbox"></i>',
            label: "Run Remix",
            callback: (html) => {
              const form = html[0]?.querySelector("form");
              if (!(form instanceof HTMLFormElement)) {
                finish(null);
                return;
              }
              const formData = new FormData(form);
              finish({
                goal: String(formData.get("goal") ?? ""),
                targetLevel: String(formData.get("targetLevel") ?? ""),
                minimumItems: String(formData.get("minimumItems") ?? ""),
                preserveExisting: formData.get("preserveExisting") as string | null,
                includeWeapon: formData.get("includeWeapon") as string | null,
                includeArmor: formData.get("includeArmor") as string | null,
                includeConsumable: formData.get("includeConsumable") as string | null,
                includeEquipment: formData.get("includeEquipment") as string | null,
                mustInclude: String(formData.get("mustInclude") ?? ""),
                avoid: String(formData.get("avoid") ?? ""),
                instructions: String(formData.get("instructions") ?? ""),
              });
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => finish(null),
          },
        },
        default: "remix",
        close: () => finish(null),
      },
      { jQuery: true, width: 760 },
    );

    dialog.render(true);
  });

  if (!response) {
    return null;
  }

  const requiredCategories: string[] = [];
  if (response.includeWeapon) requiredCategories.push("weapon");
  if (response.includeArmor) requiredCategories.push("armor");
  if (response.includeConsumable) requiredCategories.push("consumable");
  if (response.includeEquipment) requiredCategories.push("equipment");

  const mustInclude = splitCsvList(response.mustInclude);
  const avoid = splitCsvList(response.avoid);
  const minimumItems = parseMinimum(response.minimumItems, defaultMinimum);
  const preserveExisting = Boolean(response.preserveExisting);
  const extraInstructions = response.instructions.trim();

  const instructionParts = [
    buildInventoryGoalDirective(response.goal),
    "Focus this remix on inventory quality and completeness without destabilizing unrelated sheet sections.",
    `Provide at least ${minimumItems} inventory entries.`,
    "Each inventory entry must include: name, itemType, quantity, level, description, and slug when official content exists.",
    preserveExisting
      ? "Preserve core existing inventory identity and extend it with better options."
      : "Replacing the loadout is allowed, but output must still be role-complete.",
  ];

  if (requiredCategories.length > 0) {
    instructionParts.push(`Ensure at least one entry for each category: ${requiredCategories.join(", ")}.`);
  }

  if (mustInclude.length > 0) {
    instructionParts.push(`Must include: ${mustInclude.join(", ")}.`);
  }

  if (avoid.length > 0) {
    instructionParts.push(`Avoid: ${avoid.join(", ")}.`);
  }

  if (extraInstructions) {
    instructionParts.push(extraInstructions);
  }

  return {
    mode: "equipment",
    instructions: instructionParts.join("\n"),
    targetLevel: parseOptionalNumber(response.targetLevel),
    minimumInventoryItems: minimumItems,
    preserveExistingInventory: preserveExisting,
  };
}

async function promptSpellRemixRequest(
  canonical: ActorSchemaData,
): Promise<NpcRemixRequest | null> {
  const entryCount = canonical.spellcasting?.length ?? 0;
  const spellCount = countSpells(canonical);
  const defaultMinimumEntries = Math.max(1, Math.min(entryCount || 1, 4));
  const defaultMinimumSpells = Math.max(3, Math.min(spellCount || 6, 14));
  const defaultTargetLevel = String(Math.max(0, Math.trunc(canonical.level)));

  const content = `
    <form class="handy-dandy-remix-spell-form" style="display:flex;flex-direction:column;gap:0.75rem;min-width:620px;">
      <div style="padding:0.5rem 0.65rem;border:1px solid rgba(0,0,0,0.18);border-radius:8px;background:rgba(0,0,0,0.04);">
        <strong>Spellcasting Remix Planner</strong>
        <div class="notes">Current entries: ${entryCount}; current spells: ${spellCount}</div>
        <div class="notes">${escapeHtml(summarizeSpells(canonical))}</div>
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-spell-goal">Remix Goal</label>
        <select id="handy-dandy-remix-spell-goal" name="goal">
          <option value="expand">Expand Existing Spell Arsenal</option>
          <option value="boss">Boss Encounter Upgrade</option>
          <option value="retheme">Retheme Spell Package</option>
          <option value="rebuild">Full Spellcasting Rebuild</option>
        </select>
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-spell-target-level">Target Level (optional)</label>
        <input id="handy-dandy-remix-spell-target-level" type="number" name="targetLevel" min="0" value="${escapeHtml(defaultTargetLevel)}" />
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-spell-min-entries">Minimum Spellcasting Entries</label>
        <input id="handy-dandy-remix-spell-min-entries" type="number" name="minimumEntries" min="1" value="${defaultMinimumEntries}" />
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-spell-min-spells">Minimum Total Spells</label>
        <input id="handy-dandy-remix-spell-min-spells" type="number" name="minimumSpells" min="3" value="${defaultMinimumSpells}" />
      </div>
      <div class="form-group">
        <label><input type="checkbox" name="preserveExisting" checked /> Preserve existing spell identity while expanding list</label>
      </div>
      <div class="form-group">
        <label><input type="checkbox" name="includeCantrips" checked /> Ensure cantrip/at-will coverage is present</label>
      </div>
      <fieldset style="border:1px solid rgba(0,0,0,0.2);border-radius:6px;padding:0.5rem 0.65rem;">
        <legend style="padding:0 0.2rem;">Spell Focus Mix</legend>
        <label style="display:block;"><input type="checkbox" name="focusOffense" checked /> Offense</label>
        <label style="display:block;"><input type="checkbox" name="focusControl" checked /> Control</label>
        <label style="display:block;"><input type="checkbox" name="focusDefense" /> Defense/Buffs</label>
        <label style="display:block;"><input type="checkbox" name="focusUtility" checked /> Utility</label>
      </fieldset>
      <div class="form-group">
        <label for="handy-dandy-remix-spell-must-include">Must Include (comma-separated spell names/themes)</label>
        <input id="handy-dandy-remix-spell-must-include" type="text" name="mustInclude" placeholder="slow, dispel magic, mental control" />
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-spell-avoid">Avoid (comma-separated)</label>
        <input id="handy-dandy-remix-spell-avoid" type="text" name="avoid" placeholder="fire, summon, incapacitation" />
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-spell-instructions">Additional Instructions</label>
        <textarea id="handy-dandy-remix-spell-instructions" name="instructions" rows="5" placeholder="Any additional guidance for spell identity and encounter role."></textarea>
      </div>
    </form>
  `;

  const response = await new Promise<SpellRemixFormResponse | null>((resolve) => {
    let settled = false;
    const finish = (value: SpellRemixFormResponse | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | Spell Remix`,
        content,
        buttons: {
          remix: {
            icon: '<i class="fas fa-book-sparkles"></i>',
            label: "Run Remix",
            callback: (html) => {
              const form = html[0]?.querySelector("form");
              if (!(form instanceof HTMLFormElement)) {
                finish(null);
                return;
              }
              const formData = new FormData(form);
              finish({
                goal: String(formData.get("goal") ?? ""),
                targetLevel: String(formData.get("targetLevel") ?? ""),
                minimumEntries: String(formData.get("minimumEntries") ?? ""),
                minimumSpells: String(formData.get("minimumSpells") ?? ""),
                preserveExisting: formData.get("preserveExisting") as string | null,
                includeCantrips: formData.get("includeCantrips") as string | null,
                focusOffense: formData.get("focusOffense") as string | null,
                focusControl: formData.get("focusControl") as string | null,
                focusDefense: formData.get("focusDefense") as string | null,
                focusUtility: formData.get("focusUtility") as string | null,
                mustInclude: String(formData.get("mustInclude") ?? ""),
                avoid: String(formData.get("avoid") ?? ""),
                instructions: String(formData.get("instructions") ?? ""),
              });
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => finish(null),
          },
        },
        default: "remix",
        close: () => finish(null),
      },
      { jQuery: true, width: 760 },
    );

    dialog.render(true);
  });

  if (!response) {
    return null;
  }

  const minimumEntries = parseMinimum(response.minimumEntries, defaultMinimumEntries);
  const minimumSpells = parseMinimum(response.minimumSpells, defaultMinimumSpells);
  const preserveExisting = Boolean(response.preserveExisting);
  const mustInclude = splitCsvList(response.mustInclude);
  const avoid = splitCsvList(response.avoid);
  const focus = buildFocusList(response);
  const includeCantrips = Boolean(response.includeCantrips);
  const extraInstructions = response.instructions.trim();

  const instructionParts = [
    buildSpellGoalDirective(response.goal),
    "Focus this remix on spellcasting quality, breadth, and usability.",
    `Provide at least ${minimumEntries} spellcasting entr${minimumEntries === 1 ? "y" : "ies"} and at least ${minimumSpells} total spells.`,
    "Each spellcasting entry must include name, tradition, castingType, attackBonus/saveDC, and spells with level + canonical spell names.",
    "Prefer official PF2E spells from compendia and keep canonical spell names/slugs.",
    preserveExisting
      ? "Preserve existing spellcasting identity and expand it instead of replacing with a tiny list."
      : "Replacement is allowed, but the resulting spell package must still be broad and tactical.",
  ];

  if (includeCantrips) {
    instructionParts.push("Ensure cantrip/at-will spell coverage is present.");
  }

  if (focus.length > 0) {
    instructionParts.push(`Spell focus priorities: ${focus.join(", ")}.`);
  }

  if (mustInclude.length > 0) {
    instructionParts.push(`Must include: ${mustInclude.join(", ")}.`);
  }

  if (avoid.length > 0) {
    instructionParts.push(`Avoid: ${avoid.join(", ")}.`);
  }

  if (extraInstructions) {
    instructionParts.push(extraInstructions);
  }

  return {
    mode: "spells",
    instructions: instructionParts.join("\n"),
    targetLevel: parseOptionalNumber(response.targetLevel),
    minimumSpellEntries: minimumEntries,
    minimumSpells,
    preserveExistingSpellcasting: preserveExisting,
  };
}

async function promptMainSheetRemixRequest(
  canonical: ActorSchemaData,
): Promise<NpcRemixRequest | null> {
  const defaultTargetLevel = String(Math.max(0, Math.trunc(canonical.level)));
  const inventoryCount = canonical.inventory?.length ?? 0;
  const spellEntryCount = canonical.spellcasting?.length ?? 0;
  const spellCount = countSpells(canonical);
  const minimumInventory = Math.max(1, Math.min(inventoryCount || 3, 12));
  const minimumSpellEntries = Math.max(1, Math.min(spellEntryCount || 1, 4));
  const minimumSpells = Math.max(3, Math.min(spellCount || 6, 14));

  const content = `
    <form class="handy-dandy-remix-main-sheet-form" style="display:flex;flex-direction:column;gap:0.75rem;min-width:680px;">
      <div style="padding:0.5rem 0.65rem;border:1px solid rgba(0,0,0,0.18);border-radius:8px;background:rgba(0,0,0,0.04);">
        <strong>Main Sheet Remix Planner</strong>
        <div class="notes">${escapeHtml(summarizeMainSheetProfile(canonical))}</div>
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-main-target-level">Target Level (optional)</label>
        <input id="handy-dandy-remix-main-target-level" type="number" name="targetLevel" min="0" value="${escapeHtml(defaultTargetLevel)}" />
      </div>
      <fieldset style="border:1px solid rgba(0,0,0,0.2);border-radius:6px;padding:0.5rem 0.65rem;">
        <legend style="padding:0 0.2rem;">Regenerate Sections</legend>
        <label style="display:block;"><input type="checkbox" name="regenerateCore" checked /> Core identity and baseline numbers (level, abilities, speed)</label>
        <label style="display:block;"><input type="checkbox" name="regenerateDefenses" checked /> Defenses (HP, AC, saves, resistances/weaknesses/immunities)</label>
        <label style="display:block;"><input type="checkbox" name="regenerateSkills" checked /> Perception and skills</label>
        <label style="display:block;"><input type="checkbox" name="regenerateStrikes" checked /> Strike attacks</label>
        <label style="display:block;"><input type="checkbox" name="regenerateActions" checked /> Action abilities/reactions/passives</label>
        <label style="display:block;"><input type="checkbox" name="regenerateInventory" /> Gear and inventory</label>
        <label style="display:block;"><input type="checkbox" name="regenerateSpells" /> Spellcasting entries and spell lists</label>
        <label style="display:block;"><input type="checkbox" name="regenerateNarrative" /> Flavor text (public/private notes)</label>
      </fieldset>
      <div class="form-group">
        <label><input type="checkbox" name="generateTokenImage" /> Generate new transparent token portrait</label>
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-main-token-prompt">Token Prompt Override (optional)</label>
        <input id="handy-dandy-remix-main-token-prompt" type="text" name="tokenPrompt" placeholder="Optional token art direction" />
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-main-instructions">Additional Instructions</label>
        <textarea id="handy-dandy-remix-main-instructions" name="instructions" rows="5" placeholder="Theme, role, and encounter constraints for this remix pass."></textarea>
      </div>
    </form>
  `;

  const response = await new Promise<MainSheetRemixFormResponse | null>((resolve) => {
    let settled = false;
    const finish = (value: MainSheetRemixFormResponse | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | Main Sheet Remix`,
        content,
        buttons: {
          remix: {
            icon: '<i class="fas fa-sliders-h"></i>',
            label: "Run Remix",
            callback: (html) => {
              const form = html[0]?.querySelector("form");
              if (!(form instanceof HTMLFormElement)) {
                finish(null);
                return;
              }

              const formData = new FormData(form);
              finish({
                targetLevel: String(formData.get("targetLevel") ?? ""),
                regenerateCore: formData.get("regenerateCore") as string | null,
                regenerateDefenses: formData.get("regenerateDefenses") as string | null,
                regenerateSkills: formData.get("regenerateSkills") as string | null,
                regenerateStrikes: formData.get("regenerateStrikes") as string | null,
                regenerateActions: formData.get("regenerateActions") as string | null,
                regenerateInventory: formData.get("regenerateInventory") as string | null,
                regenerateSpells: formData.get("regenerateSpells") as string | null,
                regenerateNarrative: formData.get("regenerateNarrative") as string | null,
                generateTokenImage: formData.get("generateTokenImage") as string | null,
                tokenPrompt: String(formData.get("tokenPrompt") ?? ""),
                instructions: String(formData.get("instructions") ?? ""),
              });
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => finish(null),
          },
        },
        default: "remix",
        close: () => finish(null),
      },
      { jQuery: true, width: 820 },
    );

    dialog.render(true);
  });

  if (!response) {
    return null;
  }

  const regenerateCore = Boolean(response.regenerateCore);
  const regenerateDefenses = Boolean(response.regenerateDefenses);
  const regenerateSkills = Boolean(response.regenerateSkills);
  const regenerateStrikes = Boolean(response.regenerateStrikes);
  const regenerateActions = Boolean(response.regenerateActions);
  const regenerateInventory = Boolean(response.regenerateInventory);
  const regenerateSpells = Boolean(response.regenerateSpells);
  const regenerateNarrative = Boolean(response.regenerateNarrative);

  const selectedSections: string[] = [];
  if (regenerateCore) selectedSections.push("core identity");
  if (regenerateDefenses) selectedSections.push("defenses");
  if (regenerateSkills) selectedSections.push("skills/perception");
  if (regenerateStrikes) selectedSections.push("strikes");
  if (regenerateActions) selectedSections.push("action abilities");
  if (regenerateInventory) selectedSections.push("inventory");
  if (regenerateSpells) selectedSections.push("spellcasting");
  if (regenerateNarrative) selectedSections.push("narrative notes");

  if (!selectedSections.length) {
    ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Select at least one section to remix.`);
    return null;
  }

  const lockedSections = [
    !regenerateCore ? "core identity" : null,
    !regenerateDefenses ? "defenses" : null,
    !regenerateSkills ? "skills/perception" : null,
    !regenerateStrikes ? "strikes" : null,
    !regenerateActions ? "action abilities" : null,
    !regenerateInventory ? "inventory" : null,
    !regenerateSpells ? "spellcasting" : null,
    !regenerateNarrative ? "narrative notes" : null,
  ].filter((entry): entry is string => typeof entry === "string");

  const selectedCount = selectedSections.length;
  const mode = regenerateInventory && selectedCount === 1
    ? "equipment"
    : (regenerateSpells && selectedCount === 1 ? "spells" : "remake");
  const extraInstructions = response.instructions.trim();

  const instructionParts = [
    `Regenerate only these sections: ${selectedSections.join(", ")}.`,
    lockedSections.length > 0
      ? `Preserve all unselected sections exactly: ${lockedSections.join(", ")}.`
      : "All major sections are selected for regeneration.",
    "Maintain PF2E-valid actor structure and official-content alignment where possible.",
  ];

  if (regenerateCore) {
    instructionParts.push(
      "Rebuild core identity and baseline numbers (level fit, ability mods, movement profile, role coherence).",
    );
  }
  if (regenerateDefenses) {
    instructionParts.push(
      "Rebuild HP, AC, saves, and IWR details with level-appropriate balance and internally consistent values.",
    );
  }
  if (regenerateSkills) {
    instructionParts.push(
      "Rebuild perception and skills to match concept and challenge profile.",
    );
  }
  if (regenerateStrikes) {
    instructionParts.push(
      "Rebuild strike entries with valid attack bonuses, damage formulas, and trait-appropriate design.",
    );
  }
  if (regenerateActions) {
    instructionParts.push(
      "Rebuild non-strike action abilities/reactions/passives with correct PF2E-style formatting and encounter utility.",
    );
  }
  if (regenerateInventory) {
    instructionParts.push(
      `Rebuild inventory with at least ${minimumInventory} meaningful entries using valid PF2E item categories (armor, weapon, equipment, consumable).`,
    );
    instructionParts.push("Do not emit feat/feature documents in inventory.");
  }
  if (regenerateSpells) {
    instructionParts.push(
      `Rebuild spellcasting with at least ${minimumSpellEntries} entr${minimumSpellEntries === 1 ? "y" : "ies"} and at least ${minimumSpells} total spells.`,
    );
  }
  if (regenerateNarrative) {
    instructionParts.push(
      "Refresh public/private notes while preserving mechanical clarity and usability.",
    );
  }

  if (extraInstructions) {
    instructionParts.push(extraInstructions);
  }

  return {
    mode,
    instructions: instructionParts.join("\n"),
    targetLevel: parseOptionalNumber(response.targetLevel),
    generateTokenImage: Boolean(response.generateTokenImage) || undefined,
    tokenPrompt: response.tokenPrompt.trim() || undefined,
    minimumInventoryItems: regenerateInventory ? minimumInventory : undefined,
    minimumSpellEntries: regenerateSpells ? minimumSpellEntries : undefined,
    minimumSpells: regenerateSpells ? minimumSpells : undefined,
    preserveExistingInventory: regenerateInventory ? true : undefined,
    preserveExistingSpellcasting: regenerateSpells ? true : undefined,
  };
}

export async function runNpcInventoryRemixFlow(actor: Actor): Promise<void> {
  const canonical = fromFoundryActor(actor.toObject() as any);
  const request = await promptInventoryRemixRequest(canonical);
  if (!request) {
    return;
  }

  await runNpcRemixWithRequest(actor, request);
}

export async function runNpcSpellRemixFlow(actor: Actor): Promise<void> {
  const canonical = fromFoundryActor(actor.toObject() as any);
  const request = await promptSpellRemixRequest(canonical);
  if (!request) {
    return;
  }

  await runNpcRemixWithRequest(actor, request);
}

export async function runNpcMainSheetRemixFlow(actor: Actor): Promise<void> {
  const canonical = fromFoundryActor(actor.toObject() as any);
  const request = await promptMainSheetRemixRequest(canonical);
  if (!request) {
    return;
  }

  await runNpcRemixWithRequest(actor, request);
}
