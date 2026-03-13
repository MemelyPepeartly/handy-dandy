import { CONSTANTS } from "../constants";
import { fetchOpenRouterCreditsSummary, type OpenRouterCreditsSummary } from "../openrouter/credits";
import { readConfiguredApiKey } from "../openrouter/runtime";
import { waitForDialog } from "../foundry/dialog";
import { renderApplicationTemplate } from "../foundry/templates";

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
  const content = await renderApplicationTemplate(OPENROUTER_CREDITS_TEMPLATE, data);

  const action = await waitForDialog<"refresh" | "close">({
    title: `${CONSTANTS.MODULE_NAME} | OpenRouter Credits`,
    content,
    width: 540,
    closeResult: "close",
    buttons: [
      {
        action: "refresh",
        icon: '<i class="fas fa-rotate-right"></i>',
        label: "Refresh",
        default: true,
        callback: () => "refresh",
      },
      {
        action: "close",
        icon: '<i class="fas fa-times"></i>',
        label: "Close",
        callback: () => "close",
      },
    ],
  });

  if (action === "refresh") {
    void runOpenRouterCreditsFlow();
  }
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

