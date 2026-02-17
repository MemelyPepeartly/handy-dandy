import { CONSTANTS } from "../constants";
import { fromFoundryActor } from "../mappers/export";
import { importActor } from "../mappers/import";
import type { ActorGenerationResult, ActorSchemaData } from "../schemas";

type RemixMode = "scale" | "features" | "remake" | "equipment" | "spells";

interface RemixRequest {
  instructions: string;
  mode: RemixMode;
  targetLevel?: number;
  generateTokenImage?: boolean;
  tokenPrompt?: string;
}

export interface NpcRemixPreset {
  mode?: RemixMode;
  instructions?: string;
  targetLevel?: number;
  generateTokenImage?: boolean;
  tokenPrompt?: string;
  title?: string;
}

type RemixFormResponse = {
  instructions: string;
  mode: string;
  targetLevel: string;
  generateTokenImage: string | null;
  tokenPrompt: string;
};

const REMIX_RETRY_LIMIT = 2;

const QUICK_MODE_DEFAULTS: Record<Extract<RemixMode, "equipment" | "spells">, string> = {
  equipment: [
    "Refresh this NPC's inventory with level-appropriate official PF2E equipment.",
    "Keep the creature's core identity while improving tactical gear variety.",
    "Prefer official weapons, armor, consumables, and utility items already present in PF2E content.",
  ].join(" "),
  spells: [
    "Refresh this NPC's spellcasting with official PF2E spells appropriate to role and level.",
    "Ensure there is at least one spellcasting entry and a useful spread of combat and utility spells.",
    "Prefer official spells from Foundry compendia instead of inventing replacements.",
  ].join(" "),
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

function buildModeRequirements(mode: RemixMode): string[] {
  switch (mode) {
    case "equipment":
      return [
        "- Required output: include a non-empty inventory array with at least 3 meaningful equipment entries unless explicitly constrained otherwise.",
        "- Keep item names and slugs aligned to official PF2E content when available.",
      ];
    case "spells":
      return [
        "- Required output: include non-empty spellcasting entries and at least 3 total spells across entries.",
        "- Preserve or improve spell DC/attack values relative to level and role.",
      ];
    default:
      return [];
  }
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRemixMode(raw: string, fallback: RemixMode): RemixMode {
  switch (raw) {
    case "scale":
    case "features":
    case "remake":
    case "equipment":
    case "spells":
      return raw;
    default:
      return fallback;
  }
}

function summarizeInventory(canonical: ActorSchemaData): string {
  const entries = canonical.inventory ?? [];
  if (!entries.length) {
    return "No inventory entries found.";
  }

  return entries
    .slice(0, 20)
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
  for (const entry of entries.slice(0, 8)) {
    const sampleSpells = entry.spells
      .slice(0, 10)
      .map((spell) => `${spell.name} (L${spell.level})`)
      .join(", ");
    lines.push(`- ${entry.name}: ${sampleSpells || "no listed spells"}`);
  }

  return lines.join("\n");
}

function buildRemixReferenceText(
  actorName: string,
  canonical: ActorSchemaData,
  request: RemixRequest,
  retryGap?: string,
): string {
  const modeRequirements = buildModeRequirements(request.mode);
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

function getCoverageGap(mode: RemixMode, coverage: RemixCoverage): string | null {
  if (mode === "equipment" && coverage.inventoryCount < 3) {
    return `inventory is too sparse (${coverage.inventoryCount} entries found; need at least 3).`;
  }
  if (mode === "spells" && coverage.spellEntryCount < 1) {
    return "spellcasting entries are missing.";
  }
  if (mode === "spells" && coverage.spellCount < 3) {
    return `spell list is too small (${coverage.spellCount} spells found; need at least 3).`;
  }
  return null;
}

async function promptRemixRequest(actor: Actor, preset: NpcRemixPreset): Promise<RemixRequest | null> {
  const defaultMode = preset.mode ?? "remake";
  const defaultTargetLevel = typeof preset.targetLevel === "number" ? String(Math.max(0, Math.trunc(preset.targetLevel))) : "";
  const defaultInstructions = preset.instructions?.trim() ?? "";
  const defaultTokenPrompt = preset.tokenPrompt?.trim() ?? "";
  const title = preset.title?.trim() || `Remix ${actor.name ?? "NPC"}`;

  const content = `
    <form class="handy-dandy-remix-form" style="display:flex;flex-direction:column;gap:0.75rem;min-width:560px;">
      <div class="form-group">
        <label for="handy-dandy-remix-mode">Remix Mode</label>
        <select id="handy-dandy-remix-mode" name="mode">
          <option value="scale"${defaultMode === "scale" ? " selected" : ""}>Scale Up/Down</option>
          <option value="features"${defaultMode === "features" ? " selected" : ""}>Add Features</option>
          <option value="remake"${defaultMode === "remake" ? " selected" : ""}>Complete Remake</option>
          <option value="equipment"${defaultMode === "equipment" ? " selected" : ""}>Equipment Refresh</option>
          <option value="spells"${defaultMode === "spells" ? " selected" : ""}>Spellcasting Refresh</option>
        </select>
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-target-level">Target Level (optional)</label>
        <input id="handy-dandy-remix-target-level" type="number" name="targetLevel" min="0" value="${escapeHtml(defaultTargetLevel)}" />
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-instructions">Remix Instructions</label>
        <textarea id="handy-dandy-remix-instructions" name="instructions" rows="10" placeholder="Examples: make this creature level 11 elite controller, swap weapons to polearms, add occult spells, keep defensive profile but increase battlefield mobility.">${escapeHtml(defaultInstructions)}</textarea>
      </div>
      <div class="form-group">
        <label><input type="checkbox" name="generateTokenImage"${preset.generateTokenImage ? " checked" : ""} /> Generate transparent token image</label>
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-token-prompt">Token Prompt Override (optional)</label>
        <input id="handy-dandy-remix-token-prompt" type="text" name="tokenPrompt" placeholder="Optional art direction for token generation" value="${escapeHtml(defaultTokenPrompt)}" />
      </div>
      <p class="notes">Current actor: <strong>${escapeHtml(actor.name ?? "Unnamed NPC")}</strong></p>
      <p class="notes">Tip: leave instructions blank to use mode defaults.</p>
    </form>
  `;

  const response = await new Promise<RemixFormResponse | null>((resolve) => {
    let settled = false;
    const finish = (value: RemixFormResponse | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | ${title}`,
        content,
        buttons: {
          remix: {
            icon: '<i class="fas fa-random"></i>',
            label: "Remix",
            callback: (html) => {
              const form = html[0]?.querySelector("form");
              if (!(form instanceof HTMLFormElement)) {
                finish(null);
                return;
              }
              const formData = new FormData(form);
              finish({
                instructions: String(formData.get("instructions") ?? ""),
                mode: String(formData.get("mode") ?? ""),
                targetLevel: String(formData.get("targetLevel") ?? ""),
                generateTokenImage: formData.get("generateTokenImage") as string | null,
                tokenPrompt: String(formData.get("tokenPrompt") ?? ""),
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
      { jQuery: true, width: 700 },
    );

    dialog.render(true);
  });

  if (!response) {
    return null;
  }

  const mode = parseRemixMode(response.mode, defaultMode);
  const modeDefaultInstruction = (mode === "equipment" || mode === "spells") ? QUICK_MODE_DEFAULTS[mode] : "";
  const fallbackInstruction = preset.instructions?.trim() || modeDefaultInstruction;
  const instructions = response.instructions.trim() || fallbackInstruction;
  if (!instructions) {
    ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Remix instructions are required.`);
    return null;
  }

  return {
    instructions,
    mode,
    targetLevel: parseOptionalNumber(response.targetLevel),
    generateTokenImage: response.generateTokenImage ? true : undefined,
    tokenPrompt: response.tokenPrompt.trim() || undefined,
  };
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

export async function runNpcRemixFlow(actor: Actor, preset: NpcRemixPreset = {}): Promise<void> {
  const request = await promptRemixRequest(actor, preset);
  if (!request) {
    return;
  }

  const generation = game.handyDandy?.generation?.generateActor;
  if (!generation) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Actor generation is unavailable.`);
    return;
  }

  const actorObject = actor.toObject() as unknown;
  const canonical = fromFoundryActor(actorObject as any);

  let workingDialog: Dialog | null = null;
  try {
    workingDialog = showWorkingDialog(actor.name ?? canonical.name);

    let generated: ActorGenerationResult | null = null;
    let referenceText = buildRemixReferenceText(actor.name ?? canonical.name, canonical, request);

    for (let attempt = 1; attempt <= REMIX_RETRY_LIMIT; attempt += 1) {
      generated = await generation({
        systemId: canonical.systemId,
        name: actor.name ?? canonical.name,
        slug: canonical.slug,
        referenceText,
        level: request.targetLevel ?? canonical.level,
        includeSpellcasting: true,
        includeInventory: true,
        generateTokenImage: request.generateTokenImage,
        tokenPrompt: request.tokenPrompt,
        img: canonical.img ?? undefined,
        publication: canonical.publication,
      });

      const coverage = collectRemixCoverage(generated);
      const gap = getCoverageGap(request.mode, coverage);
      if (!gap) {
        break;
      }

      if (attempt < REMIX_RETRY_LIMIT) {
        console.warn(`${CONSTANTS.MODULE_NAME} | Remix attempt ${attempt} incomplete (${gap}). Retrying once.`);
        referenceText = buildRemixReferenceText(actor.name ?? canonical.name, canonical, request, gap);
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
    console.error(`${CONSTANTS.MODULE_NAME} | NPC remix failed`, error);
  } finally {
    workingDialog?.close({ force: true });
  }
}
