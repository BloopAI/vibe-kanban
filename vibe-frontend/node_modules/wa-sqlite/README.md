[![wa-sqlite CI](https://github.com/rhashimoto/wa-sqlite/actions/workflows/ci.yml/badge.svg?branch=breaking-changes)](https://github.com/rhashimoto/wa-sqlite/actions/workflows/ci.yml?branch=breaking-changes)

# wa-sqlite
This is a WebAssembly build of SQLite with experimental support for writing SQLite virtual filesystems and virtual table modules completely in Javascript. This allows alternative browser storage options such as IndexedDB and File System Access. Applications can opt to use either a synchronous or asynchronous (using Asyncify) SQLite library build (an asynchronous build is required for asynchronous extensions).

[IndexedDB](https://github.com/rhashimoto/wa-sqlite/blob/master/src/examples/IDBMinimalVFS.js) and [Origin Private File System](https://github.com/rhashimoto/wa-sqlite/blob/master/src/examples/OriginPrivateFileSystemVFS.js) virtual file systems and a [virtual table module that accesses Javascript arrays](https://github.com/rhashimoto/wa-sqlite/blob/master/src/examples/ArrayModule.js) are among the examples provided as proof of concept.

[Try the demo](https://rhashimoto.github.io/wa-sqlite/demo/) or run [benchmarks](https://rhashimoto.github.io/wa-sqlite/demo/benchmarks.html) with a modern desktop web browser. More information is available in the [FAQ](https://github.com/rhashimoto/wa-sqlite/issues?q=is%3Aissue+label%3Afaq+), [discussion forums](https://github.com/rhashimoto/wa-sqlite/discussions), and [API reference](https://rhashimoto.github.io/wa-sqlite/docs/).

## Build
The primary motivation for this project is to enable additions to SQLite with only Javascript. Most developers should be able to use the pre-built artifacts in
[./dist](https://github.com/rhashimoto/wa-sqlite/tree/master/dist).
Note that earlier versions of the project only provided pre-built artifacts in the
"buildless" branch; that branch will no longer be maintained.

Minor build customization (e.g. changing build defines or flags) can be done with [make arguments](https://github.com/rhashimoto/wa-sqlite/discussions/128), and the helper project [sqwab](https://github.com/rhashimoto/sqwab) can be used to build without a local build environment.

If you do want to build yourself, here are the prerequisites:

* Building on Debian Linux is known to work, compatibility with other platforms is unknown.
* `yarn` - If you use a different package manager (e.g. `npm`) then file paths in the demo will need adjustment.
* [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) 3.1.25+.
* `curl`, `make`, `openssl`, `sed`, `tclsh`, `unzip`

Here are the build steps:
* Make sure `emcc` works.
* `git clone git@github.com:rhashimoto/wa-sqlite.git`
* `cd wa-sqlite`
* `yarn install`
* `make` (or `yarn prepack`)

The default build produces ES6 modules + WASM, [synchronous and asynchronous](https://github.com/rhashimoto/wa-sqlite/issues/7) (using Asyncify) in `dist/`.

## API
Javascript wrappers for core SQLITE C API functions (and some others) are provided. Some convenience functions are also provided to reduce boilerplate. Here's sample code to load the library and call the API:

```javascript
  import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
  import * as SQLite from 'wa-sqlite';

  async function hello() {
    const module = await SQLiteESMFactory();
    const sqlite3 = SQLite.Factory(module);
    const db = await sqlite3.open_v2('myDB');
    await sqlite3.exec(db, `SELECT 'Hello, world!'`, (row, columns) => {
      console.log(row);
    });
    await sqlite3.close(db);
  }

  hello();
```

The [implementation of `sqlite3.exec`](https://github.com/rhashimoto/wa-sqlite/blob/b5824ac0031da81712bee42671a917b252737c45/src/sqlite-api.js#L422-L434) may be of interest to anyone wanting more fine-grained use of SQLite statement objects (e.g. for binding parameters, explicit column datatypes, etc.).

[API reference](https://rhashimoto.github.io/wa-sqlite/docs/)

## Demo
To serve the demo directly from the source tree:
* `yarn start`
* Open a browser on http://localhost:8000/demo/

The demo page provides access to databases on multiple VFS implementations, including IndexedDB (which is the only one persistent across page loads and multiple tabs). In addition, in each database there is a SQLite module named "array" that provides some historical stock data from a common Javascript array - use it for virtual tables in SQL like this:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS goog USING array;

-- Use it directly out of the Javascript array:
SELECT * FROM goog LIMIT 5;

-- Copy into a native table (on the current VFS):
CREATE TABLE IF NOT EXISTS tbl AS SELECT * FROM goog;
```

For convenience, if any text region is selected in the editor, only that region will be executed. In addition, the editor contents are restored across page reloads using browser localStorage.

## License
MIT License as of February 10, 2023, changed by generous sponsors
[Fleet Device Management](https://fleetdm.com/) and [Reflect](https://reflect.app/).
Existing licensees may continue under the GPLv3 or switch to the new license.
