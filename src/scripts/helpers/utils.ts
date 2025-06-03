import { getGame } from "./common";

export function getSchemas() {
    var game = getGame();
    const systemSchema = game.system.schema;
    const worldSchema = game.world.schema;
    const actorSchema = game.items?.documentClass.schema || game.actors?.documentClass.schema;

    console.log("System schema: ", systemSchema.fields);
    console.log("World schema: ", worldSchema.fields);
    console.log("Actor schema: ", actorSchema?.fields);
}