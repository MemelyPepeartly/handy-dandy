import { CONSTANTS } from "../constants";
import { waitForDialog } from "../foundry/dialog";

export type ImageGenerationRequest = {
  prompt: string;
  referenceImage: File | null;
};

type ImageGenerationDialogOptions = {
  title: string;
  modeLabel: string;
  subjectName: string;
  defaultPrompt: string;
  intro?: string;
  promptNotes?: string;
};

function escapeHtml(value: string): string {
  const utils = foundry.utils as { escapeHTML?: (input: string) => string };
  if (typeof utils.escapeHTML === "function") {
    return utils.escapeHTML(value);
  }

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function promptImageGenerationRequest(
  options: ImageGenerationDialogOptions,
): Promise<ImageGenerationRequest | null> {
  const intro = options.intro
    ?? `Generate ${options.modeLabel.toLowerCase()} for <strong>${escapeHtml(options.subjectName)}</strong>.`;
  const promptNotes = options.promptNotes
    ?? "This is the current default prompt. Edit it only if you want to override behavior.";
  const content = `
    <form class="handy-dandy-image-generation-form" style="display:flex;flex-direction:column;gap:0.75rem;min-width:640px;">
      <p class="notes">${intro}</p>
      <div class="form-group">
        <label for="handy-dandy-reference-image">Reference Image (optional)</label>
        <input id="handy-dandy-reference-image" type="file" name="referenceImage" accept="image/png,image/jpeg,image/webp" />
        <p class="notes">Provide a reference image to guide style, colors, or composition.</p>
      </div>
      <div class="form-group">
        <label for="handy-dandy-image-prompt">Image Prompt</label>
        <textarea id="handy-dandy-image-prompt" name="prompt" rows="10">${escapeHtml(options.defaultPrompt)}</textarea>
        <p class="notes">${escapeHtml(promptNotes)}</p>
      </div>
    </form>
  `;

  return await waitForDialog<ImageGenerationRequest>({
    title: options.title || `${CONSTANTS.MODULE_NAME} | Image Generation`,
    content,
    width: 780,
    buttons: [
      {
        action: "generate",
        icon: '<i class="fas fa-wand-magic-sparkles"></i>',
        label: "Generate",
        default: true,
        callback: ({ form }) => {
          if (!(form instanceof HTMLFormElement)) {
            return null;
          }

          const formData = new FormData(form);
          const input = form.querySelector('input[name="referenceImage"]');
          const referenceImage = input instanceof HTMLInputElement
            ? input.files?.[0] ?? null
            : null;

          return {
            prompt: String(formData.get("prompt") ?? options.defaultPrompt),
            referenceImage,
          };
        },
      },
      {
        action: "cancel",
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel",
        callback: () => null,
      },
    ],
  });
}

