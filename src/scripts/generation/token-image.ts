import type { GenerateImageOptions, GeneratedImageResult } from "../gpt/client";

export interface TokenImageGenerator {
  generateImage: (prompt: string, options?: GenerateImageOptions) => Promise<GeneratedImageResult>;
}

export interface GenerateTokenImageOptions {
  actorName: string;
  actorSlug: string;
  actorDescription?: string | null;
  customPrompt?: string | null;
  promptOverride?: string | null;
  referenceImage?: File | null;
  imageCategory?: "actor" | "item";
}

export interface GenerateItemImageOptions {
  itemName: string;
  itemSlug: string;
  itemDescription?: string | null;
  customPrompt?: string | null;
}

// Store generated assets in Foundry's persistent /assets root, not in module directories.
const GENERATED_IMAGE_SOURCE = "assets" as const;
const GENERATED_IMAGE_ROOT = "handy-dandy/generated-images";
const IMAGE_CATEGORY_DIRECTORY: Record<NonNullable<GenerateTokenImageOptions["imageCategory"]>, string> = {
  actor: "actors",
  item: "items",
};
const DEFAULT_GENERATED_IMAGE_NAME = "render" as const;

function sanitizeFilename(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "generated-token";
}

let imageFilenameCounter = 0;

function buildEntropySuffix(): string {
  imageFilenameCounter = (imageFilenameCounter + 1) % 46_656; // 36^3
  const timePart = Date.now().toString(36);
  const counterPart = imageFilenameCounter.toString(36).padStart(3, "0");
  const randomPart = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");

  return `${timePart}-${counterPart}-${randomPart}`;
}

function buildUniqueFilename(base: string): string {
  const safeBase = sanitizeFilename(base);
  const suffix = buildEntropySuffix();
  const maxBaseLength = Math.max(1, 48 - suffix.length);
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

function normalizeUploadedPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/, "");
  if (withoutLeadingSlash.toLowerCase().startsWith(`${GENERATED_IMAGE_SOURCE}/`)) {
    return withoutLeadingSlash;
  }

  return `${GENERATED_IMAGE_SOURCE}/${withoutLeadingSlash}`;
}

async function ensureDataDirectory(path: string): Promise<void> {
  const picker = (globalThis as { FilePicker?: unknown }).FilePicker as
    | {
    createDirectory?: (
      source: string,
      target: string,
      options?: Record<string, unknown>,
    ) => Promise<unknown>;
  }
    | undefined;

  if (!picker || typeof picker.createDirectory !== "function") {
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
      await picker.createDirectory(GENERATED_IMAGE_SOURCE, current, { notify: false });
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }
  }
}

async function uploadImage(
  image: GeneratedImageResult,
  fileName: string,
  targetDir: string,
): Promise<string | null> {
  const picker = (globalThis as { FilePicker?: unknown }).FilePicker as
    | {
    upload?: (
      source: string,
      target: string,
      file: File,
      body?: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<{ path?: string; files?: string[] }>;
  }
    | undefined;

  if (!picker || typeof picker.upload !== "function") {
    return null;
  }

  await ensureDataDirectory(targetDir);

  const blob = base64ToBlob(image.base64, image.mimeType);
  const extension = image.mimeType === "image/webp" ? "webp" : "png";
  const file = new File([blob], `${fileName}.${extension}`, {
    type: image.mimeType,
  });

  const uploaded = await picker.upload(GENERATED_IMAGE_SOURCE, targetDir, file, {}, { notify: false });
  if (typeof uploaded?.path === "string" && uploaded.path) {
    return normalizeUploadedPath(uploaded.path);
  }

  if (Array.isArray(uploaded?.files) && typeof uploaded.files[0] === "string") {
    return normalizeUploadedPath(uploaded.files[0]);
  }

  return null;
}

function buildGenerationTargetDir(
  category: NonNullable<GenerateTokenImageOptions["imageCategory"]>,
  fileNameBase: string,
): string {
  const categoryDir = IMAGE_CATEGORY_DIRECTORY[category] ?? IMAGE_CATEGORY_DIRECTORY.actor;
  const entityDir = sanitizeFilename(fileNameBase).replace(/-(token|item)$/i, "") || "generated";
  const generationDir = buildEntropySuffix();
  return `${GENERATED_IMAGE_ROOT}/${categoryDir}/${entityDir}/${generationDir}`;
}

export function buildTransparentTokenPrompt(options: GenerateTokenImageOptions): string {
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

function buildItemPrompt(options: GenerateItemImageOptions): string {
  const parts: string[] = [
    `Create Pathfinder-style item icon art for "${options.itemName}".`,
    "Transparent background only.",
    "Single centered subject with crisp silhouette and no frame.",
    "No text, no labels, no logos, no watermark.",
    "Use clean high-contrast fantasy icon styling suitable for Foundry VTT item sheets.",
  ];

  const description = options.itemDescription?.trim();
  if (description) {
    parts.push(`Item details: ${description}`);
  }

  const custom = options.customPrompt?.trim();
  if (custom) {
    parts.push(`Additional direction: ${custom}`);
  }

  return parts.join("\n");
}

async function storeGeneratedImage(
  image: GeneratedImageResult,
  fileNameBase: string,
  category: NonNullable<GenerateTokenImageOptions["imageCategory"]>,
): Promise<string> {
  const targetDir = buildGenerationTargetDir(category, fileNameBase);
  const fileName = buildUniqueFilename(DEFAULT_GENERATED_IMAGE_NAME);

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

export async function generateTransparentTokenImage(
  generator: TokenImageGenerator,
  options: GenerateTokenImageOptions,
): Promise<string> {
  const prompt = options.promptOverride?.trim() || buildTransparentTokenPrompt(options);
  const referenceImages = options.referenceImage ? [options.referenceImage] : undefined;
  const image = await generator.generateImage(prompt, {
    background: "transparent",
    size: "1024x1024",
    format: "png",
    quality: "high",
    referenceImages,
  });

  return storeGeneratedImage(
    image,
    `${options.actorSlug || options.actorName}-token`,
    options.imageCategory ?? "actor",
  );
}

export async function generateItemImage(
  generator: TokenImageGenerator,
  options: GenerateItemImageOptions,
): Promise<string> {
  const prompt = buildItemPrompt(options);
  const image = await generator.generateImage(prompt, {
    background: "transparent",
    size: "1024x1024",
    format: "png",
    quality: "high",
  });

  return storeGeneratedImage(
    image,
    `${options.itemSlug || options.itemName}-item`,
    "item",
  );
}
