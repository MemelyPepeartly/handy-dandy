import { CONSTANTS } from "../constants";
import { DEFAULT_GENERATION_SEED } from "../generation";
import { readOpenRouterSettings } from "../openrouter/client";
import {
  generateRuleElements,
  PF2E_RULE_ELEMENT_KEYS,
  type RuleElementGenerationRequest,
  type RuleElementGenerationResult,
} from "./rule-element-generator";

const RULE_ELEMENT_GENERATOR_REQUEST_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/rule-element-generator-request.hbs`;
const RULE_ELEMENT_GENERATOR_LOADING_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/rule-element-generator-loading.hbs`;
const RULE_ELEMENT_GENERATOR_RESULT_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/rule-element-generator-result.hbs`;

type RuleElementGeneratorFormResponse = {
  objective: string;
  targetItemType: string;
  preferredRuleKeys: string;
  desiredRuleCount: string;
  contextJson: string;
  constraints: string;
  seed: string;
};

function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return undefined;
  }

  return parsed;
}

function parseOptionalCount(value: string): number | undefined {
  const parsed = parseOptionalInteger(value);
  if (typeof parsed !== "number") {
    return undefined;
  }

  if (parsed < 1) {
    return undefined;
  }

  return Math.min(parsed, 20);
}

function parsePreferredRuleKeys(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeContextJson(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    throw new Error("Context JSON must be valid JSON.");
  }
}

function sanitizeRequest(response: RuleElementGeneratorFormResponse): RuleElementGenerationRequest {
  const objective = response.objective.trim();
  if (!objective) {
    throw new Error("Describe what the generated rule elements should do.");
  }

  const seed = parseOptionalInteger(response.seed);
  if (response.seed.trim().length > 0 && typeof seed !== "number") {
    throw new Error("Seed must be a whole number.");
  }

  const desiredRuleCount = parseOptionalCount(response.desiredRuleCount);
  if (response.desiredRuleCount.trim().length > 0 && typeof desiredRuleCount !== "number") {
    throw new Error("Desired rule count must be a whole number between 1 and 20.");
  }

  const preferredRuleKeys = parsePreferredRuleKeys(response.preferredRuleKeys);
  const validKeySet = new Set<string>(PF2E_RULE_ELEMENT_KEYS);
  const invalidPreferredKeys = preferredRuleKeys.filter((key) => !validKeySet.has(key));
  if (invalidPreferredKeys.length > 0) {
    throw new Error(
      `Unknown preferred rule keys: ${invalidPreferredKeys.join(", ")}. Use exact PF2E rule-element key names.`,
    );
  }

  return {
    objective,
    targetItemType: response.targetItemType.trim() || undefined,
    preferredRuleKeys,
    desiredRuleCount,
    contextJson: normalizeContextJson(response.contextJson),
    constraints: response.constraints.trim() || undefined,
    seed,
  };
}

async function promptRuleElementGenerationRequest(): Promise<RuleElementGenerationRequest | null> {
  const settings = readOpenRouterSettings();
  const defaultSeed = typeof settings.seed === "number" ? settings.seed : DEFAULT_GENERATION_SEED;
  const content = await renderTemplate(RULE_ELEMENT_GENERATOR_REQUEST_TEMPLATE, {
    connected: Boolean(game.handyDandy?.openRouterClient),
    textModel: settings.model,
    temperature: settings.temperature,
    topP: settings.top_p,
    defaultSeed,
    supportedRuleKeys: PF2E_RULE_ELEMENT_KEYS,
  });

  const response = await new Promise<RuleElementGeneratorFormResponse | null>((resolve) => {
    let settled = false;
    const finish = (value: RuleElementGeneratorFormResponse | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | Rule Element Generator`,
        content,
        buttons: {
          generate: {
            icon: '<i class="fas fa-gears"></i>',
            label: "Generate",
            callback: (html) => {
              const form = html[0]?.querySelector("form");
              if (!(form instanceof HTMLFormElement)) {
                finish(null);
                return;
              }

              const formData = new FormData(form);
              finish({
                objective: String(formData.get("objective") ?? ""),
                targetItemType: String(formData.get("targetItemType") ?? ""),
                preferredRuleKeys: String(formData.get("preferredRuleKeys") ?? ""),
                desiredRuleCount: String(formData.get("desiredRuleCount") ?? ""),
                contextJson: String(formData.get("contextJson") ?? ""),
                constraints: String(formData.get("constraints") ?? ""),
                seed: String(formData.get("seed") ?? ""),
              });
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => finish(null),
          },
        },
        default: "generate",
        close: () => finish(null),
      },
      { jQuery: true, width: 860 },
    );

    dialog.render(true);
  });

  if (!response) {
    return null;
  }

  return sanitizeRequest(response);
}

