export async function renderTemplateCompat<TData extends object>(
  path: string,
  data?: TData,
): Promise<string> {
  const namespacedRenderer = (globalThis as {
    foundry?: {
      applications?: {
        handlebars?: {
          renderTemplate?: (templatePath: string, context?: TData) => Promise<string>;
        };
      };
    };
  }).foundry?.applications?.handlebars?.renderTemplate;

  if (typeof namespacedRenderer === "function") {
    return namespacedRenderer(path, data);
  }

  return renderTemplate(path, (data ?? {}) as object);
}

export function getDialogV2Class(): typeof foundry.applications.api.DialogV2 | null {
  const dialogV2 = (globalThis as {
    foundry?: {
      applications?: {
        api?: {
          DialogV2?: typeof foundry.applications.api.DialogV2;
        };
      };
    };
  }).foundry?.applications?.api?.DialogV2;

  return typeof dialogV2 === "function" ? dialogV2 : null;
}
