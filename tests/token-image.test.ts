import assert from "node:assert/strict";
import { test } from "node:test";
import { generateItemImage, generateTransparentTokenImage } from "../src/scripts/generation/token-image";

const SAMPLE_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

test("generateTransparentTokenImage uploads actor images into the actors directory", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  const priorGame = (globalThis as { game?: unknown }).game;
  const createdDirectories: string[] = [];
  const createdSources: string[] = [];
  let uploadSource = "";
  let uploadTarget = "";

  (globalThis as { game?: unknown }).game = undefined;
  (globalThis as { FilePicker?: unknown }).FilePicker = {
    createDirectory: async (source: string, target: string) => {
      createdSources.push(source);
      createdDirectories.push(target);
    },
    upload: async (source: string, target: string, file: File) => {
      uploadSource = source;
      uploadTarget = target;
      return { path: `${target}/${file.name}` };
    },
  };

  try {
    const result = await generateTransparentTokenImage(
      {
        generateImage: async () => ({ base64: SAMPLE_BASE64, mimeType: "image/png" }),
      },
      {
        actorName: "Clockwork Wasp",
        actorSlug: "clockwork-wasp",
        imageCategory: "actor",
      },
    );

    assert.ok(createdSources.every((source) => source === "data"));
    assert.equal(uploadSource, "data");
    assert.match(uploadTarget, /^assets\/handy-dandy\/actors\/clockwork-wasp\/.+$/);
    assert.ok(createdDirectories.includes("assets"));
    assert.ok(createdDirectories.includes("assets/handy-dandy"));
    assert.ok(createdDirectories.includes("assets/handy-dandy/actors"));
    assert.ok(createdDirectories.includes("assets/handy-dandy/actors/clockwork-wasp"));
    assert.ok(createdDirectories.some((entry) => /^assets\/handy-dandy\/actors\/clockwork-wasp\/.+$/.test(entry)));
    assert.ok(result.startsWith("assets/handy-dandy/actors/"));
    assert.ok(result.endsWith(".png"));
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
    (globalThis as { game?: unknown }).game = priorGame;
  }
});

test("generateTransparentTokenImage uploads item images into the items directory", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  const priorGame = (globalThis as { game?: unknown }).game;
  let uploadSource = "";
  let uploadTarget = "";

  (globalThis as { game?: unknown }).game = undefined;
  (globalThis as { FilePicker?: unknown }).FilePicker = {
    createDirectory: async () => {
      /* no-op */
    },
    upload: async (source: string, target: string, file: File) => {
      uploadSource = source;
      uploadTarget = target;
      return { path: `${target}/${file.name}` };
    },
  };

  try {
    await generateTransparentTokenImage(
      {
        generateImage: async () => ({ base64: SAMPLE_BASE64, mimeType: "image/png" }),
      },
      {
        actorName: "Clockwork Lens",
        actorSlug: "clockwork-lens",
        imageCategory: "item",
      },
    );

    assert.equal(uploadSource, "data");
    assert.match(uploadTarget, /^assets\/handy-dandy\/items\/clockwork-lens\/.+$/);
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
    (globalThis as { game?: unknown }).game = priorGame;
  }
});

test("generateTransparentTokenImage falls back to a data URI when upload fails", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  const priorWarn = console.warn;

  (globalThis as { FilePicker?: unknown }).FilePicker = {
    createDirectory: async () => {
      /* no-op */
    },
    upload: async () => {
      throw new Error("upload failed");
    },
  };
  console.warn = () => undefined;

  try {
    const result = await generateTransparentTokenImage(
      {
        generateImage: async () => ({ base64: SAMPLE_BASE64, mimeType: "image/png" }),
      },
      {
        actorName: "Fallback Test",
        actorSlug: "fallback-test",
        imageCategory: "actor",
      },
    );

    assert.equal(result, `data:image/png;base64,${SAMPLE_BASE64}`);
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
    console.warn = priorWarn;
  }
});

