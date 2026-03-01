import { CONSTANTS } from "../constants";
import { generateTransparentTokenImage } from "../generation/token-image";
import { fromFoundryActor } from "../mappers/export";
import { toFoundryActorDataWithCompendium } from "../mappers/import";
import type { JsonSchemaDefinition, OpenRouterClient } from "../openrouter/client";
import { actorSchema, type ActorSchemaData } from "../schemas";
import { showGeneratedOutputRecoveryDialog } from "../ui/generated-output-recovery";
import { showRemixSummaryDialog, type RemixSummaryRow } from "../ui/remix-summary";
import { ensureValid } from "../validation/ensure-valid";

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
  inventoryGoal: string;
  minimumInventoryItems: string;
  preserveExistingInventory: string | null;
  includeWeapon: string | null;
  includeArmor: string | null;
  includeConsumable: string | null;
  includeEquipment: string | null;
  inventoryMustInclude: string;
  inventoryAvoid: string;
  spellGoal: string;
  minimumSpellEntries: string;
  minimumSpells: string;
  preserveExistingSpellcasting: string | null;
  includeCantrips: string | null;
  focusOffense: string | null;
  focusControl: string | null;
  focusDefense: string | null;
  focusUtility: string | null;
  spellMustInclude: string;
  spellAvoid: string;
  generateTokenImage: string | null;
  tokenPrompt: string;
  instructions: string;
};

type RemixSectionKey =
  | "core"
  | "defenses"
  | "skills"
  | "strikes"
  | "actions"
  | "inventory"
  | "spells"
  | "narrative";

type RemixSectionSelection = Record<RemixSectionKey, boolean>;
type SectionOperation = "add" | "replace";

type ActorInventoryEntry = NonNullable<ActorSchemaData["inventory"]>[number];
type ActorSpellcastingEntry = NonNullable<ActorSchemaData["spellcasting"]>[number];

interface InventoryRemixOptions {
  goal: string;
  operation: SectionOperation;
  minimumItems: number;
  preserveExisting: boolean;
  requiredCategories: string[];
  mustInclude: string[];
  avoid: string[];
}

interface SpellRemixOptions {
  goal: string;
  operation: SectionOperation;
  minimumEntries: number;
  minimumSpells: number;
  preserveExisting: boolean;
  includeCantrips: boolean;
  focus: string[];
  mustInclude: string[];
  avoid: string[];
}

interface MainSheetRemixRequest {
  sections: RemixSectionSelection;
  instructions: string;
  targetLevel?: number;
  generateTokenImage?: boolean;
  tokenPrompt?: string;
  inventory: InventoryRemixOptions;
  spells: SpellRemixOptions;
}

interface SectionRemixPatch {
  core?: {
    level: number;
    size: ActorSchemaData["size"];
    traits: string[];
    alignment: string | null;
    languages: string[];
    abilities: ActorSchemaData["abilities"];
    speed: ActorSchemaData["attributes"]["speed"];
  };
  defenses?: {
    hp: ActorSchemaData["attributes"]["hp"];
    ac: ActorSchemaData["attributes"]["ac"];
    saves: ActorSchemaData["attributes"]["saves"];
    immunities: ActorSchemaData["attributes"]["immunities"];
    weaknesses: ActorSchemaData["attributes"]["weaknesses"];
    resistances: ActorSchemaData["attributes"]["resistances"];
  };
  skills?: {
    perception: ActorSchemaData["attributes"]["perception"];
    skills: ActorSchemaData["skills"];
  };
  strikes?: ActorSchemaData["strikes"];
  actions?: ActorSchemaData["actions"];
  inventory?: ActorSchemaData["inventory"];
  spellcasting?: ActorSchemaData["spellcasting"];
  narrative?: {
    description: string | null;
    recallKnowledge: string | null;
  };
}

type FoundryActorSourceLike = Awaited<ReturnType<typeof toFoundryActorDataWithCompendium>>;
type FoundryActorItemLike = Record<string, unknown> & {
  _id?: string;
  type?: string;
  name?: string;
  system?: Record<string, unknown>;
};
type SectionRemixClient = Pick<OpenRouterClient, "generateWithSchema"> &
  Partial<Pick<OpenRouterClient, "generateImage">>;

