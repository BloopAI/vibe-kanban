import { OriginPrivateFileSystemVFS } from "../src/examples/OriginPrivateFileSystemVFS.js";

class TestWrapper extends OriginPrivateFileSystemVFS {
  handleAsync(f) {
    return f();
  }
}
const opfs = new TestWrapper();

addEventListener('message', async function({data}) {
  if (data === 'clean') {
    // Delete all files for this origin.
    const root = await navigator.storage.getDirectory();
    // @ts-ignore
    for await (const handle of root.values()) {
      await root.removeEntry(handle.name, { recursive: true });
    }
    postMessage(null);
    return;
  }
  
  // console.log('opfs request', data);
  let response;
  try {
    // Call the method.
    const result = await opfs[data.name](...data.args);
    response = { result, args: data.args };
  } catch(e) {
    console.error(e);
    response = { error: Object.fromEntries(Object.getOwnPropertyNames(e).map(k => [k, e[k]])) };
  }
  postMessage(response);
});