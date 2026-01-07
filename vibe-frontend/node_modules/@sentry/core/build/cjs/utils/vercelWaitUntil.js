Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const worldwide = require('./worldwide.js');

/**
 * Function that delays closing of a Vercel lambda until the provided promise is resolved.
 *
 * Vendored from https://www.npmjs.com/package/@vercel/functions
 */
function vercelWaitUntil(task) {
  const vercelRequestContextGlobal =
    // @ts-expect-error This is not typed
    worldwide.GLOBAL_OBJ[Symbol.for('@vercel/request-context')];

  const ctx = vercelRequestContextGlobal?.get?.();

  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
  }
}

exports.vercelWaitUntil = vercelWaitUntil;
//# sourceMappingURL=vercelWaitUntil.js.map
