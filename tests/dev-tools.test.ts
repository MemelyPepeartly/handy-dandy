import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canUseDeveloperTools,
  createDevNamespace,
  type DevGenerateActionOptions,
} from "../src/scripts/dev/tools";
import type { ActionPromptInput } from "../src/scripts/prompts";
import type { ActionSchemaData } from "../src/scripts/schemas";
import type {
  EnsureValidOptions,
  SchemaDataFor,
  ValidatorKey,
} from "../src/scripts/validation/ensure-valid";
import type { ImportOptions } from "../src/scripts/mappers/import";
import type { GPTClient } from "../src/scripts/gpt/client";

const noopGenerateAction = async (): Promise<ActionSchemaData> =>
  ({ name: "noop", systemId: "pf2e" } as ActionSchemaData);

const noopEnsureValid = async <K extends ValidatorKey>(
  options: EnsureValidOptions<K>,
): Promise<SchemaDataFor<K>> =>
  ({ ...(options.payload as Record<string, unknown>) } as SchemaDataFor<K>);

const noopImportAction = async (
  _json: ActionSchemaData,
  _options?: ImportOptions,
): Promise<Item> => ({ uuid: "Item.noop" } as Item);

function createConsoleStub() {
  const groups: unknown[][] = [];
  const infos: unknown[][] = [];
  const warns: unknown[][] = [];
  const errors: unknown[][] = [];
  let endCount = 0;

  const stub = {
    groupCollapsed: (...args: unknown[]) => {
      groups.push(args);
    },
    groupEnd: () => {
      endCount += 1;
    },
    info: (...args: unknown[]) => {
      infos.push(args);
    },
    warn: (...args: unknown[]) => {
      warns.push(args);
    },
    error: (...args: unknown[]) => {
      errors.push(args);
    },
  } satisfies Pick<Console, "groupCollapsed" | "groupEnd" | "info" | "warn" | "error">;

  return { stub, groups, infos, warns, errors, getEndCount: () => endCount };
}

test("dev.generateAction delegates to the provided generator and logs output", async () => {
  const prompt: ActionPromptInput = {
    systemId: "pf2e",
    title: "Test Action",
    referenceText: "Performs a quick strike.",
  };
  const options: DevGenerateActionOptions = { seed: 42 };
  const expected: ActionSchemaData = {
    name: "Test Action",
    systemId: "pf2e",
  } as ActionSchemaData;

  const consoleRecorder = createConsoleStub();
  let capturedOptions: DevGenerateActionOptions | undefined;

  const namespace = createDevNamespace({
    canAccess: () => true,
    getGptClient: () => null,
    generateAction: async (input, opts) => {
      assert.equal(input, prompt);
      capturedOptions = opts;
      return expected;
    },
    ensureValid: noopEnsureValid,
    importAction: noopImportAction,
    console: consoleRecorder.stub,
  });

  const result = await namespace.generateAction(prompt, options);

  assert.equal(result, expected);
  assert.deepEqual(capturedOptions, options);
  assert.equal(consoleRecorder.groups.length, 1);
  assert.ok(String(consoleRecorder.groups[0][0]).includes("dev.generateAction"));
  assert.ok(consoleRecorder.infos.some((entry) => entry[0] === "Result:"));
  assert.equal(consoleRecorder.getEndCount(), 1);
});

test("developer helpers enforce access restrictions", async () => {
  const consoleRecorder = createConsoleStub();
  const namespace = createDevNamespace({
    canAccess: () => false,
    getGptClient: () => null,
    generateAction: noopGenerateAction,
    ensureValid: noopEnsureValid,
    importAction: noopImportAction,
    console: consoleRecorder.stub,
  });

  await assert.rejects(
    namespace.generateAction({
      systemId: "pf2e",
      title: "Forbidden",
      referenceText: "",
    }),
    /restricted to GMs or developer mode/,
  );

  assert.equal(consoleRecorder.warns.length, 1);
});

test("dev.validate injects the active GPT client by default", async () => {
  const consoleRecorder = createConsoleStub();
  const gptClient = { generateWithSchema: async () => ({}) } as unknown as Pick<
    GPTClient,
    "generateWithSchema"
  >;

  let capturedOptions: EnsureValidOptions<"action"> | undefined;

  const namespace = createDevNamespace({
    canAccess: () => true,
    getGptClient: () => gptClient,
    generateAction: noopGenerateAction,
    ensureValid: async (options) => {
      capturedOptions = options as EnsureValidOptions<"action">;
      return options.payload as SchemaDataFor<"action">;
    },
    importAction: noopImportAction,
    console: consoleRecorder.stub,
  });

  const payload = { name: "Validated" };
  await namespace.validate("action", payload);

  assert.ok(capturedOptions);
  assert.equal(capturedOptions?.gptClient, gptClient);
});

test("dev.validate respects the useGPT override", async () => {
  const consoleRecorder = createConsoleStub();
  const gptClient = { generateWithSchema: async () => ({}) } as unknown as Pick<
    GPTClient,
    "generateWithSchema"
  >;

  let capturedOptions: EnsureValidOptions<"action"> | undefined;

  const namespace = createDevNamespace({
    canAccess: () => true,
    getGptClient: () => gptClient,
    generateAction: noopGenerateAction,
    ensureValid: async (options) => {
      capturedOptions = options as EnsureValidOptions<"action">;
      return options.payload as SchemaDataFor<"action">;
    },
    importAction: noopImportAction,
    console: consoleRecorder.stub,
  });

  const payload = { name: "Manual" };
  await namespace.validate("action", payload, { useGPT: false });

  assert.ok(capturedOptions);
  assert.equal(capturedOptions?.gptClient, undefined);
});

test("canUseDeveloperTools returns true for GM users", () => {
  const previousGame = (globalThis as { game?: Game }).game;
  (globalThis as { game?: Game }).game = {
    user: { isGM: true } as unknown as Game["user"],
    settings: {
      get: () => false,
    } as unknown as Game["settings"],
    modules: new Map(),
  } as unknown as Game;

  try {
    assert.equal(canUseDeveloperTools(), true);
  } finally {
    if (previousGame) {
      (globalThis as { game?: Game }).game = previousGame;
    } else {
      delete (globalThis as { game?: Game }).game;
    }
  }
});

test("canUseDeveloperTools detects active developer modules", () => {
  const previousGame = (globalThis as { game?: Game }).game;
  (globalThis as { game?: Game }).game = {
    user: { isGM: false } as unknown as Game["user"],
    settings: {
      get: () => false,
    } as unknown as Game["settings"],
    modules: {
      get: (id: string) => (id === "developer-mode" ? { active: true } : undefined),
    } as unknown as Game["modules"],
  } as unknown as Game;

  try {
    assert.equal(canUseDeveloperTools(), true);
  } finally {
    if (previousGame) {
      (globalThis as { game?: Game }).game = previousGame;
    } else {
      delete (globalThis as { game?: Game }).game;
    }
  }
});

test("canUseDeveloperTools returns false when no access is granted", () => {
  const previousGame = (globalThis as { game?: Game }).game;
  (globalThis as { game?: Game }).game = {
    user: { isGM: false } as unknown as Game["user"],
    settings: {
      get: () => false,
    } as unknown as Game["settings"],
    modules: {
      get: () => undefined,
    } as unknown as Game["modules"],
  } as unknown as Game;

  try {
    assert.equal(canUseDeveloperTools(), false);
  } finally {
    if (previousGame) {
      (globalThis as { game?: Game }).game = previousGame;
    } else {
      delete (globalThis as { game?: Game }).game;
    }
  }
});

