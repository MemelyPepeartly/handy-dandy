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
  dialog: foundry.applications.api.DialogV2;
  close: () => Promise<void>;
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

export async function waitForDialog<TResult>(
  options: WaitForDialogOptions<TResult>,
): Promise<TResult | null> {
  const closeResult = options.closeResult ?? null;
  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: options.title,
      resizable: Boolean(options.resizable),
    } as never,
    position: typeof options.width === "number" ? { width: options.width } : undefined,
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
  const dialog = new foundry.applications.api.DialogV2({
    window: {
      title: options.title,
      resizable: Boolean(options.resizable),
    } as never,
    position: typeof options.width === "number" ? { width: options.width } : undefined,
    content: options.content,
    buttons: [],
  });

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

