import * as VFS from '../src/VFS.js';

const FILE_ID = 0xdeadbeef;
const TEXT = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore
eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt
in culpa qui officia deserunt mollit anim id est laborum.`
  .trim().replace(/\n/g, ' ');

// These flags can be used to suppress particular tests for a VFS
// subclass. For example, most subclasses will not need batch atomic
// write and rollback testing.
export const TEST = {
  BATCH_ATOMIC: 'batch atomic',
  CONTENTION: 'contenion',
  REBLOCK: 'reblock',
  LOCKS: 'locks'
};

/**
 * 
 * @param {() => VFS.Base} build 
 * @param {() => void|Promise<void>} clear 
 * @param {Iterable} [skip] 
 */
export function configureTests(build, clear, skip = []) {
  const skipTests = new Set(skip);

  beforeEach(async function() {
    await clear();
  });

  afterEach(async function() {
    await clear();
  });

  let result;

  class Value extends DataView {
    constructor() {
      super(new ArrayBuffer(8));
    }

    get value32() {
      return this.getInt32(0, true);
    }

    get value64() {
      return Number(this.getBigInt64(0, true));
    }

    pass() {
      this.setInt32(0, -1, true);
      return this;
    }
  }
  const pOut = new Value();

  it('should create a file', async function() {
    const objectUnderTest = await build();

    const filename = 'foo';
    await objectUnderTest.xAccess(filename, VFS.SQLITE_ACCESS_EXISTS, pOut.pass());
    expect(pOut.value32).toBeFalsy();

    result = await objectUnderTest.xOpen(
      filename, FILE_ID,
      VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE,
      pOut.pass());
    expect(result).toEqual(VFS.SQLITE_OK);
    expect(pOut.value32 & VFS.SQLITE_OPEN_READONLY).toEqual(0);

    result = await objectUnderTest.xAccess(filename, VFS.SQLITE_ACCESS_EXISTS, pOut.pass());
    expect(result).toEqual(VFS.SQLITE_OK);
    expect(pOut.value32).toBeTruthy();

    result = await objectUnderTest.xClose(FILE_ID);
    expect(result).toEqual(VFS.SQLITE_OK);
    result = await objectUnderTest.xAccess(filename, VFS.SQLITE_ACCESS_EXISTS, pOut.pass());
    expect(result).toEqual(VFS.SQLITE_OK);
    expect(pOut.value32).toBeTruthy();
  });

  it('should delete a file', async function() {
    const objectUnderTest = await build();
    
    const filename = 'foo';
    await objectUnderTest.xOpen(
      filename, FILE_ID,
      VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE,
      pOut.pass());
    await objectUnderTest.xClose(FILE_ID);
    await objectUnderTest.xAccess(filename, VFS.SQLITE_ACCESS_EXISTS, pOut.pass());
    expect(pOut.value32).toBeTruthy();

    await objectUnderTest.xDelete(filename, 1);
    await objectUnderTest.xAccess(filename, VFS.SQLITE_ACCESS_EXISTS, pOut.pass());
    expect(pOut.value32).toBeFalsy();
  });

  it('should write and read data', async function() {
    const objectUnderTest = await build();
    
    const filename = 'foo';
    await objectUnderTest.xOpen(
      filename, FILE_ID,
      VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE,
      pOut.pass());

    const text = 'the quick brown fox jumps over the lazy dog'.split(/\s/);

    // write
    let iOffset = 0;
    for (const s of text) {
      await writeString(objectUnderTest, FILE_ID, s, iOffset);
      iOffset += s.length;
    }

    // read
    iOffset = 0;
    for (const s of text) {
      const sRead = await readString(objectUnderTest, FILE_ID, s.length, iOffset);
      iOffset += s.length;

      expect(sRead).toBe(s);
    }

    // done
    await objectUnderTest.xClose(FILE_ID);
  });

  it('should track file size', async function() {
    const objectUnderTest = await build();
    
    const filename = 'foo';
    await objectUnderTest.xOpen(
      filename, FILE_ID,
      VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE,
      pOut.pass());

    result = await objectUnderTest.xFileSize(FILE_ID, pOut);
    expect(result).toBe(VFS.SQLITE_OK);
    expect(pOut.value64).toBe(0);

    let expectedSize = 0;
    for (const s of TEXT.split(/\s/)) {
      await writeString(objectUnderTest, FILE_ID, s, expectedSize);
      expectedSize += s.length;

      result = await objectUnderTest.xFileSize(FILE_ID, pOut);
      expect(result).toBe(VFS.SQLITE_OK);
      expect(pOut.value64).toBe(expectedSize);
    }

    for (let i = 0; i < 20; ++i) {
      await writeString(objectUnderTest, FILE_ID, TEXT, expectedSize);
      expectedSize += TEXT.length;

      result = await objectUnderTest.xFileSize(FILE_ID, pOut);
      expect(result).toBe(VFS.SQLITE_OK);
      expect(pOut.value64).toBe(expectedSize);
    }
  });

  it('should truncate a file', async function() {
    const objectUnderTest = await build();
    
    const filename = 'foo';
    await objectUnderTest.xOpen(
      filename, FILE_ID,
      VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE,
      pOut.pass());

    let expectedSize = 0;
    for (let i = 0; i < 20; ++i) {
      await writeString(objectUnderTest, FILE_ID, TEXT, expectedSize);
      expectedSize += TEXT.length;
    }

    const truncatedSize = expectedSize - TEXT.length;
    result = await objectUnderTest.xTruncate(FILE_ID, truncatedSize);
    expect(result).toBe(VFS.SQLITE_OK);

    result = await objectUnderTest.xFileSize(FILE_ID, pOut);
    expect(result).toBe(VFS.SQLITE_OK);
    expect(pOut.value64).toBe(truncatedSize);
  });

  it('should return a valid sector size', async function() {
    const objectUnderTest = await build();
    
    const filename = 'foo';
    await objectUnderTest.xOpen(
      filename, FILE_ID,
      VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE,
      pOut.pass());

    result = await objectUnderTest.xSectorSize(FILE_ID);
    expect(result).toBeGreaterThanOrEqual(512);
    expect(result).toBeLessThanOrEqual(65536);
    expect(result & (result - 1)).toBe(0); // power of 2
  });

  it('should delete on close', async function() {
    const objectUnderTest = await build();
    
    const filename = 'foo';
    await objectUnderTest.xOpen(
      filename, FILE_ID,
      VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE | VFS.SQLITE_OPEN_DELETEONCLOSE,
      pOut.pass());
    await writeString(objectUnderTest, FILE_ID, TEXT, 0);
    const s = await readString(objectUnderTest, FILE_ID, TEXT.length, 0);
    expect(s).toEqual(TEXT);

    result = await objectUnderTest.xClose(FILE_ID);
    expect(result).toBe(VFS.SQLITE_OK);

    result = await objectUnderTest.xAccess(filename, VFS.SQLITE_ACCESS_EXISTS, pOut);
    expect(result).toBe(VFS.SQLITE_OK);
    expect(pOut.value32).toBeFalsy();
  });

  it('should open with null filename', async function() {
    const objectUnderTest = await build();
    
    result = await objectUnderTest.xOpen(
      null, FILE_ID,
      VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE | VFS.SQLITE_OPEN_DELETEONCLOSE,
      pOut.pass());

    await writeString(objectUnderTest, FILE_ID, TEXT, 0);
    const s = await readString(objectUnderTest, FILE_ID, TEXT.length, 0);
    expect(s).toEqual(TEXT);

    result = await objectUnderTest.xClose(FILE_ID);
    expect(result).toBe(VFS.SQLITE_OK);
  });

  it('should handle short read from empty file', async function() {
    const objectUnderTest = await build();
    
    result = await objectUnderTest.xOpen(
      null, FILE_ID,
      VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE | VFS.SQLITE_OPEN_DELETEONCLOSE,
      pOut.pass());

    const pData = new Uint8Array(16);
    pData.fill(-1);
    result = await objectUnderTest.xRead(FILE_ID, pData, 24);
    expect(result).toBe(VFS.SQLITE_IOERR_SHORT_READ);
    expect(Array.from(pData)).toEqual(new Array(16).fill(0));
  });

  if (!skipTests.has(TEST.BATCH_ATOMIC)) {
    it('should batch atomic commit if configured', async function() {
      const objectUnderTest = await build();
      
      const characteristics = await objectUnderTest.xDeviceCharacteristics(FILE_ID);
      expect(characteristics & VFS.SQLITE_IOCAP_BATCH_ATOMIC).toBeTruthy();

      const filename = 'foo';
      await objectUnderTest.xOpen(
        filename, FILE_ID,
        VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE | VFS.SQLITE_OPEN_MAIN_DB,
        pOut.pass());

      await transact(objectUnderTest, FILE_ID, null, async function() {
        const pOut = new DataView(new ArrayBuffer(0));
        result = await objectUnderTest.xFileControl(
          FILE_ID,
          VFS.SQLITE_FCNTL_BEGIN_ATOMIC_WRITE,
          pOut);
        expect(result).toBe(VFS.SQLITE_OK);

        const buffer = new TextEncoder().encode(TEXT).buffer;
        const pData = new Uint8Array(buffer);
        result = await objectUnderTest.xWrite(FILE_ID, pData, 0);
        expect(result).toBe(VFS.SQLITE_OK);

        result = await objectUnderTest.xFileControl(
          FILE_ID,
          VFS.SQLITE_FCNTL_COMMIT_ATOMIC_WRITE,
          pOut);
        expect(result).toBe(VFS.SQLITE_OK);
      });

      const pData = new Uint8Array(TEXT.length);
      result = await objectUnderTest.xRead(FILE_ID, pData, 0);
      expect(result).toBe(VFS.SQLITE_OK);

      const s = new TextDecoder().decode(pData);
      expect(s).toEqual(TEXT);
    });;

    it('should batch atomic rollback', async function() {
      const objectUnderTest = await build();
      
      const characteristics = await objectUnderTest.xDeviceCharacteristics(FILE_ID);
      expect(characteristics & VFS.SQLITE_IOCAP_BATCH_ATOMIC).toBeTruthy();

      const filename = 'foo';
      await objectUnderTest.xOpen(
        filename, FILE_ID,
        VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE | VFS.SQLITE_OPEN_MAIN_DB,
        pOut.pass());

      await transact(objectUnderTest, FILE_ID, null, async function() {
        const pOut = new DataView(new ArrayBuffer(0));
        result = await objectUnderTest.xFileControl(
          FILE_ID,
          VFS.SQLITE_FCNTL_BEGIN_ATOMIC_WRITE,
          pOut);
        expect(result).toBe(VFS.SQLITE_OK);

        const buffer = new TextEncoder().encode(TEXT).buffer;
        const pData = new Uint8Array(buffer);
        result = await objectUnderTest.xWrite(FILE_ID, pData, 0);
        expect(result).toBe(VFS.SQLITE_OK);

        result = await objectUnderTest.xFileControl(
          FILE_ID,
          VFS.SQLITE_FCNTL_ROLLBACK_ATOMIC_WRITE,
          pOut);
        expect(result).toBe(VFS.SQLITE_OK);
      });

      const pData = new Uint8Array(TEXT.length);
      result = await objectUnderTest.xRead(FILE_ID, pData, 0);
      expect(result).toBe(VFS.SQLITE_IOERR_SHORT_READ);

      result = await objectUnderTest.xFileSize(FILE_ID, pOut);
      expect(pOut.value64).toBe(0);
    });
  } // skip check

  if (!skipTests.has(TEST.LOCKS)) {
    it('should check reserved lock status', async function() {
      const objectUnderTest = await build();

      let result;
      const filename = 'foo';
      result = await objectUnderTest.xOpen(
        filename, FILE_ID,
        VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE | VFS.SQLITE_OPEN_MAIN_DB,
        pOut.pass());
      expect(result).toBe(VFS.SQLITE_OK);

      result = await objectUnderTest.xLock(FILE_ID, VFS.SQLITE_LOCK_SHARED);
      expect(result).toBe(VFS.SQLITE_OK);
      result = await objectUnderTest.xCheckReservedLock(FILE_ID, pOut.pass());
      expect(result).toBe(VFS.SQLITE_OK);
      expect(pOut.value32).toBeFalsy();

      result = await objectUnderTest.xLock(FILE_ID, VFS.SQLITE_LOCK_RESERVED);
      expect(result).toBe(VFS.SQLITE_OK);
      result = await objectUnderTest.xCheckReservedLock(FILE_ID, pOut.pass());
      expect(result).toBe(VFS.SQLITE_OK);
      expect(pOut.value32).toBeTruthy();

      result = await objectUnderTest.xLock(FILE_ID, VFS.SQLITE_LOCK_EXCLUSIVE);
      expect(result).toBe(VFS.SQLITE_OK);
      result = await objectUnderTest.xCheckReservedLock(FILE_ID, pOut.pass());
      expect(result).toBe(VFS.SQLITE_OK);
      expect(pOut.value32).toBeTruthy();

      result = await objectUnderTest.xUnlock(FILE_ID, VFS.SQLITE_LOCK_SHARED);
      expect(result).toBe(VFS.SQLITE_OK);
      result = await objectUnderTest.xCheckReservedLock(FILE_ID, pOut.pass());
      expect(result).toBe(VFS.SQLITE_OK);
      expect(pOut.value32).toBeFalsy();

      result = await objectUnderTest.xUnlock(FILE_ID, VFS.SQLITE_LOCK_NONE);
      expect(result).toBe(VFS.SQLITE_OK);
      result = await objectUnderTest.xCheckReservedLock(FILE_ID, pOut.pass());
      expect(result).toBe(VFS.SQLITE_OK);
      expect(pOut.value32).toBeFalsy();
    });
  }

  if (!skipTests.has(TEST.CONTENTION)) {
    it('should allow contention', async function() {
      const nInstances = 8;
      const nIterations = 5;
      async function go(filename, fileId) {
        const objectUnderTest = await build();
        await objectUnderTest.xOpen(
          filename,
          fileId,
          VFS.SQLITE_OPEN_READWRITE | VFS.SQLITE_OPEN_MAIN_DB,
          pOut.pass());
        for (let i = 0; i < nIterations; ++i) {
          const pDataA = new Uint8Array(4);
          const pDataB = new Uint8Array(4);

          let maybeBusy;
          do {
            maybeBusy = await transact(objectUnderTest, fileId, async function() {
              // Read two ints.
              await objectUnderTest.xRead(fileId, pDataA, 0);
              await new Promise(resolve => setTimeout(resolve));
              await objectUnderTest.xRead(fileId, pDataB, 4);
              await new Promise(resolve => setTimeout(resolve));

              expect(Array.from(pDataA)).toEqual(Array.from(pDataB));
            }, async function() {
              // Increment ints.
              const viewA = new DataView(pDataA.buffer);
              const viewB = new DataView(pDataB.buffer);
              viewA.setInt32(0, viewA.getInt32(0) + 1);
              viewB.setInt32(0, viewB.getInt32(0) + 1);

              // Store ints.
              await objectUnderTest.xWrite(fileId, pDataA, 0);
              await new Promise(resolve => setTimeout(resolve));
              await objectUnderTest.xWrite(fileId, pDataB, 4);
              await new Promise(resolve => setTimeout(resolve));
            });
          } while (maybeBusy === VFS.SQLITE_BUSY);
        }
      }

      const objectUnderTest = await build();
      await objectUnderTest.xOpen(
        'foo', FILE_ID,
        VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE | VFS.SQLITE_OPEN_MAIN_DB,
        pOut.pass());

      const pData = new Uint8Array(4);
      await transact(objectUnderTest, FILE_ID, null, async function() {
        await objectUnderTest.xWrite(FILE_ID, pData, 0);
        await objectUnderTest.xWrite(FILE_ID, pData, 4);
      });

      await objectUnderTest.xClose(FILE_ID);

      const instances = [];
      for (let i = 0; i < nInstances; ++i) {
        instances.push(go('foo', i));
      }

      await Promise.all(instances);

      await objectUnderTest.xOpen(
        'foo', FILE_ID,
        VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE,
        pOut.pass());

      await transact(objectUnderTest, FILE_ID, async function() {
        const view = new DataView(pData.buffer);
        await objectUnderTest.xRead(FILE_ID, pData, 0);
        expect(view.getInt32(0)).toBe(nInstances * nIterations);
        await objectUnderTest.xRead(FILE_ID, pData, 4);
        expect(view.getInt32(0)).toBe(nInstances * nIterations);
      });

      await objectUnderTest.xClose(FILE_ID);
    });
  } // skip check

  if (!skipTests.has(TEST.REBLOCK)) {
    it('should handle page size change', async function() {
      const objectUnderTest = await build();
      await objectUnderTest.xOpen(
        'foo', FILE_ID,
        VFS.SQLITE_OPEN_CREATE | VFS.SQLITE_OPEN_READWRITE | VFS.SQLITE_OPEN_MAIN_DB,
        pOut.pass());

      const pageSizes = [4096, 8192, 65536, 4096, 512];
      const data = new Uint8Array(65536 * 4);
      (function() {
        const dataView = new DataView(data.buffer);
        for (let i = 0; i < data.byteLength; i += 4) {
          dataView.setUint32(i, Math.random() * (2 ** 32));
        }
      })();

      // File will always contain a configuration page followed by 256 KB of
      // data.
      async function writeFile(pageSize, writeSize) {
        // Create in-memory file image.
        const nWrites = Math.trunc((pageSize + data.byteLength + writeSize - 1) / writeSize);
        const allFileData = new Uint8Array(writeSize * nWrites);
        allFileData.set(data, pageSize);

        // Set file header values.
        const nPages = Math.trunc((pageSize + data.byteLength + pageSize - 1) / pageSize);
        const dataView = new DataView(allFileData.buffer);
        dataView.setUint16(16, pageSize < 65536 ? pageSize : 1);
        dataView.setUint32(28, nPages)

        // Write the file in writeSize chunks.
        for (let i = 0; i < nWrites; ++i) {
          const offset = i * writeSize;
          const chunk = allFileData.subarray(offset, offset + writeSize);
          await objectUnderTest.xWrite(FILE_ID, chunk, offset);
        }
      }

      // Fill at initial page size.
      let pageSize = pageSizes[0];
      await transact(objectUnderTest, FILE_ID, null, async function() {
        await writeFile(pageSize, pageSize);
      });

      for (const newPageSize of pageSizes) {
        // Overwrite with new page data at the old page size.
        await transact(objectUnderTest, FILE_ID, null, async function() {
          // As SQLite does, signal overwrite of the entire file.
          await objectUnderTest.xFileControl(FILE_ID, VFS.SQLITE_FCNTL_OVERWRITE, pOut);

          await writeFile(newPageSize, pageSize);
        });

        pageSize = newPageSize;

        await transact(objectUnderTest, FILE_ID, async function() {
          // Read page size.
          const pageData = new Uint8Array(2);
          await objectUnderTest.xRead(FILE_ID, pageData, 16);

          const dataView = new DataView(pageData.buffer);
          expect(dataView.getUint16(0)).toEqual(pageSize < 65536 ? pageSize : 1);

          // Read data one sector at a time.
          const readSize = 512;
          const readData = new Uint8Array(data.byteLength);
          const readCount = data.byteLength / readSize;
          for (let i = 0; i < readCount; ++i) {
            const offset = i * readSize;
            await objectUnderTest.xRead(
              FILE_ID,
              readData.subarray(offset, offset + readSize),
              pageSize + offset);
          }
          expect(readData.every((value, index) => value === data[index])).toBeTrue();
        });
      }
    });
  }
}

/**
 * @param {VFS.Base} vfs 
 * @param {number} fileId 
 * @param {(vfs?: VFS.Base, fileId?: number) => Promise<number|void>} [shared]
 * @param {(vfs?: VFS.Base, fileId?: number) => Promise<number|void>} [exclusive]
 * @returns {Promise<*>}
 */
 async function transact(vfs, fileId, shared, exclusive) {
  const cleanup = [];
  try {
    /** @type {number} */ let result;
    result = await vfs.xLock(fileId, VFS.SQLITE_LOCK_SHARED)
    if (result === VFS.SQLITE_BUSY) return result;
    if (result !== VFS.SQLITE_OK) throw new Error(`xLock returned ${result}`);
    cleanup.push(() => vfs.xUnlock(fileId, VFS.SQLITE_LOCK_NONE));

    if (shared) {
      await shared(vfs, fileId);
    }

    if (exclusive) {
      result = await vfs.xLock(fileId, VFS.SQLITE_LOCK_RESERVED)
      if (result === VFS.SQLITE_BUSY) return result;
      if (result !== VFS.SQLITE_OK) throw new Error(`xLock returned ${result}`);

      result = await vfs.xLock(fileId, VFS.SQLITE_LOCK_EXCLUSIVE)
      if (result === VFS.SQLITE_BUSY) return result;
      if (result !== VFS.SQLITE_OK) throw new Error(`xLock returned ${result}`);
      cleanup.push(() => vfs.xUnlock(fileId, VFS.SQLITE_LOCK_SHARED));

      await exclusive(vfs, fileId);

      const pArg = new DataView(new ArrayBuffer(0));
      result = await vfs.xFileControl(fileId, VFS.SQLITE_FCNTL_SYNC, pArg);

      result = await vfs.xSync(fileId, VFS.SQLITE_SYNC_NORMAL);
      if (result !== VFS.SQLITE_OK) throw new Error(`xSync returned ${result}`);

      result = await vfs.xFileControl(fileId, VFS.SQLITE_FCNTL_COMMIT_PHASETWO, pArg);
    }
  } catch (e) {
    debugger;
    throw e;
  }
  finally {
    while (cleanup.length) {
      await cleanup.pop()();
    }
  }
  return VFS.SQLITE_OK;
}

/**
 * @param {VFS.Base} vfs 
 * @param {number} fileId 
 * @param {string} s 
 * @param {number} iOffset 
 */
async function writeString(vfs, fileId, s, iOffset) {
  const encoded = new TextEncoder().encode(s);
  const pData = new Uint8Array(encoded.buffer);

  const result = await vfs.xWrite(fileId, pData, iOffset);
  if (result !== VFS.SQLITE_OK) throw new Error('write failed');
}

/**
 * @param {VFS.Base} vfs 
 * @param {number} fileId 
 * @param {number} size
 * @param {number} iOffset 
 */
async function readString(vfs, fileId, size, iOffset) {
  const pData = new Uint8Array(size);

  const result = await vfs.xRead(fileId, pData, iOffset);
  if (result !== VFS.SQLITE_OK) throw new Error('read failed');
  return new TextDecoder().decode(pData);
}