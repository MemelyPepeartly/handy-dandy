import { CONSTANTS } from "../constants";
import { fromFoundryActor } from "../mappers/export";
import { importActor } from "../mappers/import";
import type { ActorGenerationResult, ActorSchemaData } from "../schemas";
import { showGeneratedOutputRecoveryDialog } from "../ui/generated-output-recovery";

export type RemixMode = "scale" | "features" | "remake" | "equipment" | "spells";

export interface NpcRemixRequest {
  instructions: string;
  mode: RemixMode;
  targetLevel?: number;
  generateTokenImage?: boolean;
  tokenPrompt?: string;
  minimumInventoryItems?: number;
  minimumSpellEntries?: number;
  minimumSpells?: number;
  preserveExistingInventory?: boolean;
  preserveExistingSpellcasting?: boolean;
}

interface NormalizedNpcRemixRequest extends NpcRemixRequest {
  instructions: string;
  minimumInventoryItems: number;
  minimumSpellEntries: number;
  minimumSpells: number;
  preserveExistingInventory: boolean;
  preserveExistingSpellcasting: boolean;
}

const REMIX_RETRY_LIMIT = 2;

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

function buildModeInstruction(mode: RemixMode): string {
  switch (mode) {
    case "scale":
      return "Prioritise level scaling while preserving creature identity and theme.";
    case "features":
      return "Prioritise adding new abilities, reactions, and encounter depth.";
    case "equipment":
      return "Prioritise equipment loadout changes using official PF2E items when available.";
    case "spells":
      return "Prioritise spell list and spellcasting updates using official PF2E spells.";
    case "remake":
    default:
      return "Rebuild the creature from scratch while retaining the requested fantasy direction.";
  }
}

function summarizeInventory(canonical: ActorSchemaData): string {
  const entries = canonical.inventory ?? [];
  if (!entries.length) {
    return "No inventory entries found.";
  }

  return entries
    .slice(0, 24)
    .map((entry) => {
      const quantity = typeof entry.quantity === "number" && Number.isFinite(entry.quantity) ? ` x${entry.quantity}` : "";
      const level = typeof entry.level === "number" && Number.isFinite(entry.level) ? ` (L${entry.level})` : "";
      return `- ${entry.name}${quantity}${level}`;
    })
    .join("\n");
}

function summarizeSpellcasting(canonical: ActorSchemaData): string {
  const entries = canonical.spellcasting ?? [];
  if (!entries.length) {
    return "No spellcasting entries found.";
  }

  const lines: string[] = [];
  for (const entry of entries.slice(0, 10)) {
    const sampleSpells = entry.spells
      .slice(0, 12)
      .map((spell) => `${spell.name} (L${spell.level})`)
      .join(", ");
    lines.push(`- ${entry.name}: ${sampleSpells || "no listed spells"}`);
  }

  return lines.join("\n");
}

function countCanonicalSpells(canonical: ActorSchemaData): number {
  const entries = canonical.spellcasting ?? [];
  let total = 0;
  for (const entry of entries) {
    total += entry.spells.length;
  }
  return total;
}

function resolveMinimum(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(value));
}

function normalizeRemixRequest(
  canonical: ActorSchemaData,
  request: NpcRemixRequest,
): NormalizedNpcRemixRequest {
  const inventoryCount = canonical.inventory?.length ?? 0;
  const spellEntryCount = canonical.spellcasting?.length ?? 0;
  const spellCount = countCanonicalSpells(canonical);

  const defaultMinInventory = request.mode === "equipment"
    ? Math.max(3, Math.min(inventoryCount || 3, 12))
    : 0;
  const defaultMinSpellEntries = request.mode === "spells"
    ? Math.max(1, Math.min(spellEntryCount || 1, 4))
    : 0;
  const defaultMinSpells = request.mode === "spells"
    ? Math.max(3, Math.min(spellCount || 6, 12))
    : 0;

  return {
    ...request,
    instructions: request.instructions.trim(),
    minimumInventoryItems: resolveMinimum(request.minimumInventoryItems, defaultMinInventory),
    minimumSpellEntries: resolveMinimum(request.minimumSpellEntries, defaultMinSpellEntries),
    minimumSpells: resolveMinimum(request.minimumSpells, defaultMinSpells),
    preserveExistingInventory: request.preserveExistingInventory ?? request.mode === "equipment",
    preserveExistingSpellcasting: request.preserveExistingSpellcasting ?? request.mode === "spells",
  };
}

