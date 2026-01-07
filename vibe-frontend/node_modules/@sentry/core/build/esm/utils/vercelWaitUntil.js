import { GLOBAL_OBJ } from './worldwide.js';

/**
 * Function that delays closing of a Vercel lambda until the provided promise is resolved.
 *
 * Vendored from https://www.npmjs.com/package/@vercel/functions
 */
function vercelWaitUntil(task) {
  const vercelRequestContextGlobal =
    // @ts-expect-error This is not typed
    GLOBAL_OBJ[Symbol.for('@vercel/request-context')];

  const ctx = vercelRequestContextGlobal?.get?.();

  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
  }
}

export { vercelWaitUntil };
//# sourceMappingURL=vercelWaitUntil.js.map