const INVENTORY_ITEM_TYPES = new Set(["armor", "weapon", "equipment", "consumable"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  const foundryUtils = (globalThis as {
    foundry?: { utils?: { deepClone?: <U>(input: U) => U } };
  }).foundry?.utils;
  if (foundryUtils?.deepClone) {
    return foundryUtils.deepClone(value);
  }

  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

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

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function describeTextLength(value: string | null | undefined): string {
  const length = typeof value === "string" ? value.trim().length : 0;
  return length > 0 ? `${length} chars` : "Empty";
}

function buildSectionRemixSummaryRows(
  beforeState: ActorSchemaData,
  afterState: ActorSchemaData,
  request: MainSheetRemixRequest,
): RemixSummaryRow[] {
  const rows: RemixSummaryRow[] = [];

  if (request.sections.core) {
    rows.push(
      {
        label: "Level",
        before: String(beforeState.level),
        after: String(afterState.level),
      },
      {
        label: "Size",
        before: beforeState.size,
        after: afterState.size,
      },
      {
        label: "Speed",
        before: `${beforeState.attributes.speed.value} ft`,
        after: `${afterState.attributes.speed.value} ft`,
      },
    );
  }

  if (request.sections.defenses) {
    rows.push(
      {
        label: "HP (max)",
        before: String(beforeState.attributes.hp.max),
        after: String(afterState.attributes.hp.max),
      },
      {
        label: "AC",
        before: String(beforeState.attributes.ac.value),
        after: String(afterState.attributes.ac.value),
      },
      {
        label: "Saves",
        before: `F${formatSigned(beforeState.attributes.saves.fortitude.value)} / R${formatSigned(beforeState.attributes.saves.reflex.value)} / W${formatSigned(beforeState.attributes.saves.will.value)}`,
        after: `F${formatSigned(afterState.attributes.saves.fortitude.value)} / R${formatSigned(afterState.attributes.saves.reflex.value)} / W${formatSigned(afterState.attributes.saves.will.value)}`,
      },
    );
  }

  if (request.sections.skills) {
    rows.push(
      {
        label: "Perception",
        before: formatSigned(beforeState.attributes.perception.value),
        after: formatSigned(afterState.attributes.perception.value),
      },
      {
        label: "Skills",
        before: String(beforeState.skills?.length ?? 0),
        after: String(afterState.skills?.length ?? 0),
      },
    );
  }

  if (request.sections.strikes) {
    rows.push({
      label: "Strikes",
      before: String(beforeState.strikes?.length ?? 0),
      after: String(afterState.strikes?.length ?? 0),
    });
  }

  if (request.sections.actions) {
    rows.push({
      label: "Action Abilities",
      before: String(beforeState.actions?.length ?? 0),
      after: String(afterState.actions?.length ?? 0),
    });
  }

  if (request.sections.inventory) {
    rows.push({
      label: "Inventory Entries",
      before: String(beforeState.inventory?.length ?? 0),
      after: String(afterState.inventory?.length ?? 0),
      note: `${request.inventory.operation.toUpperCase()} operation`,
    });
  }

  if (request.sections.spells) {
    rows.push(
      {
        label: "Spellcasting Entries",
        before: String(beforeState.spellcasting?.length ?? 0),
        after: String(afterState.spellcasting?.length ?? 0),
        note: `${request.spells.operation.toUpperCase()} operation`,
      },
      {
        label: "Total Spells",
        before: String(countSpells(beforeState)),
        after: String(countSpells(afterState)),
      },
    );
  }

  if (request.sections.narrative) {
    rows.push(
      {
        label: "Public Description",
        before: describeTextLength(beforeState.description),
        after: describeTextLength(afterState.description),
      },
      {
        label: "Recall Knowledge",
        before: describeTextLength(beforeState.recallKnowledge),
        after: describeTextLength(afterState.recallKnowledge),
      },
    );
  }

  if (request.generateTokenImage) {
    rows.push({
      label: "Token Image",
      before: beforeState.img ?? "None",
      after: afterState.img ?? "None",
      note: "Generated image requested",
    });
  }

  return rows;
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
    case "add":
    case "expand":
      return "Add new inventory entries while keeping existing items.";
    case "enhance":
      return "Enhance existing inventory quality and usefulness while preserving current identity.";
    case "replace":
    case "rebuild":
      return "Replace inventory entries with a fresh loadout while maintaining PF2E correctness.";
    case "retheme":
      return "Retheme inventory while keeping role-appropriate effectiveness.";
    case "upgrade":
    default:
      return "Enhance existing inventory quality and usefulness while preserving current identity.";
  }
}

function buildSpellGoalDirective(goal: string): string {
  switch (goal) {
    case "add":
    case "expand":
      return "Add spells without removing the existing spell package.";
    case "enhance":
    case "boss":
      return "Enhance spell effectiveness and coverage while preserving the current package.";
    case "replace":
    case "rebuild":
      return "Replace spellcasting with a fresh PF2E-valid package.";
    case "retheme":
      return "Retheme spellcasting around a new magical concept while keeping robust coverage.";
    default:
      return "Enhance spell effectiveness and coverage while preserving the current package.";
  }
}

function buildFocusList(response: Pick<MainSheetRemixFormResponse, "focusOffense" | "focusControl" | "focusDefense" | "focusUtility">): string[] {
  const result: string[] = [];
  if (response.focusOffense) result.push("offense");
  if (response.focusControl) result.push("control");
  if (response.focusDefense) result.push("defense");
  if (response.focusUtility) result.push("utility");
  return result;
}

function resolveInventoryOperation(goal: string): SectionOperation {
  switch (goal) {
    case "replace":
    case "rebuild":
    case "retheme":
      return "replace";
    default:
      return "add";
  }
}

function resolveSpellOperation(goal: string): SectionOperation {
  switch (goal) {
    case "replace":
    case "rebuild":
    case "retheme":
      return "replace";
    default:
      return "add";
  }
}

function normalizeInventoryGoal(value: string): string {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "add":
    case "enhance":
    case "replace":
    case "retheme":
      return normalized;
    case "expand":
      return "add";
    case "upgrade":
      return "enhance";
    case "rebuild":
      return "replace";
    default:
      return "enhance";
  }
}

function normalizeSpellGoal(value: string): string {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "add":
    case "enhance":
    case "replace":
    case "retheme":
      return normalized;
    case "expand":
      return "add";
    case "upgrade":
    case "boss":
      return "enhance";
    case "rebuild":
      return "replace";
    default:
      return "add";
  }
}

function buildSectionSelection(response: MainSheetRemixFormResponse): RemixSectionSelection {
  return {
    core: Boolean(response.regenerateCore),
    defenses: Boolean(response.regenerateDefenses),
    skills: Boolean(response.regenerateSkills),
    strikes: Boolean(response.regenerateStrikes),
    actions: Boolean(response.regenerateActions),
    inventory: Boolean(response.regenerateInventory),
    spells: Boolean(response.regenerateSpells),
    narrative: Boolean(response.regenerateNarrative),
  };
}

function getSelectedSections(selection: RemixSectionSelection): RemixSectionKey[] {
  const sections: RemixSectionKey[] = [];
  for (const key of Object.keys(selection) as RemixSectionKey[]) {
    if (selection[key]) {
      sections.push(key);
    }
  }
  return sections;
}

function sectionLabel(key: RemixSectionKey): string {
  switch (key) {
    case "core":
      return "core identity";
    case "defenses":
      return "defenses";
    case "skills":
      return "skills/perception";
    case "strikes":
      return "strikes";
    case "actions":
      return "action abilities";
    case "inventory":
      return "inventory";
    case "spells":
      return "spellcasting";
    case "narrative":
      return "narrative notes";
    default:
      return key;
  }
}

