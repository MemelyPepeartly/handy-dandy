import { logInfo } from "./utils.js";

/**
 * Hook that opens when the actor sheet is rendered
 * @param sheet 
 * @param $html 
 */
export function renderActorSheetHook(sheet: ActorSheet, $html: JQuery) {
    logInfo("renderActorSheetHook called", sheet, $html);
}