function buildModeRequirements(
  request: NormalizedNpcRemixRequest,
): string[] {
  switch (request.mode) {
    case "equipment":
      return [
        `- Required output: include a non-empty inventory array with at least ${request.minimumInventoryItems} meaningful entries.`,
        "- Inventory entries must include itemType, quantity, level, and useful rules-facing description text.",
        "- Keep item names and slugs aligned to official PF2E content when available.",
        request.preserveExistingInventory
          ? "- Preserve the existing loadout identity and expand/upgrade it instead of replacing everything."
          : "- Rebuild loadout freely while still meeting quantity and role requirements.",
      ];
    case "spells":
      return [
        `- Required output: include at least ${request.minimumSpellEntries} spellcasting entr${request.minimumSpellEntries === 1 ? "y" : "ies"}.`,
        `- Required output: include at least ${request.minimumSpells} total spells across entries.`,
        "- Each spellcasting entry should provide tradition, casting type, and level-appropriate attack/DC values.",
        request.preserveExistingSpellcasting
          ? "- Preserve the current spellcasting identity and expand coverage instead of collapsing to a tiny list."
          : "- Full replacement is allowed, but the resulting spell package must still be broad and usable.",
      ];
    default:
      return [];
  }
}

function buildRemixReferenceText(
  actorName: string,
  canonical: ActorSchemaData,
  request: NormalizedNpcRemixRequest,
  retryGap?: string,
): string {
  const modeRequirements = buildModeRequirements(request);
  const parts = [
    `Remix the existing PF2E NPC "${actorName}".`,
    buildModeInstruction(request.mode),
    `Target level: ${request.targetLevel ?? "keep current level unless otherwise required"}.`,
    "Apply this remix specification:",
    request.instructions,
    "Current inventory snapshot:",
    summarizeInventory(canonical),
    "Current spellcasting snapshot:",
    summarizeSpellcasting(canonical),
    "Current canonical actor data (JSON):",
    JSON.stringify(canonical, null, 2),
    "Important constraints:",
    "- Preserve PF2E sheet structure and valid stat relationships.",
    "- Reuse official PF2E spells/items/actions/effects whenever they exist; do not fabricate duplicates.",
    "- Ensure descriptions use PF2E inline formatting (@Check, @Damage, @Template, @UUID).",
    "- Keep strike/action/inventory/spell descriptions rendered as proper rich text HTML.",
    ...modeRequirements,
  ];

  if (retryGap) {
    parts.push(`Retry requirement: ${retryGap}`);
  }

  return parts.join("\n\n");
}

