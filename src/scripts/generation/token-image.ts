import type { GenerateImageOptions, GeneratedImageResult } from "../openrouter/client";
import { CONSTANTS } from "../constants";

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
  existingImagePath?: string | null;
}

export interface GenerateItemImageOptions {
  itemName: string;
  itemSlug: string;
  itemDescription?: string | null;
  customPrompt?: string | null;
  promptOverride?: string | null;
  referenceImage?: File | null;
  existingImagePath?: string | null;
}

// Use FilePicker's "data" source (Foundry user-data root) and write into assets/<configured-dir>/...
// so generated files land under Data/assets/... without requiring users to type "Data/" in settings.
const GENERATED_IMAGE_SOURCE = "data" as const;
const GENERATED_IMAGE_DATA_ROOT = "assets" as const;
const DEFAULT_GENERATED_IMAGE_ROOT = "handy-dandy" as const;
const IMAGE_CATEGORY_DIRECTORY: Record<NonNullable<GenerateTokenImageOptions["imageCategory"]>, string> = {
  actor: "actors",
  item: "items",
};

interface FilePickerImplementation {
  createDirectory?: (
    source: string,
    target: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  upload?: (
    source: string,
    target: string,
    file: File,
    body?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Promise<{ path?: string; files?: string[] }>;
  browse?: (
    source: string,
    target: string,
    options?: Record<string, unknown>,
  ) => Promise<{ files?: string[] }>;
}

function getFilePickerImplementation(): FilePickerImplementation | undefined {
  const namespacedImplementation = (globalThis as {
    foundry?: {
      applications?: {
        apps?: {
          FilePicker?: {
            implementation?: unknown;
          };
        };
      };
    };
  }).foundry?.applications?.apps?.FilePicker?.implementation as FilePickerImplementation | undefined;

  if (namespacedImplementation) {
    return namespacedImplementation;
  }

  // Fallback for older Foundry versions that still expose a global FilePicker.
  if ("FilePicker" in globalThis) {
    return (globalThis as { FilePicker?: unknown }).FilePicker as FilePickerImplementation | undefined;
  }

  return undefined;
}

function sanitizeFilename(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "generated-token";
}

function stripPathQueryAndHash(value: string): string {
  return value.split(/[?#]/, 1)[0] ?? value;
}

function extractFileName(path: string): string {
  const withoutQuery = stripPathQueryAndHash(path);
  return withoutQuery.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseImageSequenceNumber(fileName: string, prefix: string): number | null {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)\\.[a-z0-9]+$`, "i");
  const match = pattern.exec(fileName);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function uniqueNumericSuffix(): number {
  // Keep fallback names unique even when directory listing is unavailable.
  return (Date.now() * 1000) + Math.floor(Math.random() * 1000);
}

function normalizeComparablePath(path: string): string {
  const normalized = normalizeUploadedPath(path).replace(/\\/g, "/").replace(/^\/+/, "");
  return stripPathQueryAndHash(normalized).toLowerCase();
}

async function verifyUploadedImagePath(uploadedPath: string, targetDir: string): Promise<boolean | undefined> {
  const picker = getFilePickerImplementation();
  if (!picker || typeof picker.browse !== "function") {
    return undefined;
  }

  try {
    const result = await picker.browse(GENERATED_IMAGE_SOURCE, targetDir);
    const files = Array.isArray(result?.files) ? result.files : [];
    if (files.length === 0) {
      return undefined;
    }
    const normalizedUploaded = normalizeComparablePath(uploadedPath);
    const uploadedFileName = extractFileName(normalizedUploaded);

    return files.some((entry) => {
      if (typeof entry !== "string") return false;
      const normalizedEntry = normalizeComparablePath(entry);
      if (normalizedEntry === normalizedUploaded) return true;
      return extractFileName(normalizedEntry) === uploadedFileName;
    });
  } catch (error) {
    console.warn(
      `${CONSTANTS.MODULE_NAME} | Could not verify generated image upload in "${targetDir}".`,
      error,
    );
    return undefined;
  }
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
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed) return trimmed;
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }

  let normalized = trimmed.replace(/^\/+/, "");
  normalized = normalized.replace(/^data\/+/i, "");
  if (normalized.toLowerCase().startsWith(`${GENERATED_IMAGE_DATA_ROOT}/`)) {
    return normalized;
  }
  if (normalized.toLowerCase().startsWith(`${GENERATED_IMAGE_SOURCE}/`)) {
    return normalized.replace(/^data\//i, `${GENERATED_IMAGE_DATA_ROOT}/`);
  }

  return `${GENERATED_IMAGE_DATA_ROOT}/${normalized}`;
}

function normalizeDirectorySetting(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_GENERATED_IMAGE_ROOT;
  }

  let normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^data\/+/i, "")
    .replace(/^assets\/+/i, "")
    .replace(/^worlds\/[^/]+\/+/i, "")
    .replace(/\/+$/, "");

  const assetsIndex = normalized.toLowerCase().lastIndexOf("assets/");
  if (assetsIndex >= 0) {
    normalized = normalized.slice(assetsIndex + "assets/".length);
  }

  return normalized || DEFAULT_GENERATED_IMAGE_ROOT;
}

function resolveImageNamePrefix(
  category: NonNullable<GenerateTokenImageOptions["imageCategory"]>,
  fileNameBase: string,
): string {
  const normalized = sanitizeFilename(fileNameBase).replace(/-(token|item)$/i, "");
  if (normalized.length > 0) {
    return normalized;
  }

  return category === "actor" ? "token" : "item";
}

function getConfiguredImageRoot(): string {
  const globalGame = (globalThis as {
    game?: {
      settings?: {
        get?: (moduleId: string, key: string) => unknown;
      };
    };
  }).game;

  const getSetting = globalGame?.settings?.get;
  if (typeof getSetting !== "function") {
    return DEFAULT_GENERATED_IMAGE_ROOT;
  }

  try {
    const configured = getSetting(CONSTANTS.MODULE_ID, "GeneratedImageDirectory");
    return normalizeDirectorySetting(configured);
  } catch (_error) {
    return DEFAULT_GENERATED_IMAGE_ROOT;
  }
}

async function ensureDataDirectory(path: string): Promise<void> {
  const picker = getFilePickerImplementation();

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
  const picker = getFilePickerImplementation();

  if (!picker || typeof picker.upload !== "function") {
    return null;
  }

  await ensureDataDirectory(targetDir);

  const blob = base64ToBlob(image.base64, image.mimeType);
  const extension = image.mimeType === "image/webp" ? "webp" : "png";
  const file = new File([blob], `${fileName}.${extension}`, {
    type: image.mimeType,
  });

  const uploaded = await picker.upload(
    GENERATED_IMAGE_SOURCE,
    targetDir,
    file,
    { overwrite: false },
    { notify: false },
  );
  if (typeof uploaded?.path === "string" && uploaded.path) {
    const normalizedPath = normalizeUploadedPath(uploaded.path);
    const verified = await verifyUploadedImagePath(normalizedPath, targetDir);
    if (verified === true) {
      console.info(`${CONSTANTS.MODULE_NAME} | Generated image stored: ${normalizedPath}`);
    } else if (verified === false) {
      console.warn(
        `${CONSTANTS.MODULE_NAME} | Generated image upload returned a path but verification failed: ${normalizedPath}`,
      );
    } else {
      console.info(
        `${CONSTANTS.MODULE_NAME} | Generated image upload returned path (verification unavailable): ${normalizedPath}`,
      );
    }
    return normalizedPath;
  }

  if (Array.isArray(uploaded?.files) && typeof uploaded.files[0] === "string") {
    const normalizedPath = normalizeUploadedPath(uploaded.files[0]);
    const verified = await verifyUploadedImagePath(normalizedPath, targetDir);
    if (verified === true) {
      console.info(`${CONSTANTS.MODULE_NAME} | Generated image stored: ${normalizedPath}`);
    } else if (verified === false) {
      console.warn(
        `${CONSTANTS.MODULE_NAME} | Generated image upload returned a file list path but verification failed: ${normalizedPath}`,
      );
    } else {
      console.info(
        `${CONSTANTS.MODULE_NAME} | Generated image upload returned file list path (verification unavailable): ${normalizedPath}`,
      );
    }
    return normalizedPath;
  }

  console.warn(`${CONSTANTS.MODULE_NAME} | Generated image upload returned no file path.`);
  return null;
}

async function resolveNextImageIndex(targetDir: string, fileNamePrefix: string): Promise<number> {
  const picker = getFilePickerImplementation();

  if (!picker || typeof picker.browse !== "function") {
    return 1;
  }

  try {
    const result = await picker.browse(GENERATED_IMAGE_SOURCE, targetDir);
    const files = Array.isArray(result?.files) ? result.files : [];

    let max = 0;
    for (const entry of files) {
      if (typeof entry !== "string") continue;
      const sequence = parseImageSequenceNumber(extractFileName(entry), fileNamePrefix);
      if (typeof sequence === "number" && sequence > max) {
        max = sequence;
      }
    }

    return max + 1;
  } catch (_error) {
    return uniqueNumericSuffix();
  }
}

function resolveExistingImageIndex(
  existingImagePath: string | null | undefined,
  targetDir: string,
  fileNamePrefix: string,
): number | null {
  if (!existingImagePath || typeof existingImagePath !== "string") {
    return null;
  }

  const normalizedExisting = normalizeComparablePath(existingImagePath);
  const normalizedTargetDir = normalizeComparablePath(targetDir);
  if (!normalizedExisting.startsWith(`${normalizedTargetDir}/`)) {
    return null;
  }

  const existingFileName = extractFileName(normalizedExisting);
  return parseImageSequenceNumber(existingFileName, fileNamePrefix);
}

function buildGenerationTargetDir(
  category: NonNullable<GenerateTokenImageOptions["imageCategory"]>,
  fileNameBase: string,
): string {
  const rootDirectory = getConfiguredImageRoot();
  const categoryDir = IMAGE_CATEGORY_DIRECTORY[category] ?? IMAGE_CATEGORY_DIRECTORY.actor;
  const entityDir = sanitizeFilename(fileNameBase).replace(/-(token|item)$/i, "") || "generated";
  return `${GENERATED_IMAGE_DATA_ROOT}/${rootDirectory}/${categoryDir}/${entityDir}`;
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

export function buildItemImagePrompt(options: GenerateItemImageOptions): string {
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
  existingImagePath?: string | null,
): Promise<string> {
  const targetDir = buildGenerationTargetDir(category, fileNameBase);
  const fileNamePrefix = resolveImageNamePrefix(category, fileNameBase);

  try {
    let nextIndex = await resolveNextImageIndex(targetDir, fileNamePrefix);
    const existingIndex = resolveExistingImageIndex(existingImagePath, targetDir, fileNamePrefix);
    if (typeof existingIndex === "number") {
      nextIndex = Math.max(nextIndex, existingIndex + 1);
    }
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const fileName = `${fileNamePrefix}-${nextIndex}`;
      try {
        const uploadedPath = await uploadImage(image, fileName, targetDir);
        if (uploadedPath) {
          return uploadedPath;
        }
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          nextIndex += 1;
          continue;
        }
        throw error;
      }
      nextIndex += 1;
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
    options.existingImagePath,
  );
}

export async function generateItemImage(
  generator: TokenImageGenerator,
  options: GenerateItemImageOptions,
): Promise<string> {
  const prompt = options.promptOverride?.trim() || buildItemImagePrompt(options);
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
    `${options.itemSlug || options.itemName}-item`,
    "item",
    options.existingImagePath,
  );
}
