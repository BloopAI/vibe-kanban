import { MemoryVFS } from "../src/examples/MemoryVFS.js";
import { configureTests, TEST } from "./VFSTests.js";

const SKIP = [
  TEST.BATCH_ATOMIC,
  TEST.CONTENTION,
  TEST.LOCKS
];

class TestVFS extends MemoryVFS {
  constructor() {
    super();
    TestVFS.instances.push(this);
  }

  handleAsync(f) {
    return f();
  }

  static instances = [];

  static async clear() {
    // Close all IndexedDB open databases.
    for (const vfs of TestVFS.instances) {
      await vfs.close();
    }
    TestVFS.instances = [];
  }
}

describe('MemoryVFS', function() {
  configureTests(() => new TestVFS(), TestVFS.clear, SKIP);
});
