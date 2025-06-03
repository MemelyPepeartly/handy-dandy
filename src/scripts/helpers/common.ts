import { AssumeGameReady } from '../../types/types';

/**
 * Returns the game instance, throwing an error if it's not available
 * This allows for type-safe access to the game object
 */
export function getGame(): Game & AssumeGameReady {
  if (!game || !game.ready) {
    throw new Error('Game is not initialized yet');
  }
  return game as Game & AssumeGameReady;
}

/**
 * Returns the current user, throwing an error if it's null.
 */
export function getCurrentUser(): User {
  const user = getGame().user;
  if (!user) {
    throw new Error('No current user found');
  }
  return user;
}

export function getUiControls(): SceneControls {
    const controls = ui.controls;
    if (!controls) {
        throw new Error('UI controls are not initialized');
    }
    return controls;
}

/**
 * Returns the game.settings object with proper typing
 * This removes the need for nullish assertions when accessing settings
 */
export function getGameSettings(): ClientSettings {
  return getGame().settings;
}

/**
 * Returns a promise that resolves when the game is ready
 * Useful for async functions that need to wait for game initialization
 */
export async function whenGameReady(): Promise<Game & AssumeGameReady> {
  return new Promise((resolve) => {
    if (game?.ready) {
      return resolve(game as Game & AssumeGameReady);
    }
    
    Hooks.once('ready', () => {
      resolve(game as unknown as Game & AssumeGameReady);
    });
  });
}