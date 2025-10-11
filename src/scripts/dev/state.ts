import type { DeveloperConsole } from "./developer-console";

let consoleInstance: DeveloperConsole | null = null;

export function setDeveloperConsole(instance: DeveloperConsole): void {
  consoleInstance = instance;
}

export function getDeveloperConsole(): DeveloperConsole | null {
  return consoleInstance;
}
