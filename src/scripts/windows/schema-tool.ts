import { CONSTANTS } from "../constants";
import { getSchemas } from "../helpers/utils";

export class HandyDandySchemaTool extends Application {
    constructor(options = {}) {
        super(options);
        console.log("HandyDandySchemaTool constructor called with template path:", `${CONSTANTS.TEMPLATE_PATH}/handy-dandy-window.hbs`);
    }

    static get defaultOptions() {
        const options = mergeObject(super.defaultOptions, {
            id: "schema-tool",
            title: "Handy Dandy Tools",
            template: `${CONSTANTS.TEMPLATE_PATH}/handy-dandy-window.hbs`,
            classes: ["handy-dandy"],
            width: 500,
            height: 500,
            resizable: true,
        });
        console.log("HandyDandySchemaTool defaultOptions:", options);
        return options;
    }

    getData() {
        console.log("HandyDandySchemaTool getData called");
        const data = {
            models: ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo"],
            currentModel: "gpt-3.5-turbo",
            temperature: 0.7,
            prompt: "",
            output: ""
        };
        console.log("HandyDandySchemaTool getData returning:", data);
        return data;
    }

    async _render(force = false, options = {}) {
        console.log("HandyDandySchemaTool _render called");
        try {
            const result = await super._render(force, options);
            console.log("HandyDandySchemaTool _render successful");
            return result;
        } catch (error) {
            console.error("HandyDandySchemaTool _render error:", error);
            throw error;
        }
    }

    activateListeners(html: JQuery<HTMLElement>) {
        super.activateListeners(html);
        console.log("HandyDandySchemaTool activateListeners called");

        html.find(".generate-button").click(this._getSchemas.bind(this));
        html.find(".clear-button").click(this._clearForm.bind(this));
    }

    _getSchemas(event: any) {
        console.log("Handy Dandy | Getting schemas");
        getSchemas();
    }

    _clearForm(event: any) {
        const html = this.element;
        html.find("#hd-prompt").val("");
        html.find(".output").hide();
    }
}