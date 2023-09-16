import { ActorPF2e } from '@actor';
declare var Hooks: any;

// Initialize module
Hooks.once("init", async (_actor: ActorPF2e) => {
    console.log('My Module Test', _actor);
});

Hooks.on("ready", () => {
    console.log('My Module Test Ready');
});