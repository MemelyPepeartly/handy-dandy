import OpenAI from "openai";
import CONSTANTS from "./constants";
import pathfinderContextMap from "../helpers/pathfinder-context-map";

export class HandyDandyWindow extends Application {
    response: string;

    constructor(options = {}) {
        super(options);
        this.response = "";
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "handy-dandy-window",
            title: "Handy Dandy Tool",
            template: `${CONSTANTS.TEMPLATEPATH}/handy-dandy-window.hbs`,
            classes: ["handy-dandy"],
            width: 500,
            height: 500,
            resizable: true,
        });
    }    

    getData() {
        console.log("Handy Dandy | Hit getData()")
        return {
            types: [
                { value: "feat", label: "Feat" },
                { value: "item", label: "Item" },
                { value: "action", label: "Action" },
                { value: "spell", label: "Spell" },
                { value: "monster", label: "Monster" },
                { value: "npc", label: "NPC" }

            ],
            response: this.response
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
    
        // Attach click event listener to the button instead of form submit
        html.find(".generate-button").on("click", event => {
            event.preventDefault(); // Prevent the default button click behavior
            this._onGenerate(event);
        });
    }
    
    async _onGenerate(event) {
        const form = $(event.currentTarget).parents(".handy-dandy-form");
        const responseOutputBox = this.element.find(".response-output");
        const type = form.find(".type-dropdown").val();
        const userPrompt = form.find(".user-prompt").val();

        // Log to the console for debugging
        console.log("Handy Dandy | Type:", type);
        console.log("Handy Dandy | Prompt:", userPrompt);

        // Make sure to handle errors appropriately
        try {
            const response = await this.callOpenAI(userPrompt, type);
            this.response = response; // Update the response property
            responseOutputBox.text(response);
        } catch (error) {
            console.error("Error calling OpenAI:", error);
            this.response = "Error occurred"; // Update response in case of error
            responseOutputBox.text(this.response);
        }
    }

    async callOpenAI(prompt, type): Promise<string> {
        const gameInstance = game as Game;
    
        const organization = gameInstance.settings.get(CONSTANTS.MODULEID, "GPTOrganization") as string;
        const apiKey = gameInstance.settings.get(CONSTANTS.MODULEID, "GPTApiKey") as string;

        const typeContext = pathfinderContextMap[type] || "";
        // Add the instruction constant to the type context
        const typeContextWithInstruction = `${typeContext} \n ${CONSTANTS.PROMPT_INSTRUCTION_CONSTANT}`;
    
        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'OpenAI-Organization': organization
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [{ role: 'system', content: typeContextWithInstruction }, { role: 'user', content: prompt }]
            }),
        };
    
        try {
            this.showLoadingSpinner(true);

            const response = await fetch(CONSTANTS.GPT_ENDPOINT, requestOptions);
    
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
    
            const data = await response.json();
            this.showLoadingSpinner(false);

            return data.choices && data.choices.length > 0 
                   ? data.choices[0].message.content 
                   : "No response from OpenAI.";
        } catch (error) {
            console.error("Error calling OpenAI:", error);
            this.showLoadingSpinner(false);
            return "Failed to generate response";
        }
    }

    showLoadingSpinner(display: boolean) {
        const loadingSpinner = this.element.find(".loading-spinner");
        const responseOutputBox = this.element.find(".response-output");

        if (display) {
            loadingSpinner.show();
            responseOutputBox.hide();
        } else {
            loadingSpinner.hide();
            responseOutputBox.show();
        }
    }
}
