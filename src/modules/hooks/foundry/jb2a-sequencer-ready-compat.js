const DEFAULT_WAIT_MS = 5000;
const POLL_MS = 50;

/**
 * Read a JB2A module Sequencer database object from its module api.
 *
 * @param {object|undefined} module
 * @param {"freeDatabase"|"patreonDatabase"} databaseKey
 * @returns {object|undefined}
 */
export function getJb2aModuleDatabase(module, databaseKey) {
  const database = module?.api?.[databaseKey];
  return database && typeof database === "object" ? database : undefined;
}

/**
 * Wait until a JB2A module exposes its Sequencer database api.
 *
 * @param {object|undefined} module
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.pollMs]
 * @param {(module: object|undefined) => object|undefined} [options.getDatabase]
 * @returns {Promise<object|undefined>}
 */
export async function waitForJb2aModuleDatabase(module, options = {}) {
  const {
    timeoutMs = DEFAULT_WAIT_MS,
    pollMs = POLL_MS,
    getDatabase = (activeModule) =>
      getJb2aModuleDatabase(activeModule, "freeDatabase") ??
      getJb2aModuleDatabase(activeModule, "patreonDatabase"),
  } = options;

  if (!module?.active) return undefined;

  const sleep = (ms) =>
    new Promise((resolve) => {
      setTimeout(() => resolve(), ms);
    });

  const poll = async (remainingMs) => {
    const database = getDatabase(module);
    if (database) return database;
    if (remainingMs <= 0) return undefined;
    await sleep(Math.min(pollMs, remainingMs));
    return poll(remainingMs - pollMs);
  };

  return poll(timeoutMs);
}

/**
 * Ensure a JB2A module api exposes an object database for Sequencer merges.
 *
 * @param {object|undefined} module
 * @param {"freeDatabase"|"patreonDatabase"} databaseKey
 * @returns {object|undefined}
 */
export function ensureJb2aModuleDatabase(module, databaseKey) {
  if (!module) return undefined;

  const existing = getJb2aModuleDatabase(module, databaseKey);
  if (existing) return existing;

  const nextApi = { ...(module.api ?? {}), [databaseKey]: {} };
  Object.assign(module, { api: nextApi });
  return nextApi[databaseKey];
}

/**
 * Prepare JB2A module databases before JB2A's own `sequencer.ready` merge runs.
 *
 * @param {object} modules - Foundry module collection (`game.modules`)
 * @param {object} [options]
 * @returns {Promise<void>}
 */
export async function prepareJb2aSequencerDatabases(modules, options = {}) {
  const freeModule = modules.get("JB2A_DnD5e");
  const patreonModule = modules.get("jb2a_patreon");

  if (freeModule?.active) {
    const freeDatabase = await waitForJb2aModuleDatabase(freeModule, {
      ...options,
      getDatabase: (module) => getJb2aModuleDatabase(module, "freeDatabase"),
    });
    if (!freeDatabase) {
      ensureJb2aModuleDatabase(freeModule, "freeDatabase");
    }
  }

  if (patreonModule?.active) {
    const patreonDatabase = await waitForJb2aModuleDatabase(patreonModule, {
      ...options,
      getDatabase: (module) => getJb2aModuleDatabase(module, "patreonDatabase"),
    });
    if (!patreonDatabase) {
      ensureJb2aModuleDatabase(patreonModule, "patreonDatabase");
    }
  }
}

/**
 * Run before JB2A's `sequencer.ready` handler so `mergeObject` receives objects.
 */
export function registerJb2aSequencerReadyCompat() {
  Hooks.once(
    "sequencer.ready",
    async () => {
      await prepareJb2aSequencerDatabases(game.modules);
    },
    { priority: 1000 }
  );
}

export default function registerJb2aSequencerReadyCompatHook() {
  Hooks.once("init", registerJb2aSequencerReadyCompat);
}
