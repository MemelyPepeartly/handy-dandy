import { processAIInput } from "./ai-helper.js";

// jQuery(function() {
//     const button = document.getElementById("generateButton");
//     const form = document.getElementById("handy-dandy-form");
//     if (button && form) {
//         button.addEventListener('click', (e) => {
//             console.log("Button clicked!");
//             const serializedData = $(form).serialize();
//             processAIInput(serializedData);
//         });
//     }
//   });

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