async function showRuleElementLoadingDialog(): Promise<Dialog> {
  const content = await renderTemplate(RULE_ELEMENT_GENERATOR_LOADING_TEMPLATE, {});
  const dialog = new Dialog(
    {
      title: `${CONSTANTS.MODULE_NAME} | Generating Rule Elements`,
      content,
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
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildResultFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `handy-dandy-rule-elements-${stamp}.json`;
}

async function showRuleElementResultDialog(result: RuleElementGenerationResult): Promise<void> {
  const rulesJson = JSON.stringify(result.rules, null, 2);
  const fullPayloadJson = JSON.stringify(result, null, 2);
  const content = await renderTemplate(RULE_ELEMENT_GENERATOR_RESULT_TEMPLATE, {
    summary: result.summary,
    assumptions: result.assumptions,
    validationChecks: result.validationChecks,
    rulesCount: result.rules.length,
    rulesJson,
  });

  await new Promise<void>((resolve) => {
    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | Rule Element Generator Result`,
        content,
        buttons: {
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: "Close",
            callback: () => resolve(),
          },
        },
        default: "close",
        close: () => resolve(),
      },
      { jQuery: true, width: 900 },
    );

    const hookId = Hooks.on("renderDialog", (app: Dialog, html: JQuery) => {
      if (app !== dialog) {
        return;
      }

      Hooks.off("renderDialog", hookId);

      const root = html[0];
      if (!(root instanceof HTMLElement)) {
        return;
      }

      const copyRulesButton = root.querySelector<HTMLButtonElement>("button[data-action='copy-rules']");
      const copyFullButton = root.querySelector<HTMLButtonElement>("button[data-action='copy-full']");
      const downloadButton = root.querySelector<HTMLButtonElement>("button[data-action='download']");

      copyRulesButton?.addEventListener("click", () => {
        void copyToClipboard(rulesJson).then((copied) => {
          if (copied) {
            ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Copied rules array JSON.`);
          } else {
            ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Clipboard copy failed.`);
          }
        });
      });

      copyFullButton?.addEventListener("click", () => {
        void copyToClipboard(fullPayloadJson).then((copied) => {
          if (copied) {
            ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Copied full generator output JSON.`);
          } else {
            ui.notifications?.warn(`${CONSTANTS.MODULE_NAME} | Clipboard copy failed.`);
          }
        });
      });

      downloadButton?.addEventListener("click", () => {
        downloadJson(rulesJson, buildResultFilename());
        ui.notifications?.info(`${CONSTANTS.MODULE_NAME} | Downloaded generated rules JSON.`);
      });
    });

    dialog.render(true);
  });
}

export async function runRuleElementGeneratorFlow(): Promise<void> {
  const openRouterClient = game.handyDandy?.openRouterClient;
  if (!openRouterClient || typeof openRouterClient.generateWithSchema !== "function") {
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | OpenRouter is not configured.`);
    return;
  }

  let request: RuleElementGenerationRequest | null = null;
  try {
    request = await promptRuleElementGenerationRequest();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Rule Element Generator: ${message}`);
    return;
  }

  if (!request) {
    return;
  }

  let loadingDialog: Dialog | null = null;
  try {
    loadingDialog = await showRuleElementLoadingDialog();
    const result = await generateRuleElements(openRouterClient, request);
    loadingDialog.close({ force: true });
    loadingDialog = null;
    await showRuleElementResultDialog(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Rule Element generation failed: ${message}`);
    console.error(`${CONSTANTS.MODULE_NAME} | Rule Element generation failed`, error);
  } finally {
    loadingDialog?.close({ force: true });
  }
}
