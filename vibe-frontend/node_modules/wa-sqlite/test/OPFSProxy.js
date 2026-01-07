// Create a Proxy that calls OriginPrivateFileSystemVFS in a Worker.
export function makeOPFSProxy() {
  const worker = new Worker(
    new URL('./OPFSWorker.js', import.meta.url).toString(),
     { type: 'module' });

  return new Proxy({}, {
    get(target, property, receiver) {
      if (typeof property === 'string' && property.startsWith('x')) {
        return async function(...args) {
          // All arguments are structured cloneable.
          worker.postMessage({ name: property, args });

          // Wait for the response.
          const response = await new Promise(resolve => {
            worker.addEventListener('message', ({data}) => {
              // console.log('opfs response', data);
              resolve(data);
            }, { once: true });
          });
          if (response.error) throw Object.assign(new Error(), response.error);

          // Copy changed Uint8Array and DataView contents.
          response.args.forEach((responseArg, i) => {
            if (responseArg?.buffer) {
              new Uint8Array(args[i].buffer).set(new Uint8Array(responseArg.buffer));
            }
          });
          return response.result;
        };      
      } else if (property === 'close') {
        return function() {
          worker.terminate();
        }
      }
      return Reflect.get(target, property, receiver);
    }
  });
}