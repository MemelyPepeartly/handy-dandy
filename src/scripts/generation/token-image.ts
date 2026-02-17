import type { GenerateImageOptions, GeneratedImageResult } from "../gpt/client";

export interface TokenImageGenerator {
  generateImage: (prompt: string, options?: GenerateImageOptions) => Promise<GeneratedImageResult>;
}

export interface GenerateTokenImageOptions {
  actorName: string;
  actorSlug: string;
  actorDescription?: string | null;
  customPrompt?: string | null;
  imageCategory?: "actor" | "item";
}

const GENERATED_IMAGE_ROOT = "handy-dandy/generated-images";
const IMAGE_CATEGORY_DIRECTORY: Record<NonNullable<GenerateTokenImageOptions["imageCategory"]>, string> = {
  actor: "Actor",
  item: "Item",
};

function sanitizeFilename(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "generated-token";
}

function buildUniqueFilename(base: string): string {
  const safeBase = sanitizeFilename(base);
  const suffix = Date.now().toString(36);
  const maxBaseLength = Math.max(1, 63 - suffix.length);
  const truncatedBase = safeBase.slice(0, maxBaseLength);
  return `${truncatedBase}-${suffix}`;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    array[index] = bytes.charCodeAt(index);
  }
  return new Blob([array], { type: mimeType });
}

function isAlreadyExistsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("eexist") || message.includes("already exists");
}

async function ensureDataDirectory(path: string): Promise<void> {
  const picker = (globalThis as { FilePicker?: unknown }).FilePicker as {
    createDirectory?: (
      source: string,
      target: string,
      options?: Record<string, unknown>,
    ) => Promise<unknown>;
  };

  if (typeof picker.createDirectory !== "function") {
    return;
  }

  const segments = path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    try {
      await picker.createDirectory("data", current, { notify: false });
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }
  }
}

async function ensureGeneratedImageDirectories(): Promise<void> {
  await ensureDataDirectory(`${GENERATED_IMAGE_ROOT}/${IMAGE_CATEGORY_DIRECTORY.actor}`);
  await ensureDataDirectory(`${GENERATED_IMAGE_ROOT}/${IMAGE_CATEGORY_DIRECTORY.item}`);
}

async function uploadImage(
  image: GeneratedImageResult,
  fileName: string,
  targetDir: string,
): Promise<string | null> {
  const picker = (globalThis as { FilePicker?: unknown }).FilePicker as {
    upload?: (
      source: string,
      target: string,
      file: File,
      body?: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<{ path?: string; files?: string[] }>;
  };

  if (typeof picker.upload !== "function") {
    return null;
  }

  await ensureGeneratedImageDirectories();

  const blob = base64ToBlob(image.base64, image.mimeType);
  const extension = image.mimeType === "image/webp" ? "webp" : "png";
  const file = new File([blob], `${fileName}.${extension}`, {
    type: image.mimeType,
  });

  const uploaded = await picker.upload("data", targetDir, file, {}, { notify: false });
  if (typeof uploaded?.path === "string" && uploaded.path) {
    return uploaded.path;
  }

  if (Array.isArray(uploaded?.files) && typeof uploaded.files[0] === "string") {
    return uploaded.files[0];
  }

  return null;
}

function buildTokenPrompt(options: GenerateTokenImageOptions): string {
  const parts: string[] = [
    `Create a Pathfinder-style monster token portrait for "${options.actorName}".`,
    "Transparent background only.",
    "Single creature subject, centered, fully visible, and facing camera or three-quarters.",
    "No text, no labels, no border, no frame, no watermark.",
    "Render as production-ready virtual tabletop token art with clean silhouette edges.",
  ];

  const description = options.actorDescription?.trim();
  if (description) {
    parts.push(`Creature details: ${description}`);
  }

  const custom = options.customPrompt?.trim();
  if (custom) {
    parts.push(`Additional direction: ${custom}`);
  }

  return parts.join("\n");
}

export async function generateTransparentTokenImage(
  generator: TokenImageGenerator,
  options: GenerateTokenImageOptions,
): Promise<string> {
  const prompt = buildTokenPrompt(options);
  const image = await generator.generateImage(prompt, {
    background: "transparent",
    size: "1024x1024",
    format: "png",
    quality: "high",
  });

  const fileName = buildUniqueFilename(`${options.actorSlug || options.actorName}-token`);
  const category = options.imageCategory ?? "actor";
  const categoryDir = IMAGE_CATEGORY_DIRECTORY[category] ?? IMAGE_CATEGORY_DIRECTORY.actor;
  const targetDir = `${GENERATED_IMAGE_ROOT}/${categoryDir}`;

  try {
    const uploadedPath = await uploadImage(image, fileName, targetDir);
    if (uploadedPath) {
      return uploadedPath;
    }
  } catch (error) {
    console.warn("Handy Dandy | Could not upload generated image, using inline data URI fallback.", error);
  }

  return `data:${image.mimeType};base64,${image.base64}`;
}
