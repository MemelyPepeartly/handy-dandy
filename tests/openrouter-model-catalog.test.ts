import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { loadOpenRouterModelChoiceCatalog } from "../src/scripts/openrouter/model-catalog";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

const previousFetch = globalThis.fetch;
const previousGame = globalThis.game;

function createResponse(body: unknown, ok = true, status = 200, statusText = "OK"): Response {
  return {
    ok,
    status,
    statusText,
    json: async () => body,
  } as Response;
}

function setGameSettings(values: Record<string, unknown>): void {
  globalThis.game = {
    settings: {
      get(moduleId: string, key: string) {
        assert.equal(moduleId, "handy-dandy");
        return values[key] ?? null;
      },
    },
  } as Game;
}

afterEach(() => {
  globalThis.fetch = previousFetch;
  globalThis.game = previousGame;
});

test("loadOpenRouterModelChoiceCatalog only exposes text models with structured outputs", async () => {
  setGameSettings({
    OpenRouterApiKey: "",
    OpenRouterModel: "",
    OpenRouterImageModel: "",
  });

  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return createResponse({
      data: [
        {
          id: "vendor/structured-model",
          name: "Structured Model",
          context_length: 128000,
          architecture: {
            input_modalities: ["text"],
            output_modalities: ["text"],
          },
          supported_parameters: ["structured_outputs", "tools"],
        },
        {
          id: "vendor/tool-only-model",
          name: "Tool Only",
          context_length: 32000,
          architecture: {
            input_modalities: ["text"],
            output_modalities: ["text"],
          },
          supported_parameters: ["tools", "tool_choice"],
        },
        {
          id: "vendor/image-model",
          name: "Image Model",
          context_length: 32000,
          architecture: {
            input_modalities: ["text", "image"],
            output_modalities: ["image"],
          },
          supported_parameters: ["response_format"],
        },
      ],
    });
  }) as typeof fetch;

  const catalog = await loadOpenRouterModelChoiceCatalog({ forceRefresh: true });

  assert.equal(calls.length, 1);
  assert.equal(String(calls[0]?.input), "https://openrouter.ai/api/v1/models");
  assert.equal(catalog.textChoices["vendor/structured-model"], "Structured Model (vendor/structured-model)");
  assert.equal(Object.hasOwn(catalog.textChoices, "vendor/tool-only-model"), false);
  assert.equal(catalog.imageChoices["vendor/image-model"], "Image Model (vendor/image-model)");
  assert.equal(catalog.capabilitiesById["vendor/structured-model"]?.supportsStructuredOutputs, true);
  assert.equal(catalog.capabilitiesById["vendor/tool-only-model"]?.supportsStructuredOutputs, false);
});

test("loadOpenRouterModelChoiceCatalog prefers the user-filtered endpoint when an API key is present", async () => {
  setGameSettings({
    OpenRouterApiKey: "or-key",
    OpenRouterModel: "",
    OpenRouterImageModel: "",
  });

  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    if (String(input) === "https://openrouter.ai/api/v1/models/user") {
      return createResponse({}, false, 401, "Unauthorized");
    }

    return createResponse({
      data: [
        {
          id: "vendor/structured-model",
          name: "Structured Model",
          architecture: {
            input_modalities: ["text"],
            output_modalities: ["text"],
          },
          supported_parameters: ["structured_outputs"],
        },
      ],
    });
  }) as typeof fetch;

  const catalog = await loadOpenRouterModelChoiceCatalog({ forceRefresh: true });

  assert.equal(calls.length, 2);
  assert.equal(String(calls[0]?.input), "https://openrouter.ai/api/v1/models/user");
  assert.equal(String(calls[1]?.input), "https://openrouter.ai/api/v1/models");
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string> | undefined)?.Authorization,
    "Bearer or-key",
  );
  assert.equal(Object.hasOwn(catalog.textChoices, "vendor/structured-model"), true);
});