async function promptMainSheetRemixRequest(
  canonical: ActorSchemaData,
): Promise<MainSheetRemixRequest | null> {
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
      <fieldset style="border:1px solid rgba(0,0,0,0.2);border-radius:6px;padding:0.5rem 0.65rem;">
        <legend style="padding:0 0.2rem;">Inventory Options (used when Gear and inventory is selected)</legend>
        <div class="notes">Current items (${inventoryCount}): ${escapeHtml(summarizeInventory(canonical))}</div>
        <div class="form-group">
          <label for="handy-dandy-remix-main-inventory-goal">Inventory Action</label>
          <select id="handy-dandy-remix-main-inventory-goal" name="inventoryGoal">
            <option value="enhance">Enhance</option>
            <option value="add">Add</option>
            <option value="replace">Replace</option>
            <option value="retheme">Retheme</option>
          </select>
        </div>
        <div class="form-group">
          <label for="handy-dandy-remix-main-minimum-inventory-items">Minimum Inventory Entries</label>
          <input id="handy-dandy-remix-main-minimum-inventory-items" type="number" name="minimumInventoryItems" min="1" value="${minimumInventory}" />
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="preserveExistingInventory" checked /> Preserve existing named items where practical</label>
        </div>
        <fieldset style="border:1px solid rgba(0,0,0,0.15);border-radius:6px;padding:0.5rem 0.65rem;">
          <legend style="padding:0 0.2rem;">Required Item Categories</legend>
          <label style="display:block;"><input type="checkbox" name="includeWeapon" checked /> Weapon</label>
          <label style="display:block;"><input type="checkbox" name="includeArmor" checked /> Armor/Protection</label>
          <label style="display:block;"><input type="checkbox" name="includeConsumable" checked /> Consumable</label>
          <label style="display:block;"><input type="checkbox" name="includeEquipment" checked /> Utility Equipment</label>
        </fieldset>
        <div class="form-group">
          <label for="handy-dandy-remix-main-inventory-must-include">Inventory Must Include (comma-separated)</label>
          <input id="handy-dandy-remix-main-inventory-must-include" type="text" name="inventoryMustInclude" placeholder="cold iron weapon, healing potion, climbing kit" />
        </div>
        <div class="form-group">
          <label for="handy-dandy-remix-main-inventory-avoid">Inventory Avoid (comma-separated)</label>
          <input id="handy-dandy-remix-main-inventory-avoid" type="text" name="inventoryAvoid" placeholder="fire items, shields, bombs" />
        </div>
      </fieldset>
      <fieldset style="border:1px solid rgba(0,0,0,0.2);border-radius:6px;padding:0.5rem 0.65rem;">
        <legend style="padding:0 0.2rem;">Spellcasting Options (used when Spellcasting is selected)</legend>
        <div class="notes">Entries: ${spellEntryCount}; Spells: ${spellCount}</div>
        <div class="notes">${escapeHtml(summarizeSpells(canonical))}</div>
        <div class="form-group">
          <label for="handy-dandy-remix-main-spell-goal">Spell Action</label>
          <select id="handy-dandy-remix-main-spell-goal" name="spellGoal">
            <option value="add">Add</option>
            <option value="enhance">Enhance</option>
            <option value="replace">Replace</option>
            <option value="retheme">Retheme</option>
          </select>
        </div>
        <div class="form-group">
          <label for="handy-dandy-remix-main-minimum-spell-entries">Minimum Spellcasting Entries</label>
          <input id="handy-dandy-remix-main-minimum-spell-entries" type="number" name="minimumSpellEntries" min="1" value="${minimumSpellEntries}" />
        </div>
        <div class="form-group">
          <label for="handy-dandy-remix-main-minimum-spells">Minimum Total Spells</label>
          <input id="handy-dandy-remix-main-minimum-spells" type="number" name="minimumSpells" min="3" value="${minimumSpells}" />
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="preserveExistingSpellcasting" checked /> Preserve existing spell identity while expanding list</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="includeCantrips" checked /> Ensure cantrip/at-will coverage is present</label>
        </div>
        <fieldset style="border:1px solid rgba(0,0,0,0.15);border-radius:6px;padding:0.5rem 0.65rem;">
          <legend style="padding:0 0.2rem;">Spell Focus Mix</legend>
          <label style="display:block;"><input type="checkbox" name="focusOffense" checked /> Offense</label>
          <label style="display:block;"><input type="checkbox" name="focusControl" checked /> Control</label>
          <label style="display:block;"><input type="checkbox" name="focusDefense" /> Defense/Buffs</label>
          <label style="display:block;"><input type="checkbox" name="focusUtility" checked /> Utility</label>
        </fieldset>
        <div class="form-group">
          <label for="handy-dandy-remix-main-spell-must-include">Spells Must Include (comma-separated)</label>
          <input id="handy-dandy-remix-main-spell-must-include" type="text" name="spellMustInclude" placeholder="slow, dispel magic, mental control" />
        </div>
        <div class="form-group">
          <label for="handy-dandy-remix-main-spell-avoid">Spells Avoid (comma-separated)</label>
          <input id="handy-dandy-remix-main-spell-avoid" type="text" name="spellAvoid" placeholder="fire, summon, incapacitation" />
        </div>
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
                inventoryGoal: String(formData.get("inventoryGoal") ?? ""),
                minimumInventoryItems: String(formData.get("minimumInventoryItems") ?? ""),
                preserveExistingInventory: formData.get("preserveExistingInventory") as string | null,
                includeWeapon: formData.get("includeWeapon") as string | null,
                includeArmor: formData.get("includeArmor") as string | null,
                includeConsumable: formData.get("includeConsumable") as string | null,
                includeEquipment: formData.get("includeEquipment") as string | null,
                inventoryMustInclude: String(formData.get("inventoryMustInclude") ?? ""),
                inventoryAvoid: String(formData.get("inventoryAvoid") ?? ""),
                spellGoal: String(formData.get("spellGoal") ?? ""),
                minimumSpellEntries: String(formData.get("minimumSpellEntries") ?? ""),
                minimumSpells: String(formData.get("minimumSpells") ?? ""),
                preserveExistingSpellcasting: formData.get("preserveExistingSpellcasting") as string | null,
                includeCantrips: formData.get("includeCantrips") as string | null,
                focusOffense: formData.get("focusOffense") as string | null,
                focusControl: formData.get("focusControl") as string | null,
                focusDefense: formData.get("focusDefense") as string | null,
                focusUtility: formData.get("focusUtility") as string | null,
                spellMustInclude: String(formData.get("spellMustInclude") ?? ""),
                spellAvoid: String(formData.get("spellAvoid") ?? ""),
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

  const sections = buildSectionSelection(response);
  const selectedSections = getSelectedSections(sections);
  if (selectedSections.length === 0) {
    ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Select at least one section to remix.`);
    return null;
  }

  const inventoryGoal = normalizeInventoryGoal(response.inventoryGoal);
  const spellGoal = normalizeSpellGoal(response.spellGoal);
  const inventoryMustInclude = splitCsvList(response.inventoryMustInclude);
  const inventoryAvoid = splitCsvList(response.inventoryAvoid);
  const spellMustInclude = splitCsvList(response.spellMustInclude);
  const spellAvoid = splitCsvList(response.spellAvoid);
  const requiredInventoryCategories: string[] = [];
  if (response.includeWeapon) requiredInventoryCategories.push("weapon");
  if (response.includeArmor) requiredInventoryCategories.push("armor");
  if (response.includeConsumable) requiredInventoryCategories.push("consumable");
  if (response.includeEquipment) requiredInventoryCategories.push("equipment");
  const spellFocus = buildFocusList(response);

  const inventoryOptions: InventoryRemixOptions = {
    goal: inventoryGoal,
    operation: resolveInventoryOperation(inventoryGoal),
    minimumItems: parseMinimum(response.minimumInventoryItems, Math.max(1, Math.min((canonical.inventory?.length ?? 0) || 3, 12))),
    preserveExisting: Boolean(response.preserveExistingInventory),
    requiredCategories: requiredInventoryCategories,
    mustInclude: inventoryMustInclude,
    avoid: inventoryAvoid,
  };

  const spellsOptions: SpellRemixOptions = {
    goal: spellGoal,
    operation: resolveSpellOperation(spellGoal),
    minimumEntries: parseMinimum(response.minimumSpellEntries, Math.max(1, Math.min((canonical.spellcasting?.length ?? 0) || 1, 4))),
    minimumSpells: parseMinimum(response.minimumSpells, Math.max(3, Math.min(countSpells(canonical) || 6, 14))),
    preserveExisting: Boolean(response.preserveExistingSpellcasting),
    includeCantrips: Boolean(response.includeCantrips),
    focus: spellFocus,
    mustInclude: spellMustInclude,
    avoid: spellAvoid,
  };

  const instructionParts: string[] = [
    `Regenerate only these sections: ${selectedSections.map((entry) => sectionLabel(entry)).join(", ")}.`,
    "Do not regenerate full actor JSON.",
    "Keep unselected sections untouched.",
    "Maintain PF2E-valid actor structure and official-content alignment where possible.",
  ];

  if (sections.inventory) {
    instructionParts.push(buildInventoryGoalDirective(inventoryGoal));
    instructionParts.push(`Inventory operation: ${inventoryOptions.operation.toUpperCase()}.`);
    instructionParts.push(`Inventory minimum entries: ${inventoryOptions.minimumItems}.`);
    if (inventoryOptions.preserveExisting) {
      instructionParts.push("Preserve existing named inventory identity where practical.");
    }
    if (inventoryOptions.requiredCategories.length > 0) {
      instructionParts.push(`Required inventory categories: ${inventoryOptions.requiredCategories.join(", ")}.`);
    }
    if (inventoryOptions.mustInclude.length > 0) {
      instructionParts.push(`Inventory must include: ${inventoryOptions.mustInclude.join(", ")}.`);
    }
    if (inventoryOptions.avoid.length > 0) {
      instructionParts.push(`Inventory should avoid: ${inventoryOptions.avoid.join(", ")}.`);
    }
  }

  if (sections.spells) {
    instructionParts.push(buildSpellGoalDirective(spellGoal));
    instructionParts.push(`Spellcasting operation: ${spellsOptions.operation.toUpperCase()}.`);
    instructionParts.push(`Minimum spellcasting entries: ${spellsOptions.minimumEntries}.`);
    instructionParts.push(`Minimum total spells: ${spellsOptions.minimumSpells}.`);
    if (spellsOptions.preserveExisting) {
      instructionParts.push("Preserve existing spellcasting identity where practical.");
    }
    if (spellsOptions.includeCantrips) {
      instructionParts.push("Ensure cantrip/at-will spell coverage is present.");
    }
    if (spellsOptions.focus.length > 0) {
      instructionParts.push(`Spell focus priorities: ${spellsOptions.focus.join(", ")}.`);
    }
    if (spellsOptions.mustInclude.length > 0) {
      instructionParts.push(`Spells must include: ${spellsOptions.mustInclude.join(", ")}.`);
    }
    if (spellsOptions.avoid.length > 0) {
      instructionParts.push(`Spells should avoid: ${spellsOptions.avoid.join(", ")}.`);
    }
  }

  const additionalInstructions = response.instructions.trim();
  if (additionalInstructions) {
    instructionParts.push(additionalInstructions);
  }

  return {
    sections,
    instructions: instructionParts.join("\n"),
    targetLevel: parseOptionalNumber(response.targetLevel),
    generateTokenImage: Boolean(response.generateTokenImage) || undefined,
    tokenPrompt: response.tokenPrompt.trim() || undefined,
    inventory: inventoryOptions,
    spells: spellsOptions,
  };
}

function getNestedValue(root: unknown, path: readonly string[]): unknown {
  let cursor: unknown = root;
  for (const segment of path) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function setUpdateValue(update: Record<string, unknown>, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  update[path] = clone(value);
}

function buildSectionContextSnapshot(canonical: ActorSchemaData, request: MainSheetRemixRequest): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    profile: summarizeMainSheetProfile(canonical),
  };

  if (request.sections.core) {
    snapshot.core = {
      level: canonical.level,
      size: canonical.size,
      traits: canonical.traits,
      alignment: canonical.alignment ?? null,
      languages: canonical.languages,
      abilities: canonical.abilities,
      speed: canonical.attributes.speed,
    };
  }

  if (request.sections.defenses) {
    snapshot.defenses = {
      hp: canonical.attributes.hp,
      ac: canonical.attributes.ac,
      saves: canonical.attributes.saves,
      immunities: canonical.attributes.immunities ?? [],
      weaknesses: canonical.attributes.weaknesses ?? [],
      resistances: canonical.attributes.resistances ?? [],
    };
  }

  if (request.sections.skills) {
    snapshot.skills = {
      perception: canonical.attributes.perception,
      skills: canonical.skills.slice(0, 40),
    };
  }

  if (request.sections.strikes) {
    snapshot.strikes = canonical.strikes.slice(0, 24);
  }

  if (request.sections.actions) {
    snapshot.actions = canonical.actions.slice(0, 24);
  }

  if (request.sections.inventory) {
    snapshot.inventory = {
      operation: request.inventory.operation,
      entries: (canonical.inventory ?? []).slice(0, 50),
    };
  }

  if (request.sections.spells) {
    snapshot.spellcasting = {
      operation: request.spells.operation,
      entries: (canonical.spellcasting ?? []).map((entry) => ({
        ...entry,
        spells: entry.spells.slice(0, 30),
      })).slice(0, 8),
    };
  }

  if (request.sections.narrative) {
    snapshot.narrative = {
      description: canonical.description ?? null,
      recallKnowledge: canonical.recallKnowledge ?? null,
    };
  }

  return snapshot;
}

function buildSectionRemixPrompt(actorName: string, canonical: ActorSchemaData, request: MainSheetRemixRequest): string {
  const selectedSections = getSelectedSections(request.sections);
  const unselectedSections = (Object.keys(request.sections) as RemixSectionKey[])
    .filter((section) => !request.sections[section]);
  const contextSnapshot = buildSectionContextSnapshot(canonical, request);

  const lines: string[] = [
    `Remix selected sections for PF2E NPC "${actorName}".`,
    "Return JSON only for the selected sections in the schema.",
    `Selected sections: ${selectedSections.map((section) => sectionLabel(section)).join(", ")}.`,
    unselectedSections.length > 0
      ? `Unselected sections must remain untouched in Foundry: ${unselectedSections.map((section) => sectionLabel(section)).join(", ")}.`
      : "All sections are selected.",
    "Do not regenerate full actor JSON.",
    request.targetLevel !== undefined
      ? `Target level context: ${Math.max(0, Math.trunc(request.targetLevel))}.`
      : `Target level context: keep current level (${canonical.level}) unless instructions say otherwise.`,
    "When canonical PF2E compendium entries exist, preserve official names/slugs so import can resolve to compendium items and spells.",
    "Use PF2E inline formatting in text fields: @Check, @Damage, @Template, @UUID.",
    request.sections.inventory
      ? `Inventory mode: ${request.inventory.operation.toUpperCase()} (${request.inventory.goal}).`
      : "",
    request.sections.spells
      ? `Spellcasting mode: ${request.spells.operation.toUpperCase()} (${request.spells.goal}).`
      : "",
    request.sections.inventory && request.inventory.operation === "add"
      ? "Inventory ADD mode: generate only entries to add or update, not a full duplicate list."
      : "",
    request.sections.spells && request.spells.operation === "add"
      ? "Spellcasting ADD mode: generate only entries/spells to add or update, not a full duplicate list."
      : "",
    "Current selected-section context JSON:",
    JSON.stringify(contextSnapshot, null, 2),
    "Remix instructions:",
    request.instructions,
  ];

  return lines.filter((entry) => entry.length > 0).join("\n\n");
}

function getRootSchemaProperties(): Record<string, unknown> {
  const raw = actorSchema as unknown as Record<string, unknown>;
  const properties = raw.properties;
  if (isRecord(properties)) {
    return properties;
  }
  return {};
}

function getObjectSchemaProperties(source: unknown): Record<string, unknown> {
  if (!isRecord(source)) {
    return {};
  }
  const properties = source.properties;
  if (isRecord(properties)) {
    return properties;
  }
  return {};
}

function cloneSchemaProperty(properties: Record<string, unknown>, key: string, fallback: Record<string, unknown>): Record<string, unknown> {
  const value = properties[key];
  if (isRecord(value)) {
    return clone(value);
  }
  return clone(fallback);
}

function buildSectionRemixSchema(request: MainSheetRemixRequest): JsonSchemaDefinition {
  const rootProps = getRootSchemaProperties();
  const attributesSchema = rootProps.attributes;
  const attributeProps = getObjectSchemaProperties(attributesSchema);

  const schemaProperties: Record<string, unknown> = {};
  const required: string[] = [];

  if (request.sections.core) {
    schemaProperties.core = {
      type: "object",
      additionalProperties: false,
      required: ["level", "size", "traits", "alignment", "languages", "abilities", "speed"],
      properties: {
        level: cloneSchemaProperty(rootProps, "level", { type: "integer", minimum: -1 }),
        size: cloneSchemaProperty(rootProps, "size", { type: "string" }),
        traits: cloneSchemaProperty(rootProps, "traits", { type: "array", items: { type: "string" } }),
        alignment: cloneSchemaProperty(rootProps, "alignment", { type: "string", nullable: true }),
        languages: cloneSchemaProperty(rootProps, "languages", { type: "array", items: { type: "string" } }),
        abilities: cloneSchemaProperty(rootProps, "abilities", { type: "object" }),
        speed: cloneSchemaProperty(attributeProps, "speed", { type: "object" }),
      },
    };
    required.push("core");
  }

  if (request.sections.defenses) {
    schemaProperties.defenses = {
      type: "object",
      additionalProperties: false,
      required: ["hp", "ac", "saves", "immunities", "weaknesses", "resistances"],
      properties: {
        hp: cloneSchemaProperty(attributeProps, "hp", { type: "object" }),
        ac: cloneSchemaProperty(attributeProps, "ac", { type: "object" }),
        saves: cloneSchemaProperty(attributeProps, "saves", { type: "object" }),
        immunities: cloneSchemaProperty(attributeProps, "immunities", { type: "array", items: { type: "object" } }),
        weaknesses: cloneSchemaProperty(attributeProps, "weaknesses", { type: "array", items: { type: "object" } }),
        resistances: cloneSchemaProperty(attributeProps, "resistances", { type: "array", items: { type: "object" } }),
      },
    };
    required.push("defenses");
  }

  if (request.sections.skills) {
    schemaProperties.skills = {
      type: "object",
      additionalProperties: false,
      required: ["perception", "skills"],
      properties: {
        perception: cloneSchemaProperty(attributeProps, "perception", { type: "object" }),
        skills: cloneSchemaProperty(rootProps, "skills", { type: "array", items: { type: "object" } }),
      },
    };
    required.push("skills");
  }

  if (request.sections.strikes) {
    schemaProperties.strikes = cloneSchemaProperty(rootProps, "strikes", { type: "array", items: { type: "object" } });
    required.push("strikes");
  }

  if (request.sections.actions) {
    schemaProperties.actions = cloneSchemaProperty(rootProps, "actions", { type: "array", items: { type: "object" } });
    required.push("actions");
  }

  if (request.sections.inventory) {
    schemaProperties.inventory = cloneSchemaProperty(rootProps, "inventory", { type: "array", items: { type: "object" } });
    required.push("inventory");
  }

  if (request.sections.spells) {
    schemaProperties.spellcasting = cloneSchemaProperty(rootProps, "spellcasting", { type: "array", items: { type: "object" } });
    required.push("spellcasting");
  }

  if (request.sections.narrative) {
    schemaProperties.narrative = {
      type: "object",
      additionalProperties: false,
      required: ["description", "recallKnowledge"],
      properties: {
        description: cloneSchemaProperty(rootProps, "description", { type: "string", nullable: true }),
        recallKnowledge: cloneSchemaProperty(rootProps, "recallKnowledge", { type: "string", nullable: true }),
      },
    };
    required.push("narrative");
  }

  return {
    name: "npc-section-remix-generation",
    description: "PF2E NPC selected section remix payload",
    schema: {
      type: "object",
      additionalProperties: false,
      required,
      properties: schemaProperties,
    },
  };
}

function normalizeSectionPatch(raw: unknown): SectionRemixPatch {
  if (!isRecord(raw)) {
    return {};
  }

  const patch: SectionRemixPatch = {};
  if (isRecord(raw.core)) patch.core = clone(raw.core) as SectionRemixPatch["core"];
  if (isRecord(raw.defenses)) patch.defenses = clone(raw.defenses) as SectionRemixPatch["defenses"];
  if (isRecord(raw.skills)) patch.skills = clone(raw.skills) as SectionRemixPatch["skills"];
  if (Array.isArray(raw.strikes)) patch.strikes = clone(raw.strikes) as SectionRemixPatch["strikes"];
  if (Array.isArray(raw.actions)) patch.actions = clone(raw.actions) as SectionRemixPatch["actions"];
  if (Array.isArray(raw.inventory)) patch.inventory = clone(raw.inventory) as SectionRemixPatch["inventory"];
  if (Array.isArray(raw.spellcasting)) patch.spellcasting = clone(raw.spellcasting) as SectionRemixPatch["spellcasting"];
  if (isRecord(raw.narrative)) patch.narrative = clone(raw.narrative) as SectionRemixPatch["narrative"];

  return patch;
}

function inventoryEntryKey(entry: ActorInventoryEntry): string {
  const slug = normalizeLookupKey(String(entry.slug ?? ""));
  if (slug) {
    return `slug:${slug}`;
  }
  const name = normalizeLookupKey(entry.name);
  const type = normalizeLookupKey(String(entry.itemType ?? "other"));
  return `name:${name}|type:${type}`;
}

function mergeInventoryForAdd(
  existing: ActorInventoryEntry[],
  additions: ActorInventoryEntry[],
): ActorInventoryEntry[] {
  const merged = existing.map((entry) => clone(entry));
  const indexByKey = new Map<string, number>();

  for (const [index, entry] of merged.entries()) {
    indexByKey.set(inventoryEntryKey(entry), index);
  }

  for (const candidate of additions) {
    const key = inventoryEntryKey(candidate);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      merged.push(clone(candidate));
      indexByKey.set(key, merged.length - 1);
      continue;
    }

    merged[existingIndex] = {
      ...merged[existingIndex],
      ...clone(candidate),
    };
  }

  return merged;
}

function spellKey(spell: ActorSpellcastingEntry["spells"][number]): string {
  return `${Math.max(0, Math.trunc(spell.level))}|${normalizeLookupKey(spell.name)}`;
}

function spellcastingEntryKey(entry: ActorSpellcastingEntry): string {
  const name = normalizeLookupKey(entry.name);
  const tradition = normalizeLookupKey(entry.tradition);
  const castingType = normalizeLookupKey(entry.castingType);
  return `${name}|${tradition}|${castingType}`;
}

function mergeSpellListForAdd(
  existing: ActorSpellcastingEntry["spells"],
  additions: ActorSpellcastingEntry["spells"],
): ActorSpellcastingEntry["spells"] {
  const merged = existing.map((spell) => clone(spell));
  const indexByKey = new Map<string, number>();

  for (const [index, spell] of merged.entries()) {
    indexByKey.set(spellKey(spell), index);
  }

  for (const candidate of additions) {
    const key = spellKey(candidate);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      merged.push(clone(candidate));
      indexByKey.set(key, merged.length - 1);
      continue;
    }
    merged[existingIndex] = {
      ...merged[existingIndex],
      ...clone(candidate),
    };
  }

  return merged;
}

function mergeSpellcastingForAdd(
  existing: ActorSpellcastingEntry[],
  additions: ActorSpellcastingEntry[],
): ActorSpellcastingEntry[] {
  const merged = existing.map((entry) => clone(entry));
  const indexByKey = new Map<string, number>();

  for (const [index, entry] of merged.entries()) {
    indexByKey.set(spellcastingEntryKey(entry), index);
  }

  for (const candidate of additions) {
    const key = spellcastingEntryKey(candidate);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      merged.push(clone(candidate));
      indexByKey.set(key, merged.length - 1);
      continue;
    }

    const current = merged[existingIndex];
    merged[existingIndex] = {
      ...current,
      ...clone(candidate),
      spells: mergeSpellListForAdd(current.spells ?? [], candidate.spells ?? []),
    };
  }

  return merged;
}

function applySectionPatch(
  canonical: ActorSchemaData,
  patch: SectionRemixPatch,
  request: MainSheetRemixRequest,
): ActorSchemaData {
  const next = clone(canonical);

  if (request.sections.core && patch.core) {
    next.level = patch.core.level;
    next.size = patch.core.size;
    next.traits = patch.core.traits ?? [];
    next.alignment = patch.core.alignment ?? null;
    next.languages = patch.core.languages ?? [];
    next.abilities = patch.core.abilities;
    next.attributes.speed = patch.core.speed;
  }

  if (request.sections.defenses && patch.defenses) {
    next.attributes.hp = patch.defenses.hp;
    next.attributes.ac = patch.defenses.ac;
    next.attributes.saves = patch.defenses.saves;
    next.attributes.immunities = patch.defenses.immunities ?? [];
    next.attributes.weaknesses = patch.defenses.weaknesses ?? [];
    next.attributes.resistances = patch.defenses.resistances ?? [];
  }

  if (request.sections.skills && patch.skills) {
    next.attributes.perception = patch.skills.perception;
    next.skills = patch.skills.skills ?? [];
  }

  if (request.sections.strikes) {
    next.strikes = patch.strikes ?? [];
  }

  if (request.sections.actions) {
    next.actions = patch.actions ?? [];
  }

  if (request.sections.inventory) {
    const incoming = patch.inventory ?? [];
    const existing = next.inventory ?? [];
    next.inventory = request.inventory.operation === "replace"
      ? incoming
      : mergeInventoryForAdd(existing, incoming);
  }

  if (request.sections.spells) {
    const incoming = patch.spellcasting ?? [];
    const existing = next.spellcasting ?? [];
    next.spellcasting = request.spells.operation === "replace"
      ? incoming
      : mergeSpellcastingForAdd(existing, incoming);
  }

  if (request.sections.narrative && patch.narrative) {
    next.description = patch.narrative.description ?? null;
    next.recallKnowledge = patch.narrative.recallKnowledge ?? null;
  }

  if (request.targetLevel !== undefined && request.sections.core) {
    next.level = Math.max(0, Math.trunc(request.targetLevel));
  }

  return next;
}

function showWorkingDialog(actorName: string): Dialog {
  const safeName = escapeHtml(actorName);
  const dialog = new Dialog(
    {
      title: `${CONSTANTS.MODULE_NAME} | Remixing`,
      content: `
        <div class="handy-dandy-remix-loading">
          <p><i class="fas fa-spinner fa-spin"></i> Remixing selected sections for ${safeName}...</p>
          <p class="notes">Generating section JSON and applying targeted updates only.</p>
        </div>
      `,
      buttons: {},
      close: () => {
        /* no-op while loading */
      },
    },
    { jQuery: true },
  );

  dialog.render(true);
  return dialog;
}

function collectEmbeddedDocuments<T extends ClientDocument>(collection: unknown): T[] {
  if (!collection) {
    return [];
  }

  if (Array.isArray(collection)) {
    return collection as T[];
  }

  const candidate = collection as { contents?: unknown; values?: () => Iterable<unknown> };
  if (Array.isArray(candidate.contents)) {
    return candidate.contents as T[];
  }

  if (typeof candidate.values === "function") {
    return Array.from(candidate.values() as Iterable<T>);
  }

  return [];
}

function asFoundryItem(value: unknown): FoundryActorItemLike | null {
  if (!isRecord(value)) {
    return null;
  }
  return value as FoundryActorItemLike;
}

function itemTypeOf(value: unknown): string {
  const item = asFoundryItem(value);
  if (!item || typeof item.type !== "string") {
    return "";
  }
  return item.type.trim().toLowerCase();
}

function readSystemSlug(item: FoundryActorItemLike): string {
  const slug = getNestedValue(item.system, ["slug"]);
  return typeof slug === "string" ? slug.trim() : "";
}

function inventoryItemKeyFromFoundry(item: FoundryActorItemLike): string {
  const type = itemTypeOf(item);
  const slug = normalizeLookupKey(readSystemSlug(item));
  if (slug) {
    return `slug:${slug}|type:${type}`;
  }
  const name = normalizeLookupKey(typeof item.name === "string" ? item.name : "");
  return `name:${name}|type:${type}`;
}

function toEmbeddedCreatePayload(item: FoundryActorItemLike): Record<string, unknown> {
  const payload = clone(item) as Record<string, unknown>;
  payload.folder = null;
  return payload;
}

function filterMappedItemsByType(
  source: FoundryActorSourceLike,
  predicate: (item: FoundryActorItemLike) => boolean,
): FoundryActorItemLike[] {
  if (!Array.isArray(source.items)) {
    return [];
  }

  const result: FoundryActorItemLike[] = [];
  for (const raw of source.items) {
    const item = asFoundryItem(raw);
    if (!item) {
      continue;
    }
    if (predicate(item)) {
      result.push(item);
    }
  }
  return result;
}

async function replaceActorItemsByType(
  actor: Actor,
  source: FoundryActorSourceLike,
  shouldReplace: (type: string) => boolean,
): Promise<void> {
  const existingItems = collectEmbeddedDocuments<Item>(actor.items);
  const deleteIds = existingItems
    .filter((item) => shouldReplace(String(item.type ?? "").trim().toLowerCase()))
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (deleteIds.length > 0) {
    await actor.deleteEmbeddedDocuments("Item", deleteIds);
  }

  const additions = filterMappedItemsByType(
    source,
    (item) => shouldReplace(itemTypeOf(item)),
  );
  if (additions.length > 0) {
    const payload = additions.map((item) => toEmbeddedCreatePayload(item));
    await actor.createEmbeddedDocuments("Item", payload as any[]);
  }
}

async function addInventoryItems(
  actor: Actor,
  source: FoundryActorSourceLike,
): Promise<void> {
  const existingItems = collectEmbeddedDocuments<Item>(actor.items);
  const existingKeys = new Set<string>();
  for (const existing of existingItems) {
    const type = String(existing.type ?? "").trim().toLowerCase();
    if (!INVENTORY_ITEM_TYPES.has(type)) {
      continue;
    }
    existingKeys.add(
      inventoryItemKeyFromFoundry({
        name: existing.name,
        type,
        system: isRecord(existing.system) ? (existing.system as Record<string, unknown>) : undefined,
      }),
    );
  }

  const candidates = filterMappedItemsByType(
    source,
    (item) => INVENTORY_ITEM_TYPES.has(itemTypeOf(item)),
  );
  const toCreate: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    const key = inventoryItemKeyFromFoundry(candidate);
    if (existingKeys.has(key)) {
      continue;
    }
    existingKeys.add(key);
    toCreate.push(toEmbeddedCreatePayload(candidate));
  }

  if (toCreate.length > 0) {
    await actor.createEmbeddedDocuments("Item", toCreate as any[]);
  }
}

function spellEntryName(value: unknown): string {
  if (!isRecord(value) || typeof value.name !== "string") {
    return "";
  }
  return value.name.trim();
}

function spellLocationId(item: FoundryActorItemLike): string {
  const location = getNestedValue(item.system, ["location", "value"]);
  return typeof location === "string" ? location.trim() : "";
}

function spellLevel(item: FoundryActorItemLike): number {
  const level = getNestedValue(item.system, ["level", "value"]);
  if (typeof level === "number" && Number.isFinite(level)) {
    return Math.max(0, Math.trunc(level));
  }
  if (typeof level === "string" && level.trim().length > 0) {
    const parsed = Number(level);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }
  return 0;
}

function spellName(item: FoundryActorItemLike): string {
  if (typeof item.name !== "string") {
    return "";
  }
  return item.name.trim();
}

function spellDuplicateKey(entryName: string, level: number, spellNameValue: string): string {
  return `${normalizeLookupKey(entryName)}|${Math.max(0, Math.trunc(level))}|${normalizeLookupKey(spellNameValue)}`;
}

function hasImageGeneration(client: SectionRemixClient): client is SectionRemixClient & Pick<OpenRouterClient, "generateImage"> {
  return typeof client.generateImage === "function";
}

async function addSpellcastingItems(
  actor: Actor,
  source: FoundryActorSourceLike,
): Promise<void> {
  const allMappedEntries = filterMappedItemsByType(
    source,
    (item) => itemTypeOf(item) === "spellcastingentry",
  );
  const allMappedSpells = filterMappedItemsByType(
    source,
    (item) => itemTypeOf(item) === "spell",
  );

  if (!allMappedEntries.length && !allMappedSpells.length) {
    return;
  }

  const existingItems = collectEmbeddedDocuments<Item>(actor.items);
  const existingEntryByName = new Map<string, string>();
  for (const item of existingItems) {
    const type = String(item.type ?? "").trim().toLowerCase();
    if (type !== "spellcastingentry") {
      continue;
    }
    const normalizedName = normalizeLookupKey(item.name ?? "");
    if (!normalizedName || !item.id) {
      continue;
    }
    existingEntryByName.set(normalizedName, item.id);
  }

  const createdEntriesPayload: Record<string, unknown>[] = [];
  const entryIdRemap = new Map<string, string>();
  const candidateEntryNameById = new Map<string, string>();

  for (const candidate of allMappedEntries) {
    const oldId = typeof candidate._id === "string" ? candidate._id : "";
    const name = spellEntryName(candidate);
    const normalizedName = normalizeLookupKey(name);
    if (!normalizedName) {
      continue;
    }
    if (oldId) {
      candidateEntryNameById.set(oldId, name);
    }

    const existingId = existingEntryByName.get(normalizedName);
    if (existingId) {
      if (oldId) {
        entryIdRemap.set(oldId, existingId);
      }
      continue;
    }

    createdEntriesPayload.push(toEmbeddedCreatePayload(candidate));
  }

  if (createdEntriesPayload.length > 0) {
    const created = await actor.createEmbeddedDocuments("Item", createdEntriesPayload as any[]);
    for (const createdItem of created ?? []) {
      if (!createdItem.id) {
        continue;
      }
      const normalizedName = normalizeLookupKey(createdItem.name ?? "");
      if (!normalizedName) {
        continue;
      }
      existingEntryByName.set(normalizedName, createdItem.id);
    }
  }

  for (const candidate of allMappedEntries) {
    const oldId = typeof candidate._id === "string" ? candidate._id : "";
    if (!oldId) {
      continue;
    }
    const name = spellEntryName(candidate);
    const normalizedName = normalizeLookupKey(name);
    if (!normalizedName) {
      continue;
    }
    const resolvedId = existingEntryByName.get(normalizedName);
    if (resolvedId) {
      entryIdRemap.set(oldId, resolvedId);
    }
  }

  const entryNameById = new Map<string, string>();
  for (const [nameKey, entryId] of existingEntryByName.entries()) {
    entryNameById.set(entryId, nameKey);
  }

  const existingSpellKeys = new Set<string>();
  const currentItemsAfterEntries = collectEmbeddedDocuments<Item>(actor.items);
  for (const item of currentItemsAfterEntries) {
    const type = String(item.type ?? "").trim().toLowerCase();
    if (type !== "spell") {
      continue;
    }
    const system = isRecord(item.system) ? item.system : {};
    const location = getNestedValue(system, ["location", "value"]);
    const entryId = typeof location === "string" ? location.trim() : "";
    const entryNameKey = entryNameById.get(entryId);
    if (!entryNameKey) {
      continue;
    }
    const levelRaw = getNestedValue(system, ["level", "value"]);
    const level = typeof levelRaw === "number" && Number.isFinite(levelRaw)
      ? Math.max(0, Math.trunc(levelRaw))
      : 0;
    existingSpellKeys.add(
      spellDuplicateKey(entryNameKey, level, item.name ?? ""),
    );
  }

  const spellsToCreate: Record<string, unknown>[] = [];
  for (const candidate of allMappedSpells) {
    const oldLocation = spellLocationId(candidate);
    if (!oldLocation) {
      continue;
    }

    const remappedLocation = entryIdRemap.get(oldLocation) ?? oldLocation;
    const candidateEntryName = candidateEntryNameById.get(oldLocation) ?? entryNameById.get(remappedLocation) ?? "";
    if (!candidateEntryName) {
      continue;
    }

    const level = spellLevel(candidate);
    const name = spellName(candidate);
    if (!name) {
      continue;
    }

    const duplicateKey = spellDuplicateKey(candidateEntryName, level, name);
    if (existingSpellKeys.has(duplicateKey)) {
      continue;
    }

    const payload = toEmbeddedCreatePayload(candidate);
    if (!isRecord(payload.system)) {
      payload.system = {};
    }
    if (!isRecord((payload.system as Record<string, unknown>).location)) {
      (payload.system as Record<string, unknown>).location = {};
    }
    ((payload.system as Record<string, unknown>).location as Record<string, unknown>).value = remappedLocation;
    existingSpellKeys.add(duplicateKey);
    spellsToCreate.push(payload);
  }

  if (spellsToCreate.length > 0) {
    await actor.createEmbeddedDocuments("Item", spellsToCreate as any[]);
  }
}

async function applySystemSectionUpdates(
  actor: Actor,
  source: FoundryActorSourceLike,
  request: MainSheetRemixRequest,
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  const sourceSystem = isRecord(source.system) ? source.system : {};

  if (request.sections.core) {
    setUpdateValue(updateData, "system.details.level", getNestedValue(sourceSystem, ["details", "level"]));
    setUpdateValue(updateData, "system.traits", getNestedValue(sourceSystem, ["traits"]));
    setUpdateValue(updateData, "system.details.alignment", getNestedValue(sourceSystem, ["details", "alignment"]));
    setUpdateValue(updateData, "system.details.languages", getNestedValue(sourceSystem, ["details", "languages"]));
    setUpdateValue(updateData, "system.abilities", getNestedValue(sourceSystem, ["abilities"]));
    setUpdateValue(updateData, "system.attributes.speed", getNestedValue(sourceSystem, ["attributes", "speed"]));
  }

  if (request.sections.defenses) {
    setUpdateValue(updateData, "system.attributes.hp", getNestedValue(sourceSystem, ["attributes", "hp"]));
    setUpdateValue(updateData, "system.attributes.ac", getNestedValue(sourceSystem, ["attributes", "ac"]));
    setUpdateValue(updateData, "system.attributes.immunities", getNestedValue(sourceSystem, ["attributes", "immunities"]));
    setUpdateValue(updateData, "system.attributes.weaknesses", getNestedValue(sourceSystem, ["attributes", "weaknesses"]));
    setUpdateValue(updateData, "system.attributes.resistances", getNestedValue(sourceSystem, ["attributes", "resistances"]));
    setUpdateValue(updateData, "system.saves", getNestedValue(sourceSystem, ["saves"]));
  }

  if (request.sections.skills) {
    setUpdateValue(updateData, "system.perception", getNestedValue(sourceSystem, ["perception"]));
    setUpdateValue(updateData, "system.skills", getNestedValue(sourceSystem, ["skills"]));
  }

  if (request.sections.narrative) {
    setUpdateValue(updateData, "system.details.publicNotes", getNestedValue(sourceSystem, ["details", "publicNotes"]));
    setUpdateValue(updateData, "system.details.privateNotes", getNestedValue(sourceSystem, ["details", "privateNotes"]));
  }

  if (Object.keys(updateData).length > 0) {
    await actor.update(updateData as any);
  }
}

async function maybeGenerateTokenImage(
  actor: Actor,
  client: SectionRemixClient,
  canonical: ActorSchemaData,
  request: MainSheetRemixRequest,
): Promise<void> {
  if (!request.generateTokenImage) {
    return;
  }

  if (!hasImageGeneration(client)) {
    ui.notifications?.warn(
      `${CONSTANTS.MODULE_NAME} | Token image generation is unavailable for the current AI client.`,
    );
    return;
  }

  const imagePath = await generateTransparentTokenImage(client, {
    actorName: canonical.name,
    actorSlug: canonical.slug,
    actorDescription: canonical.description ?? null,
    customPrompt: request.tokenPrompt ?? null,
    imageCategory: "actor",
    existingImagePath: actor.img ?? null,
  });

  await actor.update({
    img: imagePath,
    "prototypeToken.texture.src": imagePath,
  } as any);
}

async function applySectionRemixToActor(
  actor: Actor,
  source: FoundryActorSourceLike,
  canonical: ActorSchemaData,
  request: MainSheetRemixRequest,
  client: SectionRemixClient,
): Promise<void> {
  await applySystemSectionUpdates(actor, source, request);

  if (request.sections.strikes) {
    await replaceActorItemsByType(actor, source, (type) => type === "melee");
  }

  if (request.sections.actions) {
    await replaceActorItemsByType(actor, source, (type) => type === "action");
  }

  if (request.sections.inventory) {
    if (request.inventory.operation === "replace") {
      await replaceActorItemsByType(actor, source, (type) => INVENTORY_ITEM_TYPES.has(type));
    } else {
      await addInventoryItems(actor, source);
    }
  }

  if (request.sections.spells) {
    if (request.spells.operation === "replace") {
      await replaceActorItemsByType(actor, source, (type) => type === "spellcastingentry" || type === "spell");
    } else {
      await addSpellcastingItems(actor, source);
    }
  }

  await maybeGenerateTokenImage(actor, client, canonical, request);
}

export async function runNpcMainSheetRemixFlow(actor: Actor): Promise<void> {
  const openRouterClient = game.handyDandy?.openRouterClient;
  if (!openRouterClient) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | OpenRouter client is unavailable.`);
    return;
  }

  const actorObject = actor.toObject() as any;
  const canonical = fromFoundryActor(actorObject);
  const request = await promptMainSheetRemixRequest(canonical);
  if (!request) {
    return;
  }

  let workingDialog: Dialog | null = null;
  let generatedPatch: unknown = null;
  let mergedCanonical: ActorSchemaData | null = null;

  try {
    workingDialog = showWorkingDialog(actor.name ?? canonical.name);

    const schema = buildSectionRemixSchema(request);
    const prompt = buildSectionRemixPrompt(actor.name ?? canonical.name, canonical, request);
    generatedPatch = await (openRouterClient as SectionRemixClient).generateWithSchema<unknown>(prompt, schema);

    const normalizedPatch = normalizeSectionPatch(generatedPatch);
    mergedCanonical = applySectionPatch(canonical, normalizedPatch, request);
    const validatedCanonical = await ensureValid({
      type: "actor",
      payload: mergedCanonical,
    });

    const source = await toFoundryActorDataWithCompendium(validatedCanonical, {
      resolveOfficialContent: true,
    });

    await applySectionRemixToActor(
      actor,
      source,
      validatedCanonical,
      request,
      openRouterClient as SectionRemixClient,
    );
    const updatedCanonical = fromFoundryActor(actor.toObject() as any);
    const summaryRows = buildSectionRemixSummaryRows(canonical, updatedCanonical, request);
    const selectedSections = getSelectedSections(request.sections).map((entry) => sectionLabel(entry));

    workingDialog.close({ force: true });
    workingDialog = null;

    ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Remixed selected sections for ${actor.name}.`);
    await showRemixSummaryDialog({
      title: `${CONSTANTS.MODULE_NAME} | NPC Remix Summary`,
      subtitle: actor.name ?? canonical.name,
      rows: summaryRows,
      notes: [`Sections remixed: ${selectedSections.join(", ")}`],
    });
    actor.sheet?.render(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | NPC section remix failed: ${message}`);

    if (generatedPatch) {
      await showGeneratedOutputRecoveryDialog({
        title: `${CONSTANTS.MODULE_NAME} | NPC Section Remix Output`,
        summary: `Section remix generated JSON for "${actor.name ?? canonical.name}", but Foundry could not apply it.`,
        payload: {
          generatedPatch,
          mergedCanonical,
        },
        filenameBase: `${actor.name ?? canonical.name}-npc-section-remix`,
      });
    }

    console.error(`${CONSTANTS.MODULE_NAME} | NPC section remix failed`, error);
  } finally {
    workingDialog?.close({ force: true });
  }
}
