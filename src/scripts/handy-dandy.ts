import { ActorPF2e } from '@actor';
declare var Hooks: any;
declare var game: any;

// Initialize module
Hooks.once("init", async (_actor: ActorPF2e) => {
    console.log('My Module Test', _actor);

    game.settings.register("handy-dandy", "GPTApiKey", {
        name: "GPT API Key",
        hint: "Insert your GPT API Key here",
        scope: "client",
        config: true,
        type: String,
        default: ""
    });
});

Hooks.on("ready", () => {
    console.log('My Module Test Ready');

    console.log(game.actors);
});