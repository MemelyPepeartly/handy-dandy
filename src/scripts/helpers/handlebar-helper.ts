export async function registerHandlebarsHelpers() {
    // Registering Helpers
    Handlebars.registerHelper('helperName', function (value) {});

    // ... any other helpers ...
}
export async function registerHandlebarsPartials() {
    // Registering Partials
    const promptFormTemplate = await renderTemplate("modules/handy-dandy/templates/prompt-partial.hbs", {});
    Handlebars.registerPartial('promptForm', promptFormTemplate);

    // ... any other partials ...
}
export async function loadHandlebarsTemplates() {
    await loadTemplates(['modules/handy-dandy/templates/handy-dandy.hbs'])
}