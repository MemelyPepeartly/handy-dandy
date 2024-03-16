import CONSTANTS from "./constants";

export class HandyDandyTools extends Application {
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
      return {
        buttons: [
          { name: "Button1", label: "Function 1" },
          { name: "Button2", label: "Function 2" },
          // Add more buttons as needed
        ]
      };
    }
  
    activateListeners(html) {
      super.activateListeners(html);
      html.find("button").click(this._onButtonClick.bind(this));
    }
  
    _onButtonClick(event) {
      const buttonName = event.currentTarget.dataset.name;
      // Handle button click based on buttonName
      console.log(`Button ${buttonName} was clicked`);
      // Add your function logic here
    }
  }

  export class HandyDandyToolsTab extends SidebarTab {
    constructor(options = {}) {
        super(options);
    }

    getData(options = {}) {
        return super.getData({
            // Data passed to the template
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        // Add listeners for your sidebar tab buttons here
    }
}
  