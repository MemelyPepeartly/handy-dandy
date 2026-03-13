export async function renderApplicationTemplate<TData extends object>(
  path: string,
  data?: TData,
): Promise<string> {
  const renderer = (foundry.applications as typeof foundry.applications & {
    handlebars: {
      renderTemplate: (templatePath: string, context?: TData) => Promise<string>;
    };
  }).handlebars.renderTemplate;

  return await renderer(path, data);
}

