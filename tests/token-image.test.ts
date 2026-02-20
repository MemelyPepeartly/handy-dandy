import assert from "node:assert/strict";
import { test } from "node:test";
import { generateItemImage, generateTransparentTokenImage } from "../src/scripts/generation/token-image";

const SAMPLE_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

test("generateTransparentTokenImage uploads actor images into the actor slug directory", async () => {
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
    browse: async () => ({ files: [] }),
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
    assert.equal(uploadTarget, "assets/handy-dandy/actors/clockwork-wasp");
    assert.ok(createdDirectories.includes("assets"));
    assert.ok(createdDirectories.includes("assets/handy-dandy"));
    assert.ok(createdDirectories.includes("assets/handy-dandy/actors"));
    assert.ok(createdDirectories.includes("assets/handy-dandy/actors/clockwork-wasp"));
    assert.ok(result.startsWith("assets/handy-dandy/actors/clockwork-wasp/clockwork-wasp-"));
    assert.ok(result.endsWith(".png"));
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
    (globalThis as { game?: unknown }).game = priorGame;
  }
});

test("generateTransparentTokenImage uploads item images into the item slug directory", async () => {
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
    browse: async () => ({ files: [] }),
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
    assert.equal(uploadTarget, "assets/handy-dandy/items/clockwork-lens");
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
    browse: async () => ({ files: [] }),
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

test("generateItemImage stores generated item art in the item slug directory", async () => {
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
    browse: async () => ({ files: [] }),
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
    assert.equal(uploadTarget, "assets/handy-dandy/items/clockwork-key");
    assert.ok(result.startsWith("assets/handy-dandy/items/clockwork-key/clockwork-key-"));
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

test("generateTransparentTokenImage stores repeated regenerations in one slug directory with incrementing image names", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  const priorGame = (globalThis as { game?: unknown }).game;
  const filesByDirectory = new Map<string, string[]>();

  (globalThis as { game?: unknown }).game = undefined;
  (globalThis as { FilePicker?: unknown }).FilePicker = {
    createDirectory: async () => {
      /* no-op */
    },
    browse: async (_source: string, target: string) => ({
      files: (filesByDirectory.get(target) ?? []).map((name) => `${target}/${name}`),
    }),
    upload: async (_source: string, target: string, file: File) => {
      const existing = filesByDirectory.get(target) ?? [];
      existing.push(file.name);
      filesByDirectory.set(target, existing);
      return { path: `${target}/${file.name}` };
    },
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
    assert.equal(
      first.split("/").slice(0, -1).join("/"),
      second.split("/").slice(0, -1).join("/"),
    );
    assert.match(first, /\/collision-test-1\.png$/);
    assert.match(second, /\/collision-test-2\.png$/);
    assert.ok(first.startsWith("assets/handy-dandy/actors/collision-test/"));
    assert.ok(second.startsWith("assets/handy-dandy/actors/collision-test/"));
  } finally {
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
    browse: async () => ({ files: [] }),
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

    assert.equal(uploadTarget, "assets/my-custom-images/actors/configured-root-test");
    assert.ok(result.startsWith("assets/my-custom-images/actors/configured-root-test/configured-root-test-"));
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
    (globalThis as { game?: unknown }).game = priorGame;
  }
});

test("generateTransparentTokenImage strips world-relative path prefixes from configured directory", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  const priorGame = (globalThis as { game?: unknown }).game;
  let uploadTarget = "";

  (globalThis as { game?: unknown }).game = {
    settings: {
      get: (_moduleId: string, key: string) =>
        key === "GeneratedImageDirectory" ? "worlds/my-world/assets/handy-dandy" : undefined,
    },
  };
  (globalThis as { FilePicker?: unknown }).FilePicker = {
    createDirectory: async () => {
      /* no-op */
    },
    browse: async () => ({ files: [] }),
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
        actorName: "World Prefix Test",
        actorSlug: "world-prefix-test",
        imageCategory: "actor",
      },
    );

    assert.equal(uploadTarget, "assets/handy-dandy/actors/world-prefix-test");
    assert.ok(result.startsWith("assets/handy-dandy/actors/world-prefix-test/world-prefix-test-"));
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
    (globalThis as { game?: unknown }).game = priorGame;
  }
});

test("generateTransparentTokenImage prefers Foundry namespaced FilePicker implementation", async () => {
  const priorFoundry = (globalThis as { foundry?: unknown }).foundry;
  const priorGlobalPickerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "FilePicker");
  let uploadTarget = "";

  Object.defineProperty(globalThis, "FilePicker", {
    configurable: true,
    get: () => {
      throw new Error("legacy global FilePicker accessed");
    },
  });

  (globalThis as { foundry?: unknown }).foundry = {
    applications: {
      apps: {
        FilePicker: {
          implementation: {
            createDirectory: async () => {
              /* no-op */
            },
            browse: async () => ({ files: [] }),
            upload: async (_source: string, target: string, file: File) => {
              uploadTarget = target;
              return { path: `${target}/${file.name}` };
            },
          },
        },
      },
    },
  };

  try {
    const result = await generateTransparentTokenImage(
      {
        generateImage: async () => ({ base64: SAMPLE_BASE64, mimeType: "image/png" }),
      },
      {
        actorName: "Namespaced Picker",
        actorSlug: "namespaced-picker",
        imageCategory: "actor",
      },
    );

    assert.equal(uploadTarget, "assets/handy-dandy/actors/namespaced-picker");
    assert.ok(result.startsWith("assets/handy-dandy/actors/namespaced-picker/namespaced-picker-"));
  } finally {
    (globalThis as { foundry?: unknown }).foundry = priorFoundry;
    if (priorGlobalPickerDescriptor) {
      Object.defineProperty(globalThis, "FilePicker", priorGlobalPickerDescriptor);
    } else {
      delete (globalThis as { FilePicker?: unknown }).FilePicker;
    }
  }
});
