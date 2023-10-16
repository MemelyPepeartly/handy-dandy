import { NPCPF2e } from "@pf2e";
import { HandyDandy } from "../handy-dandy";


declare global {
  interface Game {
    handyDandy?: HandyDandy;
  }
}

declare global {
  interface LenientGlobalVariableTypes {
    game: never;
  }
}