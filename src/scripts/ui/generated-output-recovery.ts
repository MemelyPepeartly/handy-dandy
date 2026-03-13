import { CONSTANTS } from "../constants";
import { waitForDialog } from "../foundry/dialog";
import { renderApplicationTemplate } from "../foundry/templates";

const GENERATION_RECOVERY_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/generation-recovery-dialog.hbs`;

interface ShowGeneratedOutputRecoveryOptions {
  title: string;
  summary: string;
  payload: unknown;
  filenameBase: string;
}

function sanitizeFilename(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || "handy-dandy-generated";
}

function buildFilename(base: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${sanitizeFilename(base)}-${stamp}.json`;
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (error) {
    console.warn(`${CONSTANTS.MODULE_NAME} | Clipboard copy failed`, error);
    return false;
  }
}

function downloadJson(json: string, filename: string): void {
  const saver = (globalThis as { saveDataToFile?: (data: string, type: string, filename: string) => void }).saveDataToFile;
  if (typeof saver === "function") {
    saver(json, "application/json", filename);
    return;
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function showGeneratedOutputRecoveryDialog(
  options: ShowGeneratedOutputRecoveryOptions,
): Promise<void> {
  const json = JSON.stringify(options.payload, null, 2);
  const filename = buildFilename(options.filenameBase);
  const content = await renderApplicationTemplate(GENERATION_RECOVERY_TEMPLATE, {
    summary: options.summary,
    json,
  });

  await waitForDialog<"close">({
    title: options.title,
    content,
    width: 780,
    closeResult: "close",
    buttons: [
      {
        action: "copy",
        icon: '<i class="fas fa-copy"></i>',
        label: "Copy JSON",
        callback: () => {
          void copyToClipboard(json).then((copied) => {
            if (copied) {
              ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Copied generated JSON to clipboard.`);
            } else {
              ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Clipboard copy failed.`);
            }
          });
          return false;
        },
      },
      {
        action: "download",
        icon: '<i class="fas fa-download"></i>',
        label: "Download JSON",
        callback: () => {
          downloadJson(json, filename);
          ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Downloaded generated JSON.`);
          return false;
        },
      },
      {
        action: "close",
        icon: '<i class="fas fa-times"></i>',
        label: "Close",
        default: true,
        callback: () => "close",
      },
    ],
  });
}

