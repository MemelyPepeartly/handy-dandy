import { CONSTANTS } from "../constants";

const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";

export interface OpenRouterCreditsSummary {
  totalCredits: number | null;
  totalUsage: number | null;
  availableCredits: number | null;
  keyLimitRemaining: number | null;
  keyLimit: number | null;
  keyUsage: number | null;
}

interface FetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  payload: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function firstNumber(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    const parsed = asNumber(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function readField(payload: unknown, ...keys: string[]): unknown {
  const root = asRecord(payload);
  const data = asRecord(root?.["data"]);
  for (const key of keys) {
    if (root && Object.prototype.hasOwnProperty.call(root, key)) {
      return root[key];
    }
    if (data && Object.prototype.hasOwnProperty.call(data, key)) {
      return data[key];
    }
  }

  return undefined;
}

async function fetchOpenRouterEndpoint(url: string, apiKey: string): Promise<FetchResult> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": CONSTANTS.MODULE_NAME,
      Accept: "application/json",
    },
  });

  const payload = await response
    .json()
    .catch(async () => {
      const text = await response.text().catch(() => "");
      return text;
    });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    payload,
  } satisfies FetchResult;
}

function parseOpenRouterError(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload.trim();
  }

  const root = asRecord(payload);
  if (!root) {
    return null;
  }

  const error = root["error"];
  const errorRecord = asRecord(error);
  const message = errorRecord?.["message"] ?? root["message"];
  if (typeof message === "string" && message.trim().length > 0) {
    return message.trim();
  }

  return null;
}

export async function fetchOpenRouterCreditsSummary(apiKey: string): Promise<OpenRouterCreditsSummary> {
  const [creditsResult, keyResult] = await Promise.all([
    fetchOpenRouterEndpoint(OPENROUTER_CREDITS_URL, apiKey),
    fetchOpenRouterEndpoint(OPENROUTER_KEY_URL, apiKey),
  ]);

  if (!creditsResult.ok && !keyResult.ok) {
    const creditsMessage = parseOpenRouterError(creditsResult.payload);
    const keyMessage = parseOpenRouterError(keyResult.payload);
    const detail =
      creditsMessage ??
      keyMessage ??
      `${creditsResult.status} ${creditsResult.statusText}`.trim();
    throw new Error(`Unable to fetch OpenRouter credits. ${detail}`);
  }

  const totalCredits = firstNumber(
    readField(creditsResult.payload, "total_credits", "totalCredits"),
  );
  const totalUsage = firstNumber(
    readField(creditsResult.payload, "total_usage", "totalUsage"),
  );
  const providedAvailable = firstNumber(
    readField(creditsResult.payload, "available_credits", "availableCredits", "remaining_credits", "remainingCredits"),
  );
  const availableCredits =
    providedAvailable ??
    (typeof totalCredits === "number" && typeof totalUsage === "number"
      ? totalCredits - totalUsage
      : null);

  const keyLimitRemaining = firstNumber(
    readField(keyResult.payload, "limit_remaining", "limitRemaining"),
  );
  const keyLimit = firstNumber(
    readField(keyResult.payload, "limit"),
  );
  const keyUsage = firstNumber(
    readField(keyResult.payload, "usage"),
  );

  return {
    totalCredits,
    totalUsage,
    availableCredits,
    keyLimitRemaining,
    keyLimit,
    keyUsage,
  } satisfies OpenRouterCreditsSummary;
}

