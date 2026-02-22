import { CONSTANTS } from "../constants";

const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const OPENROUTER_EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";
const OAUTH_TIMEOUT_MS = 3 * 60 * 1000;
const OAUTH_POLL_MS = 250;
const BROWSER_RESULT_STORAGE_KEY = `${CONSTANTS.MODULE_ID}:openrouter-oauth-result`;
const DESKTOP_CALLBACK_PORT = 3000;
const DESKTOP_CALLBACK_PATH = `/${CONSTANTS.MODULE_ID}-openrouter-callback`;

type ConnectMode = "auto" | "browser" | "desktop";

interface OAuthCallbackPayload {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

interface OpenRouterAuthorizationRequest {
  authUrl: string;
  state: string;
  codeVerifier: string;
}

interface OpenRouterKeyExchangeResponse {
  key?: unknown;
  error?: unknown;
  message?: unknown;
}

interface ConnectWithOpenRouterOptions {
  mode: ConnectMode;
}

interface DesktopCallbackServer {
  getPayload: () => OAuthCallbackPayload | null;
  close: () => void;
}

function encodeBase64Url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

function parseErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as OpenRouterKeyExchangeResponse;
  if (typeof candidate.error === "string" && candidate.error.trim().length > 0) {
    return candidate.error.trim();
  }

  if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
    return candidate.message.trim();
  }

  return null;
}

function normalizeCallbackPayload(payload: unknown): OAuthCallbackPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Partial<OAuthCallbackPayload>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    state: typeof candidate.state === "string" ? candidate.state : undefined,
    error: typeof candidate.error === "string" ? candidate.error : undefined,
    errorDescription: typeof candidate.errorDescription === "string" ? candidate.errorDescription : undefined,
  };
}

