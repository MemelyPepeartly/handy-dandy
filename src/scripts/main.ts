import { registerSettings } from "./module/settings";
import { addHandyDandyToolsButton, 
    addExportButtonToCompendiums, 
    addRemigrateButtonToCompendiumWindows, 
    addFindInvalidButtonToCompendiumWindows, 
    addHandyDandyButton } from "./setup";


// When initializing the module
Hooks.once('init', () => {
    console.log("Handy Dandy | Initializing...");

    registerSettings();
});

Hooks.on("getSceneControlButtons", (controls: SceneControl[]) => {
    addHandyDandyToolsButton(controls);
});

// When rendering the compendium directory
Hooks.on("renderCompendiumDirectory", (app, html, data) => {
    addExportButtonToCompendiums(html);
});

// When rendering compendium window
Hooks.on("renderCompendium", async (app, html, data) => {
    await addRemigrateButtonToCompendiumWindows(app, html, data);
    await addFindInvalidButtonToCompendiumWindows(app, html, data);
});

// When rendering an actor sheet
Hooks.on('renderActorSheet', (app, html, data) => {
    addHandyDandyButton(app, html, data);
});
  
Hooks.on("renderItemSheet", (app, html, data) => {
    const nameInput = html.find('input[name="name"]');
    const generatePromptButton = $('<button type="button" id="generatePromptButton" style="width: 50px;margin-top: auto;margin-bottom: auto;"><i class="fas fa-magic" title="Generate"></i></button>');
    nameInput.after(generatePromptButton);

    // Add click event listener to the new button
    html.find('#generatePromptButton').click(() => {
        // Logic for what happens when the button is clicked
        console.log('Generate button clicked');
    });

    // Bind event handler to the new button
    html.find('#generatePromptButton').click(function() {
        // Your generate prompt logic here
        console.log('Generate Prompt button clicked');
    });

    // Adding new tab
    const tabsContainer = html.find('.tabs[data-tab-container="primary"]');
    tabsContainer.append('<a class="list-row" data-tab="customPrompt">Prompt</a>');
    const contentContainer = html.find('.sheet-body'); // Or wherever you want to insert the content
    contentContainer.append('<div class="tab" data-tab="customPrompt" style="display: none;"><textarea name="customPromptData"></textarea></div>');
    
    // Setup tab switching logic (simplified version)
    tabsContainer.on('click', '.list-row', function(event) {
        const selectedTab = $(event.currentTarget).data('tab');
        contentContainer.children('.tab').each(function () {
            if ($(this).data('tab') === selectedTab) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });
});