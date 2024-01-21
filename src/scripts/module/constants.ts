const CONSTANTS = {
    /**
     * The ID of the module.
     */
    MODULEID: "handy-dandy",
    /**
     * The name of the module.
     */
    MODULE_NAME: "Handy Dandy",
    /**
     * The path to the module's root directory.
     */
    PATH: `modules/handy-dandy/`,
    /**
     * The path to the module's Handlebars templates.
     */
    TEMPLATEPATH: `modules/handy-dandy/templates`,
    /**
     * The default prompt instructions always added onto the end of the type context. This helps ensure that the generated response is balanced and contains all
     * necessary information.
     */
    PROMPT_INSTRUCTION_CONSTANT: "The generated response should adhere to the balancing of the game. For example, if you are generating a feat, the feat should be balanced in accordance with the system and other feats in the game. Additionally, ensure that responses include all necessary information. For example, if you are generating a feat, the response should include the name of the feat, the description of the feat, and any other relevant information such as level that would normally appear on a stat block for the item.",
    /**
     * The endpoint for the OpenAI API.
     */
    GPT_ENDPOINT: "https://api.openai.com/v1/chat/completions",
  };
  
  export default CONSTANTS;