function readBrowserPayload(): OAuthCallbackPayload | null {
  try {
    const raw = window.localStorage.getItem(BROWSER_RESULT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeCallbackPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

function clearBrowserPayload(): void {
  try {
    window.localStorage.removeItem(BROWSER_RESULT_STORAGE_KEY);
  } catch {
    // no-op
  }
}

function extractAuthorizationCode(payload: OAuthCallbackPayload, expectedState: string): string {
  if (payload.state !== expectedState) {
    throw new Error("OpenRouter login returned an invalid OAuth state.");
  }

  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    const details = typeof payload.errorDescription === "string" && payload.errorDescription.trim().length > 0
      ? `: ${payload.errorDescription.trim()}`
      : "";
    throw new Error(`OpenRouter OAuth error "${payload.error.trim()}"${details}`);
  }

  if (typeof payload.code !== "string" || payload.code.trim().length === 0) {
    throw new Error("OpenRouter login did not return an authorization code.");
  }

  return payload.code.trim();
}

function buildBrowserCallbackUrl(): string {
  return new URL(
    `modules/${CONSTANTS.MODULE_ID}/templates/openrouter-oauth-callback.html`,
    window.location.href,
  ).toString();
}

function buildDesktopCallbackUrl(): string {
  return `http://localhost:${DESKTOP_CALLBACK_PORT}${DESKTOP_CALLBACK_PATH}`;
}

function isValidOpenRouterOAuthUrl(url: URL): boolean {
  if (url.protocol === "http:" && url.hostname === "localhost" && url.port === "3000") {
    return true;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  const port = url.port || "443";
  return port === "443" || port === "3000";
}

function assertBrowserOAuthUrlCompatibility(callbackUrl: string): void {
  const originUrl = new URL(window.location.origin);
  const callback = new URL(callbackUrl);

  if (isValidOpenRouterOAuthUrl(originUrl) && isValidOpenRouterOAuthUrl(callback)) {
    return;
  }

  console.warn(
    `${CONSTANTS.MODULE_NAME} | OpenRouter OAuth URL compatibility warning. ` +
      `Origin=${window.location.origin}, Callback=${callbackUrl}.`,
  );
}

function createAuthorizationRequest(callbackUrl: string): OpenRouterAuthorizationRequest {
  const codeVerifier = randomBase64Url(64);
  const state = randomBase64Url(24);

  const authUrl = new URL(OPENROUTER_AUTH_URL);
  authUrl.searchParams.set("callback_url", callbackUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("code_challenge", codeVerifier);
  authUrl.searchParams.set("code_challenge_method", "plain");
  authUrl.searchParams.set("state", state);

  return {
    authUrl: authUrl.toString(),
    state,
    codeVerifier,
  };
}

function hasDesktopOAuthRuntime(): boolean {
  const runtime = globalThis as typeof globalThis & {
    require?: (moduleName: string) => unknown;
  };

  const requireFn = runtime.require;
  if (typeof requireFn !== "function") {
    return false;
  }

  try {
    const http = requireFn("http") as {
      createServer?: unknown;
    };
    return typeof http.createServer === "function";
  } catch {
    return false;
  }
}

function getServerErrorMessage(error: unknown): string {
  const candidate = error as {
    code?: unknown;
    message?: unknown;
  };

  if (candidate.code === "EADDRINUSE") {
    return `Unable to start local OAuth callback server on localhost:${DESKTOP_CALLBACK_PORT}. ` +
      `Close the app using that port, then try again.`;
  }

  if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
    return candidate.message.trim();
  }

  return "Failed to start local OAuth callback server.";
}

function callbackResponseHtml(hasError: boolean): string {
  const message = hasError
    ? "OpenRouter login failed. Return to Foundry and try again."
    : "OpenRouter login complete. Return to Foundry.";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>OpenRouter Login</title>
    <style>
      body { font-family: sans-serif; margin: 2rem; text-align: center; }
    </style>
  </head>
  <body>
    <p>${message}</p>
  </body>
</html>`;
}

async function startDesktopCallbackServer(): Promise<DesktopCallbackServer> {
  const runtime = globalThis as typeof globalThis & {
    require?: (moduleName: string) => unknown;
  };
  const requireFn = runtime.require;
  if (typeof requireFn !== "function") {
    throw new Error("Desktop OAuth requires Foundry desktop runtime.");
  }

  const http = requireFn("http") as {
    createServer?: (handler: (request: unknown, response: unknown) => void) => {
      on: (event: string, listener: (...args: unknown[]) => void) => void;
      off: (event: string, listener: (...args: unknown[]) => void) => void;
      once: (event: string, listener: (...args: unknown[]) => void) => void;
      listen: (port: number, host?: string) => void;
      close: () => void;
    };
  };

  if (typeof http.createServer !== "function") {
    throw new Error("Desktop OAuth callback server is unavailable in this runtime.");
  }

  let latestPayload: OAuthCallbackPayload | null = null;

  const server = http.createServer((request: unknown, response: unknown) => {
    const req = request as { url?: string };
    const res = response as {
      statusCode: number;
      setHeader: (name: string, value: string) => void;
      end: (content?: string) => void;
    };

    const rawUrl = typeof req.url === "string" ? req.url : "/";
    const parsedUrl = new URL(rawUrl, `http://localhost:${DESKTOP_CALLBACK_PORT}`);

    if (parsedUrl.pathname !== DESKTOP_CALLBACK_PATH) {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("Not found");
      return;
    }

    latestPayload = {
      code: parsedUrl.searchParams.get("code") ?? undefined,
      state: parsedUrl.searchParams.get("state") ?? undefined,
      error: parsedUrl.searchParams.get("error") ?? undefined,
      errorDescription: parsedUrl.searchParams.get("error_description") ?? undefined,
    };

    const hasError = typeof latestPayload.error === "string" && latestPayload.error.trim().length > 0;
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(callbackResponseHtml(hasError));
  });

  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    const onError = (error: unknown) => {
      server.off("listening", onListening);
      reject(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
    server.listen(DESKTOP_CALLBACK_PORT);
  }).catch((error: unknown) => {
    throw new Error(getServerErrorMessage(error));
  });

  return {
    getPayload: () => latestPayload,
    close: () => {
      try {
        server.close();
      } catch {
        // no-op
      }
    },
  };
}

async function waitForDesktopPayload(server: DesktopCallbackServer, expectedState: string): Promise<OAuthCallbackPayload> {
  return await new Promise<OAuthCallbackPayload>((resolve, reject) => {
    let settled = false;
    let timeoutId = 0;
    let pollId = 0;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(pollId);
      server.close();
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const succeed = (payload: OAuthCallbackPayload) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    };

    timeoutId = window.setTimeout(() => {
      fail(new Error("OpenRouter login timed out. Please try again."));
    }, OAUTH_TIMEOUT_MS);

    pollId = window.setInterval(() => {
      const payload = server.getPayload();
      if (!payload) {
        return;
      }

      if (typeof payload.state === "string" && payload.state !== expectedState) {
        return;
      }

      succeed(payload);
    }, OAUTH_POLL_MS);
  });
}

function openAuthTab(url: string): Window | null {
  try {
    return window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    return null;
  }
}

function navigateAuthTab(popup: Window | null, url: string): Window | null {
  if (popup && !popup.closed) {
    try {
      popup.location.href = url;
      return popup;
    } catch {
      // Ignore and fall through to opening a new tab.
    }
  }
  return openAuthTab(url);
}

