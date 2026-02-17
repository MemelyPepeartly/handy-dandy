import assert from "node:assert/strict";
import { test } from "node:test";
import { generateItemImage, generateTransparentTokenImage } from "../src/scripts/generation/token-image";

const SAMPLE_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

test("generateTransparentTokenImage uploads actor images into the Actor directory", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  const createdDirectories: string[] = [];
  let uploadTarget = "";

  (globalThis as { FilePicker?: unknown }).FilePicker = {
    createDirectory: async (_source: string, target: string) => {
      createdDirectories.push(target);
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
        actorName: "Clockwork Wasp",
        actorSlug: "clockwork-wasp",
        imageCategory: "actor",
      },
    );

    assert.equal(uploadTarget, "handy-dandy/generated-images/Actor");
    assert.ok(createdDirectories.includes("handy-dandy/generated-images/Actor"));
    assert.ok(result.startsWith("handy-dandy/generated-images/Actor/"));
    assert.ok(result.endsWith(".png"));
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
  }
});

test("generateTransparentTokenImage uploads item images into the Item directory", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  let uploadTarget = "";

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

    assert.equal(uploadTarget, "handy-dandy/generated-images/Item");
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

test("generateItemImage stores generated item art in the Item directory", async () => {
  const priorPicker = (globalThis as { FilePicker?: unknown }).FilePicker;
  let uploadTarget = "";

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
    const result = await generateItemImage(
      {
        generateImage: async () => ({ base64: SAMPLE_BASE64, mimeType: "image/png" }),
      },
      {
        itemName: "Clockwork Key",
        itemSlug: "clockwork-key",
      },
    );

    assert.equal(uploadTarget, "handy-dandy/generated-images/Item");
    assert.ok(result.startsWith("handy-dandy/generated-images/Item/"));
    assert.ok(result.endsWith(".png"));
  } finally {
    (globalThis as { FilePicker?: unknown }).FilePicker = priorPicker;
  }
});
