import { ActorPF2e } from "@actor";
import { ActorSheetPF2e } from "@actor/sheet/base";

export function renderActorSheetHook(sheet: ActorSheetPF2e<ActorPF2e>, $html: JQuery) {
    console.log("renderActorSheetHook called");
}