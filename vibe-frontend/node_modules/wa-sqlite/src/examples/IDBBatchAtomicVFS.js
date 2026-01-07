// Copyright 2022 Roy T. Hashimoto. All Rights Reserved.
import * as VFS from '../VFS.js';
import { WebLocksExclusive as WebLocks } from './WebLocks.js';
import { IDBContext } from './IDBContext.js';

const SECTOR_SIZE = 512;
const MAX_TASK_MILLIS = 3000;

/**
 * @typedef VFSOptions
 * @property {"default"|"strict"|"relaxed"} [durability]
 * @property {"deferred"|"manual"} [purge]
 * @property {number} [purgeAtLeast]
 */

/** @type {VFSOptions} */
const DEFAULT_OPTIONS = {
  durability: "default",
  purge: "deferred",
  purgeAtLeast: 16
};

function log(...args) {
  // console.debug(...args);
}

/**
 * @typedef FileBlock IndexedDB object with key [path, offset, version]
 * @property {string} path
 * @property {number} offset negative of position in file
 * @property {number} version
 * @property {Uint8Array} data
 *
 * @property {number} [fileSize] Only present on block 0
*/

/**
 * @typedef OpenedFileEntry
 * @property {string} path
 * @property {number} flags
 * @property {FileBlock} block0
 * @property {boolean} isMetadataChanged
 * @property {WebLocks} locks
 * 
 * @property {Set<number>} [changedPages]
 * @property {boolean} [overwrite]
 */

// This sample VFS stores optionally versioned writes to IndexedDB, which
// it uses with the SQLite xFileControl() batch atomic write feature.
export class IDBBatchAtomicVFS extends VFS.Base {
  #options;
  /** @type {Map<number, OpenedFileEntry>} */ #mapIdToFile = new Map();

  /** @type {IDBContext} */ #idb;
  /** @type {Set<string>} */ #pendingPurges = new Set();

  #taskTimestamp = performance.now();
  #pendingAsync = new Set();

  constructor(idbDatabaseName = 'wa-sqlite', options = DEFAULT_OPTIONS) {
    super();
    this.name = idbDatabaseName;
    this.#options = Object.assign({}, DEFAULT_OPTIONS, options);
    this.#idb = new IDBContext(openDatabase(idbDatabaseName), {
      durability: this.#options.durability
    });
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
      log(`xOpen ${name} 0x${fileId.toString(16)} 0x${flags.toString(16)}`);

      try {
        // Filenames can be URLs, possibly with query parameters.
        const url = new URL(name, 'http://localhost/');
        /** @type {OpenedFileEntry} */ const file = {
          path: url.pathname,
          flags,
          block0: null,
          isMetadataChanged: true,
          locks: new WebLocks(url.pathname)
        };
        this.#mapIdToFile.set(fileId, file);

        // Read the first block, which also contains the file metadata.
        await this.#idb.run('readwrite', async ({blocks}) => {
          file.block0 = await blocks.get(this.#bound(file, 0));
          if (!file.block0) {
            if (flags & VFS.SQLITE_OPEN_CREATE) {
              file.block0 = {
                path: file.path,
                offset: 0,
                version: 0,
                data: new Uint8Array(0),
                fileSize: 0
              };
              blocks.put(file.block0);
            } else {
              throw new Error(`file not found: ${file.path}`);
            }
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
              blocks.delete(IDBKeyRange.bound([file.path], [file.path, []]));
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
        // Read as many blocks as necessary to satisfy the read request.
        // Usually a read fits within a single write but there is at least
        // one case - rollback after journal spill - where reads cross
        // write boundaries so we have to allow for that.
        const result = await this.#idb.run('readonly', async ({blocks}) => {
          let pDataOffset = 0;
          while (pDataOffset < pData.byteLength) {
            // Fetch the IndexedDB block for this file location.
            const fileOffset = iOffset + pDataOffset;
            /** @type {FileBlock} */
            const block = fileOffset < file.block0.data.byteLength ?
              file.block0 :
              await blocks.get(this.#bound(file, -fileOffset));

            if (!block || block.data.byteLength - block.offset <= fileOffset) {
              pData.fill(0, pDataOffset);
              return VFS.SQLITE_IOERR_SHORT_READ;
            }

            const buffer = pData.subarray(pDataOffset);
            const blockOffset = fileOffset + block.offset;
            const nBytesToCopy = Math.min(
              Math.max(block.data.byteLength - blockOffset, 0), // source bytes
              buffer.byteLength);                               // destination bytes
            buffer.set(block.data.subarray(blockOffset, blockOffset + nBytesToCopy));
            pDataOffset += nBytesToCopy;
          }
          return VFS.SQLITE_OK;
        });
        return result;
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
    // Handle asynchronously every MAX_TASK_MILLIS milliseconds. This is
    // tricky because Asyncify calls asynchronous methods twice: once
    // to initiate the call and unwinds the stack, then rewinds the
    // stack and calls again to retrieve the completed result.
    const rewound = this.#pendingAsync.has(fileId);
    if (rewound || performance.now() - this.#taskTimestamp > MAX_TASK_MILLIS) {
      const result = this.handleAsync(async () => {
        if (this.handleAsync !== super.handleAsync) {
          this.#pendingAsync.add(fileId);
        }
        await new Promise(resolve => setTimeout(resolve));

        const result = this.#xWriteHelper(fileId, pData, iOffset);
        this.#taskTimestamp = performance.now();
        return result;
      });

      if (rewound) this.#pendingAsync.delete(fileId);
      return result;
    }
    return this.#xWriteHelper(fileId, pData, iOffset);
  }

  /**
   * @param {number} fileId 
   * @param {Uint8Array} pData 
   * @param {number} iOffset
   * @returns {number}
   */
  #xWriteHelper(fileId, pData, iOffset) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xWrite ${file.path} ${pData.byteLength} ${iOffset}`);

    try {
      // Update file size if appending.
      const prevFileSize = file.block0.fileSize;
      if (file.block0.fileSize < iOffset + pData.byteLength) {
        file.block0.fileSize = iOffset + pData.byteLength;
        file.isMetadataChanged = true;
      }

      // Convert the write directly into an IndexedDB object. Our assumption
      // is that SQLite will only overwrite data with an xWrite of the same
      // offset and size unless the database page size changes, except when
      // changing database page size which is handled by #reblockIfNeeded().
      const block = iOffset === 0 ? file.block0 : {
        path: file.path,
        offset: -iOffset,
        version: file.block0.version,
        data: null
      };
      block.data = pData.slice();

      if (file.changedPages) {
        // This write is part of a batch atomic write. All writes in the
        // batch have a new version, so update the changed list to allow
        // old versions to be eventually deleted.
        if (prevFileSize === file.block0.fileSize) {
          file.changedPages.add(-iOffset);
        }

        // Defer writing block 0 to IndexedDB until batch commit.
        if (iOffset !== 0) {
          this.#idb.run('readwrite', ({blocks}) => blocks.put(block));
        }
      } else {
        // Not a batch atomic write so write through.
        this.#idb.run('readwrite', ({blocks}) => blocks.put(block));
      }

      // Clear dirty flag if page 0 was written.
      file.isMetadataChanged = iOffset === 0 ? false : file.isMetadataChanged;
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
      Object.assign(file.block0, {
        fileSize: iSize,
        data: file.block0.data.slice(0, iSize)
      });

      // Delete all blocks beyond the file size and update metadata.
      // This is never called within a transaction.
      const block0 = Object.assign({}, file.block0);
      this.#idb.run('readwrite', ({blocks})=> {
        blocks.delete(this.#bound(file, -Infinity, -iSize));
        blocks.put(block0);
      });
      return VFS.SQLITE_OK;
    } catch (e) {
      console.error(e);
      return VFS.SQLITE_IOERR;
    }
  }

  /**
   * @param {number} fileId 
   * @param {number} flags 
   * @returns {number}
   */
  xSync(fileId, flags) {
    // Skip IndexedDB sync if durability is relaxed and the last
    // sync was recent enough.
    const rewound = this.#pendingAsync.has(fileId);
    if (rewound || this.#options.durability !== 'relaxed' ||
        performance.now() - this.#taskTimestamp > MAX_TASK_MILLIS) {
      const result = this.handleAsync(async () => {
        if (this.handleAsync !== super.handleAsync) {
          this.#pendingAsync.add(fileId);
        }

        const result = await this.#xSyncHelper(fileId, flags);
        this.#taskTimestamp = performance.now();
        return result;
      });

      if (rewound) this.#pendingAsync.delete(fileId);
      return result;
    }

    const file = this.#mapIdToFile.get(fileId);
    log(`xSync ${file.path} ${flags}`);
    return VFS.SQLITE_OK;
  }

  /**
   * @param {number} fileId 
   * @param {number} flags 
   * @returns {Promise<number>}
   */
  async #xSyncHelper(fileId, flags) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xSync ${file.path} ${flags}`);
    try {
      if (file.isMetadataChanged) {
        // Metadata has changed so write block 0 to IndexedDB.
        this.#idb.run('readwrite', async ({blocks}) => {
          await blocks.put(file.block0);
        }); 
        file.isMetadataChanged = false;
      }
      await this.#idb.sync();
    } catch (e) {
      console.error(e);
      return VFS.SQLITE_IOERR;
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

    pSize64.setBigInt64(0, BigInt(file.block0.fileSize), true)
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
      log(`xLock ${file.path} ${flags}`);

      try {
        // Acquire the lock.
        const result = await file.locks.lock(flags);
        if (result === VFS.SQLITE_OK && file.locks.state === VFS.SQLITE_LOCK_SHARED) {
          // Update block 0 in case another connection changed it.
          file.block0 = await this.#idb.run('readonly', ({blocks}) => {
            return blocks.get(this.#bound(file, 0));
          });
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
      log(`xUnlock ${file.path} ${flags}`);
      
      try {
        return file.locks.unlock(flags);
      } catch(e) {
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
    return SECTOR_SIZE;
  }

  /**
   * @param {number} fileId 
   * @returns {number}
   */
  xDeviceCharacteristics(fileId) {
    log('xDeviceCharacteristics');
    return VFS.SQLITE_IOCAP_BATCH_ATOMIC |
           VFS.SQLITE_IOCAP_SAFE_APPEND |
           VFS.SQLITE_IOCAP_SEQUENTIAL |
           VFS.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN;
  }

  /**
   * @param {number} fileId 
   * @param {number} op 
   * @param {DataView} pArg 
   * @returns {number}
   */
  xFileControl(fileId, op, pArg) {
    const file = this.#mapIdToFile.get(fileId);
    log(`xFileControl ${file.path} ${op}`);

    switch (op) {
      case 11: //SQLITE_FCNTL_OVERWRITE
        // This called on VACUUM. Set a flag so we know whether to check
        // later if the page size changed.
        file.overwrite = true;
        return VFS.SQLITE_OK;

      case 21: // SQLITE_FCNTL_SYNC
        // This is called at the end of each database transaction, whether
        // it is batch atomic or not. Handle page size changes here.
        if (file.overwrite) {
          // As an optimization we only check for and handle a page file
          // changes if we know a VACUUM has been done because handleAsync()
          // has to unwind and rewind the stack. We must be sure to follow
          // the same conditional path in both calls.
          try {
            return this.handleAsync(async () => {
              await this.#reblockIfNeeded(file);
              return VFS.SQLITE_OK;
            });
          } catch (e) {
            console.error(e);
            return VFS.SQLITE_IOERR;
          }
        }

        if (file.isMetadataChanged) {
          // Metadata has changed so write block 0 to IndexedDB.
          try {
            this.#idb.run('readwrite', async ({blocks}) => {
              await blocks.put(file.block0);
            });
            file.isMetadataChanged = false;
          } catch (e) {
            console.error(e);
            return VFS.SQLITE_IOERR;
          }
        }
        return VFS.SQLITE_OK;

      case 22: // SQLITE_FCNTL_COMMIT_PHASETWO
        // This is called after a commit is completed.
        file.overwrite = false;
        return VFS.SQLITE_OK;

      case 31: // SQLITE_FCNTL_BEGIN_ATOMIC_WRITE
        return this.handleAsync(async () => {
          try {
            // Prepare a new version for IndexedDB blocks.
            file.block0.version--;
            file.changedPages = new Set();

            // Clear blocks from abandoned transactions that would conflict
            // with the new transaction.
            this.#idb.run('readwrite', async ({blocks}) => {
              const keys = await blocks.index('version').getAllKeys(IDBKeyRange.bound(
                [file.path],
                [file.path, file.block0.version]));
              for (const key of keys) {
                blocks.delete(key);
              }
            });
            return VFS.SQLITE_OK;
          } catch (e) {
            console.error(e);
            return VFS.SQLITE_IOERR;
          }
        });

      case 32: // SQLITE_FCNTL_COMMIT_ATOMIC_WRITE
        try {
          const block0 = Object.assign({}, file.block0);
          block0.data = block0.data.slice();
          const changedPages = file.changedPages;
          file.changedPages = null;
          file.isMetadataChanged = false;
          this.#idb.run('readwrite', async ({blocks})=> {
            // Write block 0 to commit the new version.
            blocks.put(block0);

            // Blocks to purge are saved in a special IndexedDB object with
            // an "index" of "purge". Add pages changed by this transaction.
            const purgeBlock = await blocks.get([file.path, 'purge', 0]) ?? {
              path: file.path,
              offset: 'purge',
              version: 0,
              data: new Map(),
              count: 0
            };

            purgeBlock.count += changedPages.size;
            for (const pageIndex of changedPages) {
              purgeBlock.data.set(pageIndex, block0.version);
            }

            blocks.put(purgeBlock);
            this.#maybePurge(file.path, purgeBlock.count);
          });
          return VFS.SQLITE_OK;
        } catch (e) {
          console.error(e);
          return VFS.SQLITE_IOERR;
        }

      case 33: // SQLITE_FCNTL_ROLLBACK_ATOMIC_WRITE
        return this.handleAsync(async () => {
          try {
            // Restore original state. Objects for the abandoned version will
            // be left in IndexedDB to be removed by the next atomic write
            // transaction.
            file.changedPages = null;
            file.isMetadataChanged = false;
            file.block0 = await this.#idb.run('readonly', ({blocks}) => {
              return blocks.get([file.path, 0, file.block0.version + 1]);
            });
            return VFS.SQLITE_OK;
          } catch (e) {
            console.error(e);
            return VFS.SQLITE_IOERR;
          }
        });

      default:
        return VFS.SQLITE_NOTFOUND;
    }
  }

  /**
   * @param {string} name 
   * @param {number} flags 
   * @param {DataView} pResOut 
   * @returns {number}
   */
  xAccess(name, flags, pResOut) {
    return this.handleAsync(async () => {
      try {
        const path = new URL(name, 'file://localhost/').pathname;
        log(`xAccess ${path} ${flags}`);

        // Check if block 0 exists.
        const key = await this.#idb.run('readonly', ({blocks}) => {
          return blocks.getKey(this.#bound({path}, 0));
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
        this.#idb.run('readwrite', ({blocks}) => {
          return blocks.delete(IDBKeyRange.bound([path], [path, []]));
        });
        if (syncDir) {
          await this.#idb.sync();
        }
        return VFS.SQLITE_OK;
      } catch (e) {
        console.error(e);
        return VFS.SQLITE_IOERR;
      }
    });
  }

  /**
   * Purge obsolete blocks from a database file.
   * @param {string} path 
   */
  async purge(path) {
    const start = Date.now();
    await this.#idb.run('readwrite', async ({blocks}) => {
      const purgeBlock = await blocks.get([path, 'purge', 0]);
      if (purgeBlock) {
        for (const [pageOffset, version] of purgeBlock.data) {
          blocks.delete(IDBKeyRange.bound(
            [path, pageOffset, version],
            [path, pageOffset, Infinity],
            true, false));
        }
        await blocks.delete([path, 'purge', 0]);
      }
      log(`purge ${path} ${purgeBlock?.data.size ?? 0} pages in ${Date.now() - start} ms`);
    });
  }

  /**
   * Conditionally schedule a purge task.
   * @param {string} path 
   * @param {number} nPages 
   */
  #maybePurge(path, nPages) {
    if (this.#options.purge === 'manual' ||
        this.#pendingPurges.has(path) ||
        nPages < this.#options.purgeAtLeast) {
      // No purge needed.
      return;
    }
    
    if (globalThis.requestIdleCallback) {
      globalThis.requestIdleCallback(() => {
        this.purge(path);
        this.#pendingPurges.delete(path)
      });
    } else {
      setTimeout(() => {
        this.purge(path);
        this.#pendingPurges.delete(path)
      });
    }
    this.#pendingPurges.add(path);
  }

  #bound(file, begin, end = 0) {
    // Fetch newest block 0. For other blocks, use block 0 version.
    const version = !begin || -begin < file.block0.data.length ?
      -Infinity :
      file.block0.version;
    return IDBKeyRange.bound(
      [file.path, begin, version],
      [file.path, end, Infinity]);
  }

  // The database page size can be changed with PRAGMA page_size and VACUUM.
  // The updated file will be overwritten with a regular transaction using
  // the old page size. After that it will be read and written using the
  // new page size, so the IndexedDB objects must be combined or split
  // appropriately.
  async #reblockIfNeeded(file) {
    const oldPageSize = file.block0.data.length;
    if (oldPageSize < 18) return; // no page size defined

    const view = new DataView(file.block0.data.buffer, file.block0.data.byteOffset);
    let newPageSize = view.getUint16(16);
    if (newPageSize === 1) newPageSize = 65536;
    if (newPageSize === oldPageSize) return; // no page size change

    const maxPageSize = Math.max(oldPageSize, newPageSize);
    const nOldPages = maxPageSize / oldPageSize;
    const nNewPages = maxPageSize / newPageSize;

    const newPageCount = view.getUint32(28);
    const fileSize = newPageCount * newPageSize;

    const version = file.block0.version;
    await this.#idb.run('readwrite', async ({blocks}) => {
      // When the block size changes, the entire file is rewritten. Delete
      // all blocks older than block 0 to leave a single version at every
      // offset.
      const keys = await blocks.index('version').getAllKeys(IDBKeyRange.bound(
        [file.path, version + 1],
        [file.path, Infinity]
      ));
      for (const key of keys) {
        blocks.delete(key);
      }
      blocks.delete([file.path, 'purge', 0]);

      // Do the conversion in chunks of the larger of the page sizes.
      for (let iOffset = 0; iOffset < fileSize; iOffset += maxPageSize) {
        // Fetch nOldPages. They can be fetched in one request because
        // there is now a single version in the file.
        const oldPages = await blocks.getAll(
          IDBKeyRange.lowerBound([file.path, -(iOffset + maxPageSize), Infinity]),
          nOldPages);
        for (const oldPage of oldPages) {
          blocks.delete([oldPage.path, oldPage.offset, oldPage.version]);
        }

        // Convert to new pages.
        if (nNewPages === 1) {
          // Combine nOldPages old pages into a new page.
          const buffer = new Uint8Array(newPageSize);
          for (const oldPage of oldPages) {
            buffer.set(oldPage.data, -(iOffset + oldPage.offset));
          }
          const newPage = {
            path: file.path,
            offset: -iOffset,
            version,
            data: buffer
          };
          if (newPage.offset === 0) {
            newPage.fileSize = fileSize;
            file.block0 = newPage;
          }
          blocks.put(newPage);
        } else {
          // Split an old page into nNewPages new pages.
          const oldPage = oldPages[0];
          for (let i = 0; i < nNewPages; ++i) {
            const offset = -(iOffset + i * newPageSize);
            if (-offset >= fileSize) break;
            const newPage = {
              path: oldPage.path,
              offset,
              version,
              data: oldPage.data.subarray(i * newPageSize, (i + 1) * newPageSize)
            }
            if (newPage.offset === 0) {
              newPage.fileSize = fileSize;
              file.block0 = newPage;
            }
            blocks.put(newPage);
          }
        }
      }
    });
  }
}

function openDatabase(idbDatabaseName) {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(idbDatabaseName, 5);
    request.addEventListener('upgradeneeded', function() {
      const blocks = request.result.createObjectStore('blocks', {
        keyPath: ['path', 'offset', 'version']
      });
      blocks.createIndex('version', ['path', 'version']);
    });
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error);
    });
  });
}