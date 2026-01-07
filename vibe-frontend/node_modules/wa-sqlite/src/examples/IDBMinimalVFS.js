// Copyright 2022 Roy T. Hashimoto. All Rights Reserved.
import * as VFS from '../VFS.js';
import { IDBContext } from './IDBContext.js';
import { WebLocksExclusive as WebLocks } from './WebLocks.js';

function log(...args) {
  // console.debug(...args);
}

/** @type {{durability: "default"|"strict"|"relaxed"}} */
const DEFAULT_OPTIONS = { durability: "default" };

/**
 * Objects stored in IndexedDB with key [name, offset].
 * @typedef FileBlock
 * @property {string} name
 * @property {number} offset negative of position in file
 * @property {Uint8Array} data
 */

/**
 * @typedef OpenedFileEntry
 * @property {string} path
 * @property {number} flags
 * @property {number} fileSize
 * @property {WebLocks} locks
 */

/**
 * This is an IndexedDB VFS with very simple logic. It makes two assumptions
 * on how SQLite will call it:
 * 
 *  1. Any overwritten data uses the same write offset and size.
 *  2. Any read requests data from only one write.
 * 
 * It uses one trick - it stores each write as-is into IndexedDB using
 * the negative of the file offset as part of the key. This bypasses the
 * typical conversion to and from fixed-size blocks.
 */
export class IDBMinimalVFS extends VFS.Base {
  /** @type {Map<number, OpenedFileEntry>} */ #mapIdToFile = new Map();
  /** @type {IDBContext} */ #idb;
  #options;

  constructor(idbDatabaseName, options = DEFAULT_OPTIONS) {
    super();
    this.name = idbDatabaseName;
    this.#options = options;
    this.#idb = new IDBContext(openDatabase(idbDatabaseName), options);
  }

  async close() {
    for (const fileId of this.#mapIdToFile.keys()) {
      await this.xClose(fileId);
    }

    await this.#idb?.close();
    this.#idb = null;
  }

