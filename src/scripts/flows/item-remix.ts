import { CONSTANTS } from "../constants";
import { fromFoundryItem } from "../mappers/export";
import { importItem } from "../mappers/import";
import { showGeneratedOutputRecoveryDialog } from "../ui/generated-output-recovery";

export interface ItemRemixRequest {
  instructions: string;
  generateItemImage?: boolean;
  itemImagePrompt?: string;
}

type ItemRemixFormResponse = {
  instructions: string;
  generateItemImage: string | null;
  itemImagePrompt: string;
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

function buildRemixReferenceText(
  itemName: string,
  canonical: ReturnType<typeof fromFoundryItem>,
  sourceFoundryType: string,
  request: ItemRemixRequest,
): string {
  const parts = [
    `Remix the existing PF2E item "${itemName}".`,
    "Preserve system compatibility and item structure while applying the requested changes.",
    `The source Foundry document type is "${sourceFoundryType}". Keep this same document type and structure compatibility.`,
    "Apply this remix specification:",
    request.instructions,
    "Current canonical item data (JSON):",
    JSON.stringify(canonical, null, 2),
    "Important constraints:",
    "- Keep official PF2E names/slugs for existing content when available.",
    "- Keep output compatible with Foundry PF2E import mapping.",
    "- Use PF2E inline formatting in description text (@Check, @Damage, @Template, @UUID where relevant).",
  ];

  if (request.generateItemImage) {
    parts.push("- Generate a transparent icon suitable for Foundry item sheets.");
  }

  if (request.itemImagePrompt?.trim()) {
    parts.push(`- Item icon direction: ${request.itemImagePrompt.trim()}`);
  }

  return parts.join("\n\n");
}

async function promptItemRemixRequest(item: Item): Promise<ItemRemixRequest | null> {
  const content = `
    <form class="handy-dandy-item-remix-form" style="display:flex;flex-direction:column;gap:0.75rem;min-width:560px;">
      <div class="form-group">
        <label for="handy-dandy-item-remix-instructions">Remix Instructions</label>
        <textarea id="handy-dandy-item-remix-instructions" name="instructions" rows="10" placeholder="Examples: increase level to 10, switch to rare version, rewrite activation, improve damage scaling, add official trait support."></textarea>
      </div>
      <div class="form-group">
        <label><input type="checkbox" name="generateItemImage" /> Generate transparent item icon</label>
      </div>
      <div class="form-group">
        <label for="handy-dandy-item-remix-image-prompt">Item Image Prompt Override (optional)</label>
        <input id="handy-dandy-item-remix-image-prompt" type="text" name="itemImagePrompt" placeholder="Optional icon art direction" />
      </div>
      <p class="notes">Current item: <strong>${escapeHtml(item.name ?? "Unnamed Item")}</strong></p>
    </form>
  `;

  const response = await new Promise<ItemRemixFormResponse | null>((resolve) => {
    let settled = false;
    const finish = (value: ItemRemixFormResponse | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | Remix ${item.name ?? "Item"}`,
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
                generateItemImage: formData.get("generateItemImage") as string | null,
                itemImagePrompt: String(formData.get("itemImagePrompt") ?? ""),
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

  const instructions = response.instructions.trim();
  if (!instructions) {
    ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Remix instructions are required.`);
    return null;
  }

  return {
    instructions,
    generateItemImage: response.generateItemImage ? true : undefined,
    itemImagePrompt: response.itemImagePrompt.trim() || undefined,
  };
}

function showWorkingDialog(itemName: string): Dialog {
  const safeName = escapeHtml(itemName);
  const dialog = new Dialog(
    {
      title: `${CONSTANTS.MODULE_NAME} | Remixing`,
      content: `
        <div class="handy-dandy-remix-loading">
          <p><i class="fas fa-spinner fa-spin"></i> Remixing ${safeName}...</p>
          <p class="notes">Generating updated item data and applying it to this sheet.</p>
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

function coerceRemixItemTypeToExisting(
  generated: Parameters<typeof importItem>[0],
  existingItemType: string,
): Parameters<typeof importItem>[0] {
  if (generated.itemType === existingItemType) {
    return generated;
  }

  ui.notifications?.warn(
    `${CONSTANTS.MODULE_NAME} | Remix attempted to change item type from "${existingItemType}" to ` +
      `"${generated.itemType}". Keeping original type for in-place update.`,
  );

  console.warn(
    `${CONSTANTS.MODULE_NAME} | Remix changed itemType from "${existingItemType}" to "${generated.itemType}". ` +
      `Keeping existing item type for in-place update.`,
  );

  return {
    ...generated,
    itemType: existingItemType as Parameters<typeof importItem>[0]["itemType"],
  };
}

export async function runItemRemixWithRequest(item: Item, request: ItemRemixRequest): Promise<void> {
  const generation = game.handyDandy?.generation?.generateItem;
  if (!generation) {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Item generation is unavailable.`);
    return;
  }

  const canonical = fromFoundryItem(item.toObject() as any);
  const itemName = item.name ?? canonical.name;
  const sourceFoundryType = String(item.type ?? "item");

  let workingDialog: Dialog | null = null;
  let generatedForUpdate: Parameters<typeof importItem>[0] | null = null;
  try {
    workingDialog = showWorkingDialog(itemName);
    const referenceText = buildRemixReferenceText(itemName, canonical, sourceFoundryType, request);
    const generated = await generation({
      systemId: canonical.systemId,
      name: itemName,
      slug: canonical.slug,
      itemType: canonical.itemType,
      referenceText,
      img: request.generateItemImage ? undefined : canonical.img ?? undefined,
      publication: canonical.publication,
      generateItemImage: request.generateItemImage,
      itemImagePrompt: request.itemImagePrompt,
    });

    generatedForUpdate = coerceRemixItemTypeToExisting(generated, canonical.itemType);
    const imported = await importItem(generatedForUpdate, {
      itemId: item.id ?? undefined,
      actorId: item.actor?.id ?? undefined,
      folderId: item.actor ? undefined : item.folder?.id ?? undefined,
      strictTarget: true,
    });

    workingDialog.close({ force: true });
    workingDialog = null;

    ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Remixed ${imported.name}.`);
    imported.sheet?.render(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Item remix failed: ${message}`);

    if (generatedForUpdate) {
      await showGeneratedOutputRecoveryDialog({
        title: `${CONSTANTS.MODULE_NAME} | Item Remix Output`,
        summary: `Item remix generated JSON for "${itemName}", but Foundry could not apply it.`,
        payload: generatedForUpdate,
        filenameBase: `${itemName}-item-remix`,
      });
    }

    console.error(`${CONSTANTS.MODULE_NAME} | Item remix failed`, error);
  } finally {
    workingDialog?.close({ force: true });
  }
}

export async function runItemRemixFlow(item: Item): Promise<void> {
  const request = await promptItemRemixRequest(item);
  if (!request) {
    return;
  }

  await runItemRemixWithRequest(item, request);
}