type RemixCoverage = {
  inventoryCount: number;
  spellEntryCount: number;
  spellCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectRemixCoverage(generated: ActorGenerationResult): RemixCoverage {
  let inventoryCount = 0;
  let spellEntryCount = 0;
  let spellCount = 0;

  for (const item of generated.items) {
    if (!isRecord(item)) {
      continue;
    }
    const type = typeof item.type === "string" ? item.type : "";
    if (type === "spell") {
      spellCount += 1;
      continue;
    }
    if (type === "spellcastingEntry") {
      spellEntryCount += 1;
      continue;
    }
    if (type === "melee" || type === "action") {
      continue;
    }
    inventoryCount += 1;
  }

  return { inventoryCount, spellEntryCount, spellCount };
}

function getCoverageGap(
  request: NormalizedNpcRemixRequest,
  coverage: RemixCoverage,
): string | null {
  if (request.mode === "equipment" && coverage.inventoryCount < request.minimumInventoryItems) {
    return `inventory is too sparse (${coverage.inventoryCount} entries found; need at least ${request.minimumInventoryItems}).`;
  }
  if (request.mode === "spells" && coverage.spellEntryCount < request.minimumSpellEntries) {
    return `spellcasting entries are too sparse (${coverage.spellEntryCount} found; need at least ${request.minimumSpellEntries}).`;
  }
  if (request.mode === "spells" && coverage.spellCount < request.minimumSpells) {
    return `spell list is too small (${coverage.spellCount} spells found; need at least ${request.minimumSpells}).`;
  }
  return null;
}

function showWorkingDialog(actorName: string): Dialog {
  const safeName = escapeHtml(actorName);
  const dialog = new Dialog(
    {
      title: `${CONSTANTS.MODULE_NAME} | Remixing`,
      content: `
        <div class="handy-dandy-remix-loading">
          <p><i class="fas fa-spinner fa-spin"></i> Remixing ${safeName}...</p>
          <p class="notes">Generating updated actor data and resolving official compendium references.</p>
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

async function runNpcRemix(actor: Actor, request: NpcRemixRequest): Promise<void> {
  const generation = game.handyDandy?.generation?.generateActor;
  if (!generation) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Actor generation is unavailable.`);
    return;
  }

  const actorObject = actor.toObject() as unknown;
  const canonical = fromFoundryActor(actorObject as any);
  const normalizedRequest = normalizeRemixRequest(canonical, request);

  let workingDialog: Dialog | null = null;
  let generated: ActorGenerationResult | null = null;
  try {
    workingDialog = showWorkingDialog(actor.name ?? canonical.name);

    let referenceText = buildRemixReferenceText(actor.name ?? canonical.name, canonical, normalizedRequest);

    for (let attempt = 1; attempt <= REMIX_RETRY_LIMIT; attempt += 1) {
      generated = await generation({
        systemId: canonical.systemId,
        name: actor.name ?? canonical.name,
        slug: canonical.slug,
        referenceText,
        level: normalizedRequest.targetLevel ?? canonical.level,
        includeSpellcasting: true,
        includeInventory: true,
        generateTokenImage: normalizedRequest.generateTokenImage,
        tokenPrompt: normalizedRequest.tokenPrompt,
        img: canonical.img ?? undefined,
        publication: canonical.publication,
      });

      const coverage = collectRemixCoverage(generated);
      const gap = getCoverageGap(normalizedRequest, coverage);
      if (!gap) {
        break;
      }

      if (attempt < REMIX_RETRY_LIMIT) {
        console.warn(`${CONSTANTS.MODULE_NAME} | Remix attempt ${attempt} incomplete (${gap}). Retrying once.`);
        referenceText = buildRemixReferenceText(actor.name ?? canonical.name, canonical, normalizedRequest, gap);
      } else {
        ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Remix completed, but ${gap}`);
      }
    }

    if (!generated) {
      throw new Error("No remixed actor data was generated.");
    }

    const imported = await importActor(generated, {
      actorId: actor.id ?? undefined,
      folderId: actor.folder?.id ?? undefined,
    });

    workingDialog.close({ force: true });
    workingDialog = null;

    ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Remixed ${imported.name}.`);
    imported.sheet?.render(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | NPC remix failed: ${message}`);

    if (generated) {
      await showGeneratedOutputRecoveryDialog({
        title: `${CONSTANTS.MODULE_NAME} | NPC Remix Output`,
        summary: `NPC remix generated JSON for "${actor.name ?? canonical.name}", but Foundry could not apply it.`,
        payload: generated,
        filenameBase: `${actor.name ?? canonical.name}-npc-remix`,
      });
    }

    console.error(`${CONSTANTS.MODULE_NAME} | NPC remix failed`, error);
  } finally {
    workingDialog?.close({ force: true });
  }
}

export async function runNpcRemixWithRequest(actor: Actor, request: NpcRemixRequest): Promise<void> {
  const normalized: NpcRemixRequest = {
    ...request,
    instructions: request.instructions.trim(),
  };
  if (!normalized.instructions) {
    ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Remix instructions are required.`);
    return;
  }

  await runNpcRemix(actor, normalized);
}
