
import OpenAI, { ClientOptions } from "openai";
import { MODULEID } from "./const";
import { logInfo } from "./utils";

interface HandyDandyOptions extends FormApplicationOptions {
    someCustomOption?: number;
}

export class HandyDandy extends FormApplication<HandyDandyOptions> {
    engine: OpenAIEngine | undefined;

    protected _updateObject(event: Event, formData?: object): Promise<unknown> {
        throw new Error("Method not implemented.");
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "handy-dandy-app",
            title: "Handy Dandy Application",
            template: "modules/handy-dandy/templates/handy-dandy.hbs",
            dragDrop: [{ dragSelector: "ul.item-list > li.item" }],
            tabs: [],
            width: 500,
            height: 500,
            resizable: true
        });
    }

    activateListeners($html: JQuery<HTMLElement>) {
        super.activateListeners($html);

        $html.on('submit', 'form', (e) => {
            e.preventDefault();
        });
    
        const $button = $html.find("#generateButton");
        $button.on('click', (e) => {
            // get form values and create an object to pass to the processAIInput function
            const $form = $html.find("#handy-dandy-form");
            const serializedData = $form.serialize();
            
            const formValues = FormInput.deserialize(serializedData);
            this.processAIInput(formValues);
        });
    }

    processAIInput(input: any) {
        // Perform AI operations and return the result.
        console.log("Input data to Handy Dandy:", input);
        return null;
      }
}

export class FormInput {
    prompt: string;
    context: string;
    parameters: {
        temperature: number;
        maxLength: number;
    };

    constructor(prompt: string, context: string, temperature: number, maxLength: number) {
        this.prompt = prompt;
        this.context = context;
        this.parameters = {
            temperature: temperature,
            maxLength: maxLength
        };
    }

    // Convert instance to a serialized string
    serialize(): string {
        const serializedParameters = `parameters[temperature]=${this.parameters.temperature}&parameters[maxLength]=${this.parameters.maxLength}`;
        return `prompt=${encodeURIComponent(this.prompt)}&context=${encodeURIComponent(this.context)}&${serializedParameters}`;
    }

    // Create an instance from a serialized string
    static deserialize(input: string): FormInput {
        const params = new URLSearchParams(input);
        const prompt = params.get('prompt') || '';
        const context = params.get('context') || '';
        const temperature = parseFloat(params.get('parameters[temperature]') || '0');
        const maxLength = parseInt(params.get('parameters[maxLength]') || '0');
        return new FormInput(prompt, context, temperature, maxLength);
    }
}

export class OpenAIEngine {
    formInput?: FormInput;
    options?: ClientOptions;

    constructor(apiKey?: string) {
        this.options = {
            apiKey: apiKey
        };
    } 
    createCompletionRequest(): any {
        console.log("Creating completion request");
    }
}
