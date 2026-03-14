export interface DialogContext {
  root: HTMLElement;
  form: HTMLFormElement | null;
  button: HTMLButtonElement | null;
  dialog: unknown;
  event?: Event;
}

export interface DialogButton<TResult> {
  action: string;
  label: string;
  icon?: string;
  default?: boolean;
  callback?: (context: DialogContext) => TResult | null | false | Promise<TResult | null | false>;
}

export interface WaitForDialogOptions<TResult> {
  title: string;
  content: string;
  width?: number;
  resizable?: boolean;
  buttons: DialogButton<TResult>[];
  render?: (root: HTMLElement) => void;
  closeResult?: TResult | null;
}

export interface OpenDialogOptions {
  title: string;
  content: string;
  width?: number;
  resizable?: boolean;
  render?: (root: HTMLElement) => void;
}

export interface OpenDialogHandle {
  root: HTMLElement;
  dialog: foundry.applications.api.ApplicationV2;
  close: () => Promise<void>;
}

type ContentWindowOptions = {
  window?: {
    title?: string;
    resizable?: boolean;
  };
  position?: {
    width?: number;
  };
  classes?: string[];
  tag?: string;
  id?: string;
  content?: string;
};

class ContentWindow extends foundry.applications.api.ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: "handy-dandy-content-window-{id}",
    classes: ["dialog"],
    tag: "div",
    window: {
      frame: true,
      positioned: true,
      minimizable: false,
      title: "",
    },
  };

  protected override _initializeApplicationOptions(options: any): any {
    const initialized = super._initializeApplicationOptions(options) as { content?: string };
    initialized.content = String(initialized.content ?? "");
    return initialized;
  }

  protected override async _renderHTML(): Promise<HTMLElement> {
    const content = document.createElement("div");
    content.className = "dialog-content standard-form";
    content.innerHTML = String((this.options as { content?: string }).content ?? "");
    return content;
  }

  protected override _replaceHTML(result: HTMLElement, element: HTMLElement): void {
    element.replaceChildren(result);
  }
}

function normalizeDialogIcon(icon: string | undefined): string | undefined {
  if (!icon) {
    return undefined;
  }

  const trimmed = icon.trim();
  if (!trimmed) {
    return undefined;
  }

  const classMatch = /class\s*=\s*"([^"]+)"/i.exec(trimmed);
  return classMatch?.[1]?.trim() || trimmed;
}

function resolveDialogRoot(value: unknown): HTMLElement {
  if (value instanceof HTMLElement) {
    return value;
  }

  if (value && typeof value === "object") {
    const candidate = value as { element?: unknown; dialog?: unknown };
    if (candidate.element instanceof HTMLElement) {
      return candidate.element;
    }
    if (candidate.dialog instanceof HTMLElement) {
      return candidate.dialog;
    }
  }

  throw new Error("DialogV2 did not provide a usable root element.");
}

function buildWindowOptions(
  title: string,
  resizable: boolean | undefined,
): NonNullable<ContentWindowOptions["window"]> {
  return typeof resizable === "boolean" ? { title, resizable } : { title };
}

function buildPositionOptions(
  width: number | undefined,
): ContentWindowOptions["position"] | undefined {
  return typeof width === "number" ? { width } : undefined;
}

export async function waitForDialog<TResult>(
  options: WaitForDialogOptions<TResult>,
): Promise<TResult | null> {
  if (options.buttons.length === 0) {
    throw new Error("waitForDialog requires at least one button.");
  }

  const closeResult = options.closeResult ?? null;
  const result = await foundry.applications.api.DialogV2.wait({
    window: buildWindowOptions(options.title, options.resizable) as never,
    ...(buildPositionOptions(options.width) ? { position: buildPositionOptions(options.width) } : {}),
    content: options.content,
    buttons: options.buttons.map((button) => ({
      action: button.action,
      label: button.label,
      icon: normalizeDialogIcon(button.icon),
      default: button.default,
      callback: async (
        event,
        target,
        dialog,
      ): Promise<TResult | null | false | undefined> => {
        const root = target.closest<HTMLElement>(".window-app, dialog")
          ?? (() => {
            try {
              return resolveDialogRoot(dialog);
            } catch {
              return target;
            }
          })();
        const form = target.form ?? root.querySelector("form");
        return await button.callback?.({
          root,
          form: form instanceof HTMLFormElement ? form : null,
          button: target,
          dialog,
          event,
        });
      },
    })),
    rejectClose: false,
    render: (_event, dialogOrRoot) => {
      options.render?.(resolveDialogRoot(dialogOrRoot));
    },
  }) as TResult | null;

  return result ?? closeResult;
}

export async function openDialog(options: OpenDialogOptions): Promise<OpenDialogHandle> {
  const dialog = new ContentWindow({
    window: buildWindowOptions(options.title, options.resizable),
    ...(buildPositionOptions(options.width) ? { position: buildPositionOptions(options.width) } : {}),
    content: options.content,
  } as never);

  await dialog.render({ force: true });
  const root = resolveDialogRoot(dialog);
  options.render?.(root);

  return {
    root,
    dialog,
    close: async () => {
      await dialog.close();
    },
  };
}

