# wa-sqlite example code
These examples are intended to help developers get started with writing extensions,
and to experiment with interesting approaches and techniques. Using them as-is in
production is not prohibited but that isn't their primary purpose.

## VFS examples
### MemoryVFS and MemoryAsyncVFS
These are minimal working examples for writing a VFS. First-time implementers should
probably start by looking at these classes, as well as the
[SQLite VFS documentation](https://www.sqlite.org/vfs.html).

### IDBBatchAtomicVFS
This is a VFS implementation that uses
[batch atomic writes](https://github.com/rhashimoto/wa-sqlite/discussions/47).
This is now the featured IndexedDB VFS for the demo and benchmarks.

### IDBVersionedVFS
This is a VFS implementation that stores
[versioned blocks on IndexedDB](https://github.com/rhashimoto/wa-sqlite/discussions/37).
It uses an interesting hack to avoid storing journal data. No further development
is planned for this class as IDBBatchAtomicVFS provides most of the same advantages
with a cleaner approach.

### IDBMinimalVFS
This is another implementation of VFS on IndexedDB that provides less performance
but is smaller and simpler, and is a good starting point for building a novel
IndexedDB VFS. It is described
[here](https://github.com/rhashimoto/wa-sqlite/discussions/46).

### OriginPrivateFileSystemVFS
This VFS uses the proposed
[Origin Private File System](https://wicg.github.io/file-system-access/#wellknowndirectory-origin-private-file-system)
with the
[Access Handle](https://github.com/WICG/file-system-access/blob/main/AccessHandle.md)
dependent proposal. Note that OPFS works only in a Worker and at this writing is
[not supported on all browsers](https://caniuse.com/native-filesystem-api).

### AccessHandlePoolVFS
This VFS uses the new more synchronous OPFS access handle API as described in
[this discussion](https://github.com/rhashimoto/wa-sqlite/discussions/67)
to implement a synchronous VFS, i.e. one that does not need Asyncify (or
any other mechanism to use Promise with WASM). Note that this approach
does not support SQLite locking so concurrent access would require the
application to provide synchronization.

## Module examples
### ArrayModule and ArrayAsyncModule
These are minimal working examples for writing a
[SQLite module](https://www.sqlite.org/c3ref/module.html),
which is a virtual table creator. They expose a 2D Javascript
array as a SQLite table.

## Utility examples
### WebLocks
There are two helper classes for VFS implementers that use the
[Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
to provide
[SQLite locking semantics](https://www.sqlite.org/lockingv3.html)
for the `xLock()` and `xUnlock()` methods. Both classes provide the
same interface so either one can be used. The IDB VFS classes and
OriginPrivateFileSystemVFS show how.

WebLocksExclusive uses a single exclusive lock, so only one connection can
access the database file at a time, i.e. multiple concurrent readers are
not supported.

WebLocksShared uses shared locking to allow multiple concurrent readers.
Be aware that using this locking implementation means that applications
will need to handle exceptions with a `SQLITE_BUSY` code by rolling back
and replaying any open transaction.

### IDBContext
This is a helper class for IndexedDB VFS implementers that scopes
IndexedDB transactions to reduce the number of transactions needed.
See its use in IDBBatchAtomicVFS and IDBMinimalVFS.

### tag
This is a template tag function generator that can be used to
provide syntactic sugar for embedding SQL in Javascript.