test("generateItemImage stores generated item art in the items directory", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  const priorGame = (globalThis as { game?: unknown }).game;
  let uploadSource = "";
  let uploadTarget = "";

  (globalThis as { game?: unknown }).game = undefined;
  (globalThis as { FilePicker?: unknown }).FilePicker = {
    createDirectory: async () => {
      /* no-op */
    },
    upload: async (source: string, target: string, file: File) => {
      uploadSource = source;
      uploadTarget = target;
      return { path: `${target}/${file.name}` };
    },
  };

  try {
    const result = await generateItemImage(
      {
        generateImage: async () => ({ base64: SAMPLE_BASE64, mimeType: "image/png" }),
      },
      {
        itemName: "Clockwork Key",
        itemSlug: "clockwork-key",
      },
    );

    assert.equal(uploadSource, "data");
    assert.match(uploadTarget, /^assets\/handy-dandy\/items\/clockwork-key\/.+$/);
    assert.ok(result.startsWith("assets/handy-dandy/items/"));
    assert.ok(result.endsWith(".png"));
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
    (globalThis as { game?: unknown }).game = priorGame;
  }
});

test("generateTransparentTokenImage supports prompt override and reference images", async () => {
  const referenceImage = new File([Buffer.from("ref")], "ref.png", { type: "image/png" });
  let capturedPrompt = "";
  let capturedOptions: unknown;

  await generateTransparentTokenImage(
    {
      generateImage: async (prompt, options) => {
        capturedPrompt = prompt;
        capturedOptions = options;
        return { base64: SAMPLE_BASE64, mimeType: "image/png" };
      },
    },
    {
      actorName: "Prompt Override Test",
      actorSlug: "prompt-override-test",
      promptOverride: "Custom portrait prompt",
      referenceImage,
    },
  );

  assert.equal(capturedPrompt, "Custom portrait prompt");
  assert.equal((capturedOptions as { referenceImages?: File[] }).referenceImages?.length, 1);
  assert.equal(
    (capturedOptions as { referenceImages?: File[] }).referenceImages?.[0],
    referenceImage,
  );
});

test("generateTransparentTokenImage stores each regeneration at a unique path", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  const priorGame = (globalThis as { game?: unknown }).game;
  const priorNow = Date.now;
  const priorRandom = Math.random;

  Date.now = () => 1_700_000_000_000;
  Math.random = () => 0;

  (globalThis as { game?: unknown }).game = undefined;
  (globalThis as { FilePicker?: unknown }).FilePicker = {
    createDirectory: async () => {
      /* no-op */
    },
    upload: async (_source: string, target: string, file: File) => ({ path: `${target}/${file.name}` }),
  };

  try {
    const first = await generateTransparentTokenImage(
      {
        generateImage: async () => ({ base64: SAMPLE_BASE64, mimeType: "image/png" }),
      },
      {
        actorName: "Collision Test",
        actorSlug: "collision-test",
        imageCategory: "actor",
      },
    );

    const second = await generateTransparentTokenImage(
      {
        generateImage: async () => ({ base64: SAMPLE_BASE64, mimeType: "image/png" }),
      },
      {
        actorName: "Collision Test",
        actorSlug: "collision-test",
        imageCategory: "actor",
      },
    );

    assert.notEqual(first, second);
    assert.notEqual(
      first.split("/").slice(0, -1).join("/"),
      second.split("/").slice(0, -1).join("/"),
    );
    assert.ok(first.startsWith("assets/handy-dandy/actors/"));
    assert.ok(second.startsWith("assets/handy-dandy/actors/"));
  } finally {
    Date.now = priorNow;
    Math.random = priorRandom;
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
    (globalThis as { game?: unknown }).game = priorGame;
  }
});

test("generateTransparentTokenImage respects configured generated image directory setting", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  const priorGame = (globalThis as { game?: unknown }).game;
  let uploadTarget = "";

  (globalThis as { game?: unknown }).game = {
    settings: {
      get: (_moduleId: string, key: string) =>
        key === "GeneratedImageDirectory" ? "Data/assets/my-custom-images" : undefined,
    },
  };
  (globalThis as { FilePicker?: unknown }).FilePicker = {
    createDirectory: async () => {
      /* no-op */
    },
    upload: async (_source: string, target: string, file: File) => {
      uploadTarget = target;
      return { path: `${target}/${file.name}` };
    },
  };

  try {
    const result = await generateTransparentTokenImage(
      {
        generateImage: async () => ({ base64: SAMPLE_BASE64, mimeType: "image/png" }),
      },
      {
        actorName: "Configured Root Test",
        actorSlug: "configured-root-test",
        imageCategory: "actor",
      },
    );

    assert.match(uploadTarget, /^assets\/my-custom-images\/actors\/configured-root-test\/.+$/);
    assert.ok(result.startsWith("assets/my-custom-images/actors/configured-root-test/"));
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
    (globalThis as { game?: unknown }).game = priorGame;
  }
});