async function waitForBrowserPayload(expectedState: string, popup: Window | null): Promise<OAuthCallbackPayload> {
  return await new Promise<OAuthCallbackPayload>((resolve, reject) => {
    let settled = false;
    let timeoutId = 0;
    let closeCheckId = 0;
    let pollId = 0;

    const cleanup = () => {
      window.removeEventListener("storage", onStorage);
      window.clearTimeout(timeoutId);
      window.clearInterval(closeCheckId);
      window.clearInterval(pollId);
      if (popup) {
        try {
          popup.close();
        } catch {
          // no-op
        }
      }
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const succeed = (payload: OAuthCallbackPayload) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    };

    const consumePayload = (payload: OAuthCallbackPayload | null): boolean => {
      if (!payload) {
        return false;
      }
      if (typeof payload.state === "string" && payload.state !== expectedState) {
        return false;
      }
      clearBrowserPayload();
      succeed(payload);
      return true;
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== BROWSER_RESULT_STORAGE_KEY || !event.newValue) {
        return;
      }
      try {
        consumePayload(normalizeCallbackPayload(JSON.parse(event.newValue)));
      } catch {
        // ignore malformed writes
      }
    };

    timeoutId = window.setTimeout(() => {
      fail(new Error("OpenRouter login timed out. Please try again."));
    }, OAUTH_TIMEOUT_MS);

    closeCheckId = window.setInterval(() => {
      if (consumePayload(readBrowserPayload())) {
        return;
      }
      if (popup && popup.closed) {
        fail(new Error("OpenRouter login window was closed before authentication completed."));
      }
    }, OAUTH_POLL_MS);

    pollId = window.setInterval(() => {
      consumePayload(readBrowserPayload());
    }, OAUTH_POLL_MS);

    window.addEventListener("storage", onStorage);
    consumePayload(readBrowserPayload());
  });
}

async function exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<string> {
  const response = await fetch(OPENROUTER_EXCHANGE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      code_challenge_method: "plain",
    }),
  });

  const payload = await response
    .json()
    .catch(() => ({} as OpenRouterKeyExchangeResponse));

  if (!response.ok) {
    const reason = parseErrorMessage(payload);
    const suffix = reason ? ` ${reason}` : "";
    throw new Error(`OpenRouter key exchange failed (${response.status} ${response.statusText}).${suffix}`);
  }

  const apiKey = typeof payload.key === "string" ? payload.key.trim() : "";
  if (!apiKey) {
    throw new Error("OpenRouter key exchange succeeded, but no API key was returned.");
  }

  return apiKey;
}

async function runBrowserFlow(): Promise<string> {
  const callbackUrl = buildBrowserCallbackUrl();
  assertBrowserOAuthUrlCompatibility(callbackUrl);
  const request = createAuthorizationRequest(callbackUrl);
  clearBrowserPayload();
  const popup = openAuthTab(request.authUrl);
  const payload = await waitForBrowserPayload(request.state, popup);
  const code = extractAuthorizationCode(payload, request.state);
  return await exchangeAuthorizationCode(code, request.codeVerifier);
}

async function runDesktopFlow(): Promise<string> {
  const request = createAuthorizationRequest(buildDesktopCallbackUrl());
  // Match Moulinette behavior: open a tab from the click context first.
  const preOpenedTab = openAuthTab("about:blank");
  let callbackServer: DesktopCallbackServer | null = null;
  try {
    callbackServer = await startDesktopCallbackServer();
    navigateAuthTab(preOpenedTab, request.authUrl);
    const payload = await waitForDesktopPayload(callbackServer, request.state);
    const code = extractAuthorizationCode(payload, request.state);
    return await exchangeAuthorizationCode(code, request.codeVerifier);
  } catch (error) {
    // If callback setup fails, still launch auth so user sees the flow.
    navigateAuthTab(preOpenedTab, request.authUrl);
    throw error;
  } finally {
    if (preOpenedTab && !preOpenedTab.closed) {
      try {
        preOpenedTab.close();
      } catch {
        // no-op
      }
    }
    callbackServer?.close();
  }
}

export function canUseDesktopOpenRouterOAuth(): boolean {
  return hasDesktopOAuthRuntime();
}

export async function connectWithOpenRouter(options: ConnectWithOpenRouterOptions): Promise<string> {
  if (options.mode === "auto") {
    if (hasDesktopOAuthRuntime()) {
      return await runDesktopFlow();
    }
    return await runBrowserFlow();
  }

  if (options.mode === "desktop") {
    return await runDesktopFlow();
  }
  return await runBrowserFlow();
}
