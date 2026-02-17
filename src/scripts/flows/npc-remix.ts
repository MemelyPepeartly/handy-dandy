import { CONSTANTS } from "../constants";
import { fromFoundryActor } from "../mappers/export";
import { importActor } from "../mappers/import";

interface RemixRequest {
  instructions: string;
  mode: "scale" | "features" | "remake" | "equipment" | "spells";
  targetLevel?: number;
  generateTokenImage?: boolean;
  tokenPrompt?: string;
}

type RemixFormResponse = {
  instructions: string;
  mode: string;
  targetLevel: string;
  generateTokenImage: string | null;
  tokenPrompt: string;
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

function buildModeInstruction(mode: RemixRequest["mode"]): string {
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

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function promptRemixRequest(actor: Actor): Promise<RemixRequest | null> {
  const content = `
    <form class="handy-dandy-remix-form" style="display:flex;flex-direction:column;gap:0.75rem;min-width:540px;">
      <div class="form-group">
        <label for="handy-dandy-remix-mode">Remix Mode</label>
        <select id="handy-dandy-remix-mode" name="mode">
          <option value="scale">Scale Up/Down</option>
          <option value="features">Add Features</option>
          <option value="remake">Complete Remake</option>
          <option value="equipment">Equipment Refresh</option>
          <option value="spells">Spellcasting Refresh</option>
        </select>
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-target-level">Target Level (optional)</label>
        <input id="handy-dandy-remix-target-level" type="number" name="targetLevel" min="0" />
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-instructions">Remix Instructions</label>
        <textarea id="handy-dandy-remix-instructions" name="instructions" rows="10" placeholder="Examples: make this creature level 11 elite controller, swap weapons to polearms, add occult spells, keep defensive profile but increase battlefield mobility." required></textarea>
      </div>
      <div class="form-group">
        <label><input type="checkbox" name="generateTokenImage" /> Generate transparent token image</label>
      </div>
      <div class="form-group">
        <label for="handy-dandy-remix-token-prompt">Token Prompt Override (optional)</label>
        <input id="handy-dandy-remix-token-prompt" type="text" name="tokenPrompt" placeholder="Optional art direction for token generation" />
      </div>
      <p class="notes">Current actor: <strong>${escapeHtml(actor.name ?? "Unnamed NPC")}</strong></p>
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
        title: `${CONSTANTS.MODULE_NAME} | Remix ${actor.name ?? "NPC"}`,
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
      { jQuery: true, width: 680 },
    );

    dialog.render(true);
  });

  if (!response) {
    return null;
  }

  const instructions = response.instructions.trim();
  if (!instructions) {
    ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Remix instructions are required.`);
    return null;
  }

  const mode = (() => {
    switch (response.mode) {
      case "scale":
      case "features":
      case "remake":
      case "equipment":
      case "spells":
        return response.mode;
      default:
        return "remake";
    }
  })();

  return {
    instructions,
    mode,
    targetLevel: parseOptionalNumber(response.targetLevel),
    generateTokenImage: response.generateTokenImage ? true : undefined,
    tokenPrompt: response.tokenPrompt.trim() || undefined,
  };
}

function buildRemixReferenceText(
  actorName: string,
  canonical: Record<string, unknown>,
  request: RemixRequest,
): string {
  const parts = [
    `Remix the existing PF2E NPC "${actorName}".`,
    buildModeInstruction(request.mode),
    `Target level: ${request.targetLevel ?? "keep current level unless otherwise required"}.`,
    "Apply this remix specification:",
    request.instructions,
    "Current canonical actor data (JSON):",
    JSON.stringify(canonical, null, 2),
    "Important constraints:",
    "- Preserve PF2E sheet structure and valid stat relationships.",
    "- Reuse official PF2E spells/items/actions/effects whenever they exist; do not fabricate duplicates.",
    "- Ensure descriptions use PF2E inline formatting (@Check, @Damage, @Template, @UUID).",
  ];
  return parts.join("\n\n");
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

export async function runNpcRemixFlow(actor: Actor): Promise<void> {
  const request = await promptRemixRequest(actor);
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
  const referenceText = buildRemixReferenceText(actor.name ?? canonical.name, canonical as unknown as Record<string, unknown>, request);

  let workingDialog: Dialog | null = null;
  try {
    workingDialog = showWorkingDialog(actor.name ?? canonical.name);

    const generated = await generation({
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
