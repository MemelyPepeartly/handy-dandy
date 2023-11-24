import CONSTANTS from "./constants";

export const preloadTemplates = async function () {
  const templatePaths = [
    // Add paths to "modules/VariantEncumbrance/templates"
    `/${CONSTANTS.TEMPLATEPATH}/handy-dandy.hbs`,
    `/${CONSTANTS.TEMPLATEPATH}/feat-editor.hbs`,
    `/${CONSTANTS.TEMPLATEPATH}/item-editor.hbs`
  ];
  return await loadTemplates(templatePaths);
};

export async function preloadPartials() {
    var partialsWithNames = [
        { name: "prompt-partial", path: `/${CONSTANTS.TEMPLATEPATH}/prompt-partial.hbs` }
        // ... list other partials here
    ];
    
    // render the partials and register them with Handlebars
    for (let partial of partialsWithNames) {
        const partialTemplate = await renderTemplate(partial.path, {});
        Handlebars.registerPartial(partial.name, partialTemplate);
    }

}