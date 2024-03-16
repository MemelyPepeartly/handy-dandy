import { getSchemas } from "../utils";
import CONSTANTS from "./constants";

export class HandyDandySchemaTool extends Application {
    constructor(options = {}) {
        super(options);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "handy-dandy-tools",
            title: "Handy Dandy Tools",
            template: `${CONSTANTS.TEMPLATEPATH}/handy-dandy-tools.hbs`,
            classes: ["handy-dandy"],
            width: 500,
            height: 500,
            resizable: true,
        });
    }

    getData() {
        // Data to be passed to the template
        return {};
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find("button").click(this._getSchemas.bind(this));
    }

    _getSchemas(event) {
        console.log("Handy Dandy | Getting schemas");

        getSchemas();
    }
}