  /**
   * @param {string?} name 
   * @param {number} fileId 
   * @param {number} flags 
   * @param {DataView} pOutFlags 
   * @returns {number}
   */
  xOpen(name, fileId, flags, pOutFlags) {
    return this.handleAsync(async () => {
      if (name === null) name = `null_${fileId}`;
      log(`xOpen ${name} ${fileId} 0x${flags.toString(16)}`);

      try {
        // Filenames can be URLs, possibly with query parameters.
        const url = new URL(name, 'file://localhost/');
        const file = {
          path: url.pathname,
          flags,
          fileSize: 0,
          locks: new WebLocks(url.pathname)
        };
        this.#mapIdToFile.set(fileId, file);

        // Read the last block to get the file size.
        this.#idb.run('readwrite', async ({blocks}) => {
          const lastBlock = await blocks.get(this.#bound(file, -Infinity));
          if (lastBlock) {
            file.fileSize = lastBlock.data.length - lastBlock.offset;
          } else if (flags & VFS.SQLITE_OPEN_CREATE) {
            const block = {
              path: file.path,
              offset: 0,
              data: new Uint8Array(0),
            };
            blocks.put(block);
          } else {
            throw new Error(`file not found: ${file.path}`);
          }
        });
        pOutFlags.setInt32(0, flags & VFS.SQLITE_OPEN_READONLY, true);
        return VFS.SQLITE_OK;
      } catch (e) {
        console.error(e);
        return VFS.SQLITE_CANTOPEN;
      }
    });
  }

  /**
   * @param {number} fileId 
   * @returns {number}
   */
  xClose(fileId) {
    return this.handleAsync(async () => {
      try {
        const file = this.#mapIdToFile.get(fileId);
        if (file) {
          log(`xClose ${file.path}`);

          this.#mapIdToFile.delete(fileId);
          if (file.flags & VFS.SQLITE_OPEN_DELETEONCLOSE) {
            this.#idb.run('readwrite', ({blocks}) => {
              blocks.delete(this.#bound(file, -Infinity));
            });
          }
        }
        return VFS.SQLITE_OK;
      } catch (e) {
        console.error(e);
        return VFS.SQLITE_IOERR;
      }
    });
  }

  /**
   * @param {number} fileId 
   * @param {Uint8Array} pData 
   * @param {number} iOffset
   * @returns {number}
   */
  xRead(fileId, pData, iOffset) {
    return this.handleAsync(async () => {
      const file = this.#mapIdToFile.get(fileId);
      log(`xRead ${file.path} ${pData.byteLength} ${iOffset}`);

      try {
        /** @type {FileBlock} */
        const block = await this.#idb.run('readonly', ({blocks}) => {
          return blocks.get(this.#bound(file, -iOffset));
        });

        const blockOffset = iOffset + block.offset;
        const nBytesToCopy = Math.min(
          Math.max(block.data.byteLength - blockOffset, 0), // source bytes
          pData.byteLength);                                // destination bytes
        pData.set(block.data.subarray(blockOffset, blockOffset + nBytesToCopy));

        if (nBytesToCopy < pData.byteLength) {
          pData.fill(0, nBytesToCopy, pData.byteLength);
          return VFS.SQLITE_IOERR_SHORT_READ;
        }
        return VFS.SQLITE_OK;
      } catch (e) {
        console.error(e);
        return VFS.SQLITE_IOERR;
      }
    });
  }

  /**
   * @param {number} fileId 
   * @param {Uint8Array} pData 
   * @param {number} iOffset
   * @returns {number}
   */
  xWrite(fileId, pData, iOffset) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xWrite ${file.path} ${pData.byteLength} ${iOffset}`);

    try {
      // Convert the write directly into an IndexedDB object.
      const block = {
        path: file.path,
        offset: -iOffset,
        data: pData.slice()
      };
      this.#idb.run('readwrite', ({blocks}) => blocks.put(block));
      file.fileSize = Math.max(file.fileSize, iOffset + pData.byteLength);
      return VFS.SQLITE_OK;
    } catch (e) {
      console.error(e);
      return VFS.SQLITE_IOERR;
    }
  }

  /**
   * @param {number} fileId 
   * @param {number} iSize 
   * @returns {number}
   */
  xTruncate(fileId, iSize) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xTruncate ${file.path} ${iSize}`);

    try {
      file.fileSize = iSize;
      this.#idb.run('readwrite', ({blocks})=> {
        blocks.delete(this.#bound(file, -Infinity, -iSize));
        if (iSize === 0) {
          blocks.put({
            path: file.path,
            offset: 0,
            data: new Uint8Array(0)
          })
        }
      });
      return VFS.SQLITE_OK;
    } catch (e) {
      console.error(e);
      return VFS.SQLITE_IOERR;
    }
  }

  /**
   * @param {number} fileId 
   * @param {*} flags 
   * @returns {number}
   */
  xSync(fileId, flags) {
    if (this.#options.durability !== 'relaxed') {
      return this.handleAsync(async () => {
        const file = this.#mapIdToFile.get(fileId);
        log(`xSync ${file.path} ${flags}`);

        try {
          await this.#idb.sync();
          return VFS.SQLITE_OK;
        } catch (e) {
          console.error(e);
          return VFS.SQLITE_IOERR;
        }
      });
    }
    return VFS.SQLITE_OK;
  }

  /**
   * @param {number} fileId 
   * @param {DataView} pSize64 
   * @returns {number}
   */
  xFileSize(fileId, pSize64) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xFileSize ${file.path}`);

    pSize64.setBigInt64(0, BigInt(file.fileSize), true);
    return VFS.SQLITE_OK;
  }

  /**
   * @param {number} fileId 
   * @param {number} flags 
   * @returns {number}
   */
  xLock(fileId, flags) {
    return this.handleAsync(async () => {
      const file = this.#mapIdToFile.get(fileId);
      log(`xLock ${file.path} ${fileId} ${flags}`);

      try {
        const result = await file.locks.lock(flags);
        if (result === VFS.SQLITE_OK && file.locks.state === VFS.SQLITE_LOCK_SHARED) {
          // Update cached file size when lock is acquired.
          const lastBlock = await this.#idb.run('readonly', ({blocks}) => {
            return blocks.get(this.#bound(file, -Infinity));
          });
          file.fileSize = lastBlock.data.length - lastBlock.offset;
        }

        return result;
      } catch (e) {
        console.error(e);
        return VFS.SQLITE_IOERR;
      }
    });
  }

  /**
   * @param {number} fileId 
   * @param {number} flags 
   * @returns {number}
   */
  xUnlock(fileId, flags) {
    return this.handleAsync(async () => {
      const file = this.#mapIdToFile.get(fileId);
      log(`xUnlock ${file.path} ${fileId} ${flags}`);

      try {
        await file.locks.unlock(flags);
        return VFS.SQLITE_OK;
      } catch (e) {
        console.error(e);
        return VFS.SQLITE_IOERR;
      }
    });
  }

  /**
   * @param {number} fileId 
   * @param {DataView} pResOut 
   * @returns {number}
   */
  xCheckReservedLock(fileId, pResOut) {
    return this.handleAsync(async () => {
      const file = this.#mapIdToFile.get(fileId);
      log(`xCheckReservedLock ${file.path}`);

      const isReserved = await file.locks.isSomewhereReserved();
      pResOut.setInt32(0, isReserved ? 1 : 0, true);
      return VFS.SQLITE_OK;
    });
  }

  /**
   * @param {number} fileId 
   * @returns {number}
   */
  xSectorSize(fileId) {
    log('xSectorSize');
    return 512;
  }

  /**
   * @param {number} fileId 
   * @returns {number}
   */
  xDeviceCharacteristics(fileId) {
    log('xDeviceCharacteristics');
    return VFS.SQLITE_IOCAP_SAFE_APPEND |
           VFS.SQLITE_IOCAP_SEQUENTIAL |
           VFS.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN;
  }

  /**
   * @param {string} name 
   * @param {number} flags 
   * @param {DataView} pResOut 
   * @returns {number}
   */
  xAccess(name, flags, pResOut) {
    return this.handleAsync(async () => {
      const path = new URL(name, 'file://localhost/').pathname;
      log(`xAccess ${path} ${flags}`);

      try {
        // Check if any block exists.
        const key = await this.#idb.run('readonly', ({blocks}) => {
          return blocks.getKey(this.#bound({path}, -Infinity));
        });
        pResOut.setInt32(0, key ? 1 : 0, true);
        return VFS.SQLITE_OK;
      } catch (e) {
        console.error(e);
        return VFS.SQLITE_IOERR;
      }
    });
  }

  /**
   * @param {string} name 
   * @param {number} syncDir 
   * @returns {number}
   */
  xDelete(name, syncDir) {
    return this.handleAsync(async () => {
      const path = new URL(name, 'file://localhost/').pathname;
      log(`xDelete ${path} ${syncDir}`);

      try {
        const complete = this.#idb.run('readwrite', ({blocks}) => {
          return blocks.delete(this.#bound({path}, -Infinity));
        });
        if (syncDir) await complete;
        return VFS.SQLITE_OK;
      } catch (e) {
        console.error(e);
        return VFS.SQLITE_IOERR;
      }
    });
  }

  #bound(file, begin, end = Infinity) {
    return IDBKeyRange.bound([file.path, begin], [file.path, end]);
  }
}

function openDatabase(idbDatabaseName) {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(idbDatabaseName, 1);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore('blocks', { keyPath: ['path', 'offset'] });
    });
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error);
    });
  });
}