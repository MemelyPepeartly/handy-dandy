import { CONSTANTS } from "../constants";
import { fetchOpenRouterCreditsSummary, type OpenRouterCreditsSummary } from "../openrouter/credits";
import { readConfiguredApiKey } from "../openrouter/runtime";

const OPENROUTER_CREDITS_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/openrouter-credits.hbs`;

interface OpenRouterCreditsDialogData {
  fetchedAt: string;
  availableCredits: string;
  totalCredits: string;
  totalUsage: string;
  usagePercent: string;
  keyLimitRemaining: string;
  keyLimit: string;
  keyUsage: string;
}

const numberFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

function formatValue(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return numberFormatter.format(value);
}

function formatPercent(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return `${numberFormatter.format(value)}%`;
}

function toDialogData(summary: OpenRouterCreditsSummary): OpenRouterCreditsDialogData {
  const usagePercent =
    typeof summary.totalCredits === "number" &&
    Number.isFinite(summary.totalCredits) &&
    summary.totalCredits > 0 &&
    typeof summary.totalUsage === "number" &&
    Number.isFinite(summary.totalUsage)
      ? (summary.totalUsage / summary.totalCredits) * 100
      : null;

  return {
    fetchedAt: new Date().toLocaleString(),
    availableCredits: formatValue(summary.availableCredits),
    totalCredits: formatValue(summary.totalCredits),
    totalUsage: formatValue(summary.totalUsage),
    usagePercent: formatPercent(usagePercent),
    keyLimitRemaining: formatValue(summary.keyLimitRemaining),
    keyLimit: formatValue(summary.keyLimit),
    keyUsage: formatValue(summary.keyUsage),
  } satisfies OpenRouterCreditsDialogData;
}

async function renderCreditsDialog(data: OpenRouterCreditsDialogData): Promise<void> {
  const content = await renderTemplate(OPENROUTER_CREDITS_TEMPLATE, data);

  await new Promise<void>((resolve) => {
    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | OpenRouter Credits`,
        content,
        buttons: {
          refresh: {
            icon: '<i class="fas fa-rotate-right"></i>',
            label: "Refresh",
            callback: () => {
              resolve();
              void runOpenRouterCreditsFlow();
            },
          },
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: "Close",
            callback: () => resolve(),
          },
        },
        default: "refresh",
        close: () => resolve(),
      },
      { jQuery: true, width: 540 },
    );

    dialog.render(true);
  });
}

export async function runOpenRouterCreditsFlow(): Promise<void> {
  const apiKey = readConfiguredApiKey();
  if (!apiKey) {
    ui.notifications?.warn(
      `${CONSTANTS.MODULE_NAME} | Connect OpenRouter first from Module Settings -> OpenRouter Account.`,
    );
    return;
  }

  try {
    const summary = await fetchOpenRouterCreditsSummary(apiKey);
    await renderCreditsDialog(toDialogData(summary));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Failed to fetch OpenRouter credits: ${message}`);
    console.error(`${CONSTANTS.MODULE_NAME} | Failed to fetch OpenRouter credits`, error);
  }
}

