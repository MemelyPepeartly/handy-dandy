import assert from "node:assert/strict";
import { test } from "node:test";
import { generateItemImage, generateTransparentTokenImage } from "../src/scripts/generation/token-image";

const SAMPLE_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

test("generateTransparentTokenImage uploads actor images into the actors directory", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  const createdDirectories: string[] = [];
  const createdSources: string[] = [];
  let uploadSource = "";
  let uploadTarget = "";

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

    assert.ok(createdSources.every((source) => source === "assets"));
    assert.equal(uploadSource, "assets");
    assert.equal(uploadTarget, "handy-dandy/generated-images/actors");
    assert.ok(createdDirectories.includes("handy-dandy/generated-images/actors"));
    assert.ok(result.startsWith("assets/handy-dandy/generated-images/actors/"));
    assert.ok(result.endsWith(".png"));
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
  }
});

test("generateTransparentTokenImage uploads item images into the items directory", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  let uploadSource = "";
  let uploadTarget = "";

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

    assert.equal(uploadSource, "assets");
    assert.equal(uploadTarget, "handy-dandy/generated-images/items");
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
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
  let uploadSource = "";
  let uploadTarget = "";

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

    assert.equal(uploadSource, "assets");
    assert.equal(uploadTarget, "handy-dandy/generated-images/items");
    assert.ok(result.startsWith("assets/handy-dandy/generated-images/items/"));
    assert.ok(result.endsWith(".png"));
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
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
