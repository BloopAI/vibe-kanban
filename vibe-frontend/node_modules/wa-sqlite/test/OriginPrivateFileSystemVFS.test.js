import { makeOPFSProxy } from "./OPFSProxy.js";
import { configureTests, TEST } from "./VFSTests.js";

const SKIP = [
  TEST.BATCH_ATOMIC
];

// jasmine.DEFAULT_TIMEOUT_INTERVAL = 300_000;

const proxies = [];

function build() {
  // OriginPrivateFileSystem works only in a Worker, so use a Proxy
  // that makes calls via messaging.
  const proxy = makeOPFSProxy();
  proxies.push(proxy);
  return proxy;
}

async function clear() {
  // Closing a proxy terminates its Worker.
  for (const proxy of proxies) {
    await proxy.close();
  }
  proxies.splice(0, proxies.length);

  // Delete everything from the file system.
  const worker = new Worker(
    new URL('./OPFSWorker.js', import.meta.url).toString(),
     { type: 'module' });
  worker.postMessage('clean');
  await new Promise(function(resolve) {
    worker.addEventListener('message', resolve);
  });
  worker.terminate();
}

describe('OriginPrivateFileSystemVFS', function() {
  // @ts-ignore
  configureTests(build, clear, SKIP);
});
