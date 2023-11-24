import CONSTANTS from "./constants";

export default class HandyDandyApplication extends Application {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: "Handy Dandy Application",
            template: `${CONSTANTS.TEMPLATEPATH}/handy-dandy.hbs`,
            width: 600,
            height: 600,
            resizable: true,
            // other options
        });
    }

    // Override methods, add event listeners, etc.
}