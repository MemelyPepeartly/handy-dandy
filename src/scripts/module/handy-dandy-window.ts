import OpenAI from "openai";
import CONSTANTS from "./constants";

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
            template: "modules/handy-dandy/templates/handy-dandy-window.hbs",
            classes: ["handy-dandy"],
            width: 400,
            height: 300,
        });
    }

    getData() {
        return {
            types: [
                { value: "feat", label: "Feat" },
                { value: "item", label: "Item" },
                { value: "action", label: "Action" }
            ],
            response: this.response // This could be updated dynamically
        };
    }

    activateListeners(html) {
        super.activateListeners(html); 
        // Event listener for the form submission
        const submitButton = html.find("#generate-button");

        submitButton.on("click", event => {
            event.preventDefault();
            // Log to the console for debugging
            console.log("Handy Dandy | Generate button clicked");

            this._onGenerate(html);
        });
    }
    

    async _onGenerate(html) {
        const form = html.find(".handy-dandy-form");

        const type = form.find(".type-dropdown").val();
        const userPrompt = form.find(".user-prompt").val();

        // Log to the console for debugging
        console.log("Handy Dandy | Type:", type);
        console.log("Handy Dandy | Prompt:", userPrompt);

        // Make sure to handle errors appropriately
        try {
            const response = await this.callOpenAI(userPrompt, type);
            this.response = response; // Update the response property
            form.find(".response-output").text(response);
        } catch (error) {
            console.error("Error calling OpenAI:", error);
            this.response = "Error occurred"; // Update response in case of error
            form.find(".response-output").text(this.response);
        }
    }

    async callOpenAI(prompt, type) : Promise<string> {
        const gameInstance = game as Game;

        const organization = gameInstance.settings.get(CONSTANTS.MODULEID, "GPTOrganization") as string;
        const apiKey = gameInstance.settings.get(CONSTANTS.MODULEID, "GPTApiKey") as string;

        const openai = new OpenAI({apiKey: apiKey, organization: organization});

        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            messages: [{ role: 'user', content: 'Say this is a test' }],
            model: 'gpt-3.5-turbo',
          };

        const chatCompletion: OpenAI.Chat.ChatCompletion = await openai.chat.completions.create(params);

        if (chatCompletion.choices[0].message.content != null) {
            return chatCompletion.choices[0].message.content;
        } else {
            return "Error";
        }
    }
}
