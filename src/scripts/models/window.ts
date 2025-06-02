export class HandyDandyWindow extends Application {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "handy-dandy-window",
      template: "modules/handy-dandy/templates/handy-dandy-window.hbs",
      width: 400,
      height: 300,
      title: "Handy Dandy Tools"
    });
  }

  activateListeners(html: JQuery<HTMLElement>): void {
    super.activateListeners(html);
    html.find(".generate-button").on("click", (event) => {
      event.preventDefault();
      console.log("Generate button clicked");
      // Insert your tool logic here
    });
  }
}