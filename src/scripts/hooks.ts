import { ActorPF2e } from "@actor";
import { ActorSheetPF2e } from "@actor/sheet/base";
import { logInfo } from "./utils";

/**
 * Hook that opens when the actor sheet is rendered
 * @param sheet 
 * @param $html 
 */
export function renderActorSheetHook(sheet: ActorSheetPF2e<ActorPF2e>, $html: JQuery) {
    logInfo("renderActorSheetHook called", sheet, $html);
}