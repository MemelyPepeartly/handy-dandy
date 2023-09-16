import { ActorPF2e } from "@actor";
import { ActorSheetPF2e } from "@actor/sheet/base.js";
import { logInfo } from "./utils.ts";

/**
 * Hook that opens when the actor sheet is rendered
 * @param sheet 
 * @param $html 
 */
export function renderActorSheetHook(sheet: ActorSheetPF2e<ActorPF2e>, $html: JQuery) {
    logInfo("renderActorSheetHook called", sheet, $html);
}