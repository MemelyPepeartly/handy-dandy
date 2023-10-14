import { MODULEID } from "./const";

const foundryGame: Game = game as Game;

export class HandyDandy extends Application {
    settings: any;
    constructor(options = {})
    {
        super(options);

        this.settings = foundryGame.settings.get(MODULEID, "GPTApiKey");

    }
    static override get defaultOptions(): ApplicationOptions {
        return {
            ...super.defaultOptions,
            id: "handy-dandy-app",
            classes: [],
            template: "modules/handy-dandy/templates/handy-dandy.hbs",
            resizable: true,
            dragDrop: [{ dragSelector: "ul.item-list > li.item" }],
            tabs: []
        }
    }

    initHandyDandy() {

    }

    submitForm(event: Event) {

    }

    override activateListeners($html: JQuery<HTMLElement>): void {
        super.activateListeners($html);
    
        // Get the button and form within this application's rendered HTML using jQuery
        const $button = $html.find("#generateButton");
        const $form = $html.find("#handy-dandy-form");
    
        $button.on('click', (e) => {
            console.log("Button clicked!");
            const serializedData = $form.serialize();
            this.processAIInput(serializedData);
        });
    }

    processAIInput(input: any) {
        // Perform AI operations and return the result.
        console.log("Input data to Handy Dandy:", input);
        return null;
      }
      
    
}
