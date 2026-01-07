import { getSQLite, getSQLiteAsync } from './api-instances.js';
import * as SQLite from '../src/sqlite-api.js';
import sinon from '../.yarn/unplugged/sinon-npm-15.0.1-115ae39e4c/node_modules/sinon/pkg/sinon-esm.js';


const LIBVERSION = '3.44.0';
const LIBVERSION_NUMBER = (function () {
  const version = LIBVERSION.split('.');
  return parseInt(version[0] + version[1].padStart(3, '0') + version[2].padStart(3, '0'));
})();

// Shared test definitions for sync and async.
function shared(sqlite3Ready) {
  /** @type {SQLiteAPI} */ let sqlite3;
  let db;
  beforeEach(async function () {
    sqlite3 = await sqlite3Ready;
    db = await sqlite3.open_v2('foo');

    // Delete all tables.
    const tables = [];
    await sqlite3.exec(db, `
      SELECT name FROM sqlite_master WHERE type='table';
    `, row => {
      tables.push(row[0]);
    });
    for (const table of tables) {
      await sqlite3.exec(db, `DROP TABLE ${table}`);
    }
  });

  afterEach(async function () {
    await sqlite3.close(db);
    sinon.restore();
  });

  it('version', async function () {
    const sVersion = sqlite3.libversion();
    expect(sVersion).toBe(LIBVERSION);

    const nVersion = sqlite3.libversion_number();
    expect(nVersion).toBe(LIBVERSION_NUMBER);
  });

  it('prepare', async function () {
    const str = sqlite3.str_new(db);
    sqlite3.str_appendall(str, 'SELECT 1 + 1');
    const prepared = await sqlite3.prepare_v2(db, sqlite3.str_value(str));
    expect(typeof prepared.stmt).toBe('number');
    expect(sqlite3.column_name(prepared.stmt, 0)).toBe('1 + 1');
    expect(sqlite3.sql(prepared.stmt)).toBe('SELECT 1 + 1');
    await sqlite3.finalize(prepared.stmt);
    sqlite3.str_finish(str);
  });

  it('bind', async function () {
    await sqlite3.exec(db, `
      CREATE TABLE tbl (id, cBlob, cDouble, cInt, cNull, cText);
    `);

    const str = sqlite3.str_new(db);
    sqlite3.str_appendall(str, `
      INSERT INTO tbl VALUES (:Id, :cBlob, :cDouble, :cInt, :cNull, :cText);
    `);
    const prepared = await sqlite3.prepare_v2(db, sqlite3.str_value(str));

    let result;
    const cBlob = new Uint8Array([8, 6, 7, 5, 3, 0, 9]);
    const cDouble = Math.PI;
    const cInt = 42;
    const cNull = null;
    const cText = 'foobar';

    result = sqlite3.bind_collection(prepared.stmt, [
      'array', cBlob, cDouble, cInt, cNull, cText
    ]);
    expect(result).toBe(SQLite.SQLITE_OK);
    result = await sqlite3.step(prepared.stmt);
    expect(result).toBe(SQLite.SQLITE_DONE);
    result = await sqlite3.reset(prepared.stmt);
    expect(result).toBe(SQLite.SQLITE_OK);

    result = sqlite3.bind_collection(prepared.stmt, {
      ':Id': 'object',
      ':cBlob': cBlob,
      ':cDouble': cDouble,
      ':cInt': cInt,
      ':cNull': cNull,
      ':cText': cText
    });
    expect(result).toBe(SQLite.SQLITE_OK);
    result = await sqlite3.step(prepared.stmt);
    expect(result).toBe(SQLite.SQLITE_DONE);
    result = await sqlite3.reset(prepared.stmt);
    expect(result).toBe(SQLite.SQLITE_OK);

    result = await sqlite3.finalize(prepared.stmt);
    expect(result).toBe(SQLite.SQLITE_OK);
    sqlite3.str_finish(str);

    const results = [];
    await sqlite3.exec(
      db, `
        SELECT cBlob, cDouble, cInt, cNull, cText FROM tbl;
      `,
      function (rowData, columnNames) {
        rowData = rowData.map(value => {
          // Blob results do not remain valid so copy to retain.
          return value instanceof Uint8Array ? Array.from(value) : value;
        });
        results.push(rowData);
      });

    const expected = [Array.from(cBlob), cDouble, cInt, cNull, cText];
    expect(results[0]).toEqual(expected);
    expect(results[1]).toEqual(expected);
  });

  it('exec', async function () {
    // Without callback.
    await sqlite3.exec(
      db, `
      CREATE TABLE tableA (x, y);
      INSERT INTO tableA VALUES (1, 2);
    `);

    // With callback.
    const rows = [];
    await sqlite3.exec(
      db, `
      CREATE TABLE tableB (a, b, c);
      INSERT INTO tableB VALUES ('foo', 'bar', 'baz');
      INSERT INTO tableB VALUES ('how', 'now', 'brown');
      SELECT * FROM tableA;
      SELECT * FROM tableB;
      `,
      function (row, columns) {
        switch (columns.length) {
          case 2:
            expect(columns).toEqual(['x', 'y']);
            break;
          case 3:
            expect(columns).toEqual(['a', 'b', 'c']);
            break;
          default:
            fail();
            break;
        }
        rows.push(row);
      });

    expect(rows).toEqual([
      [1, 2],
      ['foo', 'bar', 'baz'],
      ['how', 'now', 'brown']
    ]);
  });

  it('execWithParams', async function () {
    await sqlite3.exec(
      db, `
      CREATE TABLE tableX (x, y);
      INSERT INTO tableX VALUES (1, 2);
    `);
    const queryResult = await sqlite3.execWithParams(db, `SELECT * FROM tableX WHERE x=?`, [1])
    expect(queryResult.columns.length).toBe(2)
    expect(queryResult.rows.length).toBe(1)
    expect(queryResult.rows[0].length).toBe(2)
    expect(queryResult.rows[0][0]).toBe(1)
    expect(queryResult.rows[0][1]).toBe(2)
  });

  it('executeBatch', async function () {
    await sqlite3.exec(
      db, `
      CREATE TABLE tableX (x, y);
      INSERT INTO tableX VALUES (1, 2);
    `);
    const executeResult = await sqlite3.executeBatch(db, [
      `INSERT INTO tableX VALUES (2, 3)`,
      `INSERT INTO tableX VALUES (4, 5)`,
      `INSERT INTO tableX VALUES (?, ?)`,
    ], [null, null, [6, 7]])
    expect(executeResult).toBe(SQLite.SQLITE_OK)
    const queryResult = await sqlite3.execWithParams(db, `SELECT * FROM tableX`, [])
    expect(queryResult.rows.length).toBe(4)
  });

  it('reset', async function () {
    await sqlite3.exec(
      db, `
      CREATE TABLE tbl (x);
      INSERT INTO tbl VALUES ('a'), ('b'), ('c');
    `);
    expect(sqlite3.changes(db)).toBe(3);

    let count = 0;
    for await (const stmt of sqlite3.statements(db, 'SELECT x FROM tbl ORDER BY x')) {
      await sqlite3.step(stmt);
      expect(sqlite3.column(stmt, 0)).toBe('a');
      await sqlite3.step(stmt);
      expect(sqlite3.column(stmt, 0)).toBe('b');

      await sqlite3.reset(stmt);
      await sqlite3.step(stmt);
      expect(sqlite3.column(stmt, 0)).toBe('a');

      // Reset while rows are still available.
      await sqlite3.reset(stmt);
      await sqlite3.step(stmt);
      expect(sqlite3.column(stmt, 0)).toBe('a');

      ++count;
    }
    expect(count).toBe(1);
  });

  it('function', async function () {
    // Populate a table with each value type, one value per row.
    await sqlite3.exec(db, `CREATE TABLE tbl (value)`);
    const str = sqlite3.str_new(db, `
      INSERT INTO tbl VALUES (?), (?), (?), (?), (?);
    `);
    const prepared = await sqlite3.prepare_v2(db, sqlite3.str_value(str));

    let result;
    const vBlob = new Uint8Array([8, 6, 7, 5, 3, 0, 9]);
    const vDouble = Math.PI;
    const vInt = 42;
    const vNull = null;
    const vText = 'foobar';
    result = sqlite3.bind_collection(prepared.stmt, [
      vBlob, vDouble, vInt, vNull, vText
    ]);
    expect(result).toBe(SQLite.SQLITE_OK);
    result = await sqlite3.step(prepared.stmt);
    expect(result).toBe(SQLite.SQLITE_DONE);
    result = await sqlite3.finalize(prepared.stmt);
    expect(result).toBe(SQLite.SQLITE_OK);

    // This function evaluates to its second argument.
    let appData = null;
    function f(context, values) {
      // Unlikely anyone will ever use this call but check it anyway.
      appData = sqlite3.user_data(context);

      const value = sqlite3.value(values[1]);
      sqlite3.result(context, value);
    }
    result = sqlite3.create_function(
      db, "MyFunc", 2, SQLite.SQLITE_UTF8, 0x1234, f, null, null);
    expect(result).toBe(SQLite.SQLITE_OK);

    // Apply the function to each row.
    const values = [];
    await sqlite3.exec(db, `SELECT MyFunc(0, value) FROM tbl`, row => {
      // Convert Uint8Array to Array for comparison.
      const value = row[0] instanceof Uint8Array ? Array.from(row[0]) : row[0];
      values.push(value);
    });
    const expected = [Array.from(vBlob), vDouble, vInt, vNull, vText];
    expect(values).toEqual(expected);

    expect(appData).toBe(0x1234);
  });

  it('aggregate', async function () {
    // A real aggregate function would need to manage separate
    // invocations by keying off context but that is unnecessary
    // for this test.
    let sum = 0;
    function SumStep(context, values) {
      const value = sqlite3.value_int(values[0]);
      sum += value;
    }
    function SumFinal(context) {
      sqlite3.result(context, sum);
    }

    let result;
    result = sqlite3.create_function(
      db, "MySum", 1, SQLite.SQLITE_UTF8, 0x1234, null, SumStep, SumFinal);
    expect(result).toBe(SQLite.SQLITE_OK);

    await sqlite3.exec(db, `
      CREATE TABLE tbl (value);
      INSERT INTO tbl VALUES (1), (2), (3), (4);
      SELECT MySum(value) FROM tbl;
    `, row => {
      result = row[0];
    });
    expect(result).toBe(10);
  });

  it('authorizer', async function () {
    const calls = [];
    function authFunction(userData, iActionCode, param3, param4, param5, param6) {
      calls.push({ userData, iActionCode, param3, param4, param5, param6 });
      if (iActionCode === SQLite.SQLITE_PRAGMA) {
        return SQLite.SQLITE_DENY;
      }
      return SQLite.SQLITE_OK;
    }

    let result;
    result = sqlite3.set_authorizer(db, authFunction, 42);
    expect(result).toBe(SQLite.SQLITE_OK);

    await sqlite3.exec(db, 'CREATE TABLE foo(x)');
    expect(calls.length).toBeGreaterThan(0);
    const createTable = calls.find(call => call.iActionCode === SQLite.SQLITE_CREATE_TABLE);
    expect(createTable).toBeDefined();
    expect(createTable.userData).toBe(42);
    expect(createTable.param3).toBe('foo');
    expect(createTable.param4).toBe(null);
    expect(createTable.param5).toBe('main');
    expect(createTable.param6).toBe(null);
    calls.splice(0, Infinity);

    await expectAsync(sqlite3.exec(db, 'PRAGMA page_count'))
      .toBeRejectedWithError(/not authorized/);
    calls.splice(0, Infinity);

    result = sqlite3.set_authorizer(db, null, null);
    expect(result).toBe(SQLite.SQLITE_OK);

    await sqlite3.exec(db, 'CREATE TABLE bar(x)');
    expect(calls.length).toBe(0);
  });

  it('limit', async function () {
    let result;
    result = sqlite3.limit(db, SQLite.SQLITE_LIMIT_SQL_LENGTH, -1);
    expect(result).toBeGreaterThan(64);

    sqlite3.limit(db, SQLite.SQLITE_LIMIT_SQL_LENGTH, 8);
    await expectAsync(sqlite3.exec(db, 'PRAGMA page_count'))
      .toBeRejectedWithError(/too big/);
  });

  it('statements', async function () {
    sinon.spy(sqlite3, 'finalize');

    const stmts = [];
    const result = [];
    const iterator = sqlite3.statements(db, `
      SELECT 'foo';
      SELECT 'bar';
      SELECT 'baz';
    `);
    for await (const stmt of iterator) {
      stmts.push(stmt);
      while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
        result.push(sqlite3.column(stmt, 0));
      }
    }
    expect(result).toEqual(['foo', 'bar', 'baz']);
    expect(stmts.length).toBe(3);
    for (const stmt of stmts) {
      // @ts-ignore
      expect(sqlite3.finalize.calledWith(stmt)).toBeTrue();
    }

    // @ts-ignore
    sqlite3.finalize.restore();
  });

  it('statements break', async function () {
    sinon.spy(sqlite3, 'finalize');

    const stmts = [];
    const iterator = sqlite3.statements(db, `
      SELECT 'foo';
      SELECT 'bar';
      SELECT 'baz';
    `);
    for await (const stmt of iterator) {
      stmts.push(stmt);

      // Loop early exit.
      break;
    }

    // The statement should still be finalized.
    // @ts-ignore
    expect(sqlite3.finalize.calledWith(stmts[0])).toBeTrue();

    // @ts-ignore
    sqlite3.finalize.restore();
  });

  it('statements exception', async function () {
    sinon.spy(sqlite3, 'finalize');

    const stmts = [];
    try {
      const iterator = sqlite3.statements(db, `
        SELECT 'foo';
        SELECT 'bar';
        SELECT 'baz';
      `);
      for await (const stmt of iterator) {
        stmts.push(stmt);

        // Loop early exit.
        throw new Error();
      }
    } catch (e) {
      // Ignore
    }

    // The statement should still be finalized.
    // @ts-ignore
    expect(sqlite3.finalize.calledWith(stmts[0])).toBeTrue();

    // @ts-ignore
    sqlite3.finalize.restore();
  });

  it('rollback', async function () {
    let count;
    await sqlite3.exec(db, `
      CREATE TABLE foo (x);
      INSERT INTO foo VALUES ('foo'), ('bar'), ('baz');
      SELECT COUNT(*) FROM foo;
    `, row => count = row[0]);
    expect(count).toBe(3);

    count = undefined;
    await sqlite3.exec(db, `
      BEGIN TRANSACTION;
      WITH numbers(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM numbers LIMIT 100)
        INSERT INTO foo SELECT * FROM numbers;
      SELECT COUNT(*) FROM foo;
    `, row => count = row[0]);
    expect(count).toBe(103);

    count = undefined;
    await sqlite3.exec(db, `
      ROLLBACK;
      SELECT COUNT(*) FROM foo;
    `, row => count = row[0]);
    expect(count).toBe(3);
  });

  it('vacuum', async function () {
    let sum;
    await sqlite3.exec(db, `
      CREATE TABLE foo (x PRIMARY KEY, y, z);
      WITH numbers(n) AS
        (SELECT 1 UNION ALL SELECT n + 1 FROM numbers LIMIT 100)
        INSERT INTO foo SELECT n, n + n, n * n FROM numbers;
      SELECT SUM(x) FROM foo;
    `, row => sum = row[0]);
    expect(sum).toBe(100 * 101 / 2);

    sum = undefined;
    await sqlite3.exec(db, `
      DELETE FROM foo WHERE x > 5.0;
      VACUUM;
      SELECT SUM(x) FROM foo;
    `, row => sum = row[0]);
    expect(sum).toBe(5 * 6 / 2);
  });

  it('should fetch blob column', async function () {
    await sqlite3.exec(
      db, `
      CREATE TABLE t (x);
      INSERT INTO t VALUES (X''), (X'2a'), (X'000102'), (X'deadbeef');
    `);

    // With callback.
    const rows = [];
    await sqlite3.exec(db, `SELECT * FROM t`, function (row) {
      rows.push(row);
    });

    expect(Array.from(rows[0][0])).toEqual([]);
    expect(Array.from(rows[1][0])).toEqual([42]);
    expect(Array.from(rows[2][0])).toEqual([0, 1, 2]);
    expect(Array.from(rows[3][0])).toEqual([...new Uint8Array([0xde, 0xad, 0xbe, 0xef])]);
  });

  it('should handle 64-bit integer with {bind,column}_int64', async function () {
    /** @type {[string, bigint][]} */
    const entries = [
      ['0', 0n],
      ['1', 1n],
      ['2^31 - 1', 0x7fffffffn],
      ['2^31', 0x80000000n],
      ['2^32 - 1', 0xffffffffn],
      ['2^32', 0x100000000n],
      ['2^63 - 1', 0x7fffffffffffffffn],
      ['2^63', -0x8000000000000000n],
      ['2^64 - 1', -1n],
      ['MAX_SAFE_INTEGER', BigInt(Number.MAX_SAFE_INTEGER)],
      ['MIN_SAFE_INTEGER', BigInt(Number.MIN_SAFE_INTEGER)],
    ];
    await sqlite3.exec(db, `CREATE TABLE t (key PRIMARY KEY, value)`);
    for await (const stmt of sqlite3.statements(db, 'INSERT INTO t VALUES (?, ?)')) {
      for (const [key, value] of entries) {
        await sqlite3.reset(stmt);
        sqlite3.bind(stmt, 1, key);
        sqlite3.bind_int64(stmt, 2, value);
        await sqlite3.step(stmt);

        for await (const s of sqlite3.statements(db, `SELECT value FROM t WHERE key='${key}'`)) {
          await sqlite3.step(s);
          const result = sqlite3.column_int64(s, 0)
          expect(result).toEqual(value);
        }
      }
    }
  });

  it('should handle 64-bit integer with {bind,column}', async function () {
    /** @type {[string, bigint][]} */
    const entries = [
      ['0', 0n],
      ['1', 1n],
      ['2^31 - 1', 0x7fffffffn],
      ['2^31', 0x80000000n],
      ['2^32 - 1', 0xffffffffn],
      ['2^32', 0x100000000n],
      ['2^63 - 1', 0x7fffffffffffffffn],
      ['2^63', -0x8000000000000000n],
      ['2^64 - 1', -1n],
      ['MAX_SAFE_INTEGER', BigInt(Number.MAX_SAFE_INTEGER)],
      ['MIN_SAFE_INTEGER', BigInt(Number.MIN_SAFE_INTEGER)],
    ];
    await sqlite3.exec(db, `CREATE TABLE t (key PRIMARY KEY, value)`);
    for await (const stmt of sqlite3.statements(db, 'INSERT INTO t VALUES (?, ?)')) {
      for (const [key, value] of entries) {
        await sqlite3.reset(stmt);
        sqlite3.bind(stmt, 1, key);
        sqlite3.bind(stmt, 2, value);
        await sqlite3.step(stmt);

        for await (const s of sqlite3.statements(db, `SELECT value FROM t WHERE key='${key}'`)) {
          await sqlite3.step(s);
          const result = /** @type {number|bigint} */ (sqlite3.column(s, 0));

          const upcast = BigInt(result);
          if (upcast >= BigInt(Number.MIN_SAFE_INTEGER) &&
            upcast <= BigInt(Number.MAX_SAFE_INTEGER)) {
            expect(typeof result).toEqual('number');
          } else {
            expect(typeof result).toEqual('bigint');
          }
          expect(upcast).toEqual(value);
        }
      }
    }
  });

  it('should handle 64-bit integer in custom function', async function () {
    function f_int64(context, values) {
      const value = sqlite3.value_int64(values[0]);
      sqlite3.result_int64(context, value);
    }
    function f_generic(context, values) {
      const value = sqlite3.value(values[0]);
      sqlite3.result(context, value);
    }
    sqlite3.create_function(
      db, "f_int64", 1, SQLite.SQLITE_UTF8, 0, f_int64, null, null);
    sqlite3.create_function(
      db, "f_generic", 1, SQLite.SQLITE_UTF8, 0, f_generic, null, null);

    /** @type {[string, bigint][]} */
    const entries = [
      ['0', 0n],
      ['1', 1n],
      ['2^31 - 1', 0x7fffffffn],
      ['2^31', 0x80000000n],
      ['2^32 - 1', 0xffffffffn],
      ['2^32', 0x100000000n],
      ['2^63 - 1', 0x7fffffffffffffffn],
      ['2^63', -0x8000000000000000n],
      ['2^64 - 1', -1n],
      ['MAX_SAFE_INTEGER', BigInt(Number.MAX_SAFE_INTEGER)],
      ['MIN_SAFE_INTEGER', BigInt(Number.MIN_SAFE_INTEGER)],
    ];
    for (const [key, value] of entries) {
      await sqlite3.exec(db, `SELECT f_int64(${value}), f_generic(${value})`, function (row) {
        expect(row[0]).toEqual(row[1]);
        expect(BigInt(/** @type {bigint|number} */(row[0]))).toEqual(value);
        expect(BigInt(/** @type {bigint|number} */(row[1]))).toEqual(value);
      });
    }
  });

  it('get_autocommit', async function () {
    expect(sqlite3.get_autocommit(db)).toBeTruthy();

    await sqlite3.exec(db, 'BEGIN TRANSACTION');
    expect(sqlite3.get_autocommit(db)).toBeFalsy();

    await sqlite3.exec(db, 'ROLLBACK');
    expect(sqlite3.get_autocommit(db)).toBeTruthy();
  });

  it('progress_handler', async function () {
    let handlerArg;
    let handlerCount = 0;
    function handler(userData) {
      handlerArg = userData;
      return ++handlerCount > 5 ? 1 : 0;
    }
    sqlite3.progress_handler(db, 1, handler, 42);

    let result;
    result = sqlite3.exec(db, `
      WITH RECURSIVE numbers(n)
        AS (SELECT 1 UNION ALL SELECT n + 1 FROM numbers LIMIT 10)
        SELECT * FROM numbers;
    `);
    await expectAsync(result).toBeRejectedWithError(/interrupted/);
    expect(handlerArg).toBe(42);

    sqlite3.progress_handler(db, 0, null, 42);
    result = sqlite3.exec(db, `
      WITH RECURSIVE numbers(n)
        AS (SELECT 1 UNION ALL SELECT n + 1 FROM numbers LIMIT 10)
        SELECT * FROM numbers;
    `);
    await expectAsync(result).toBeResolved();
  });

  it("update_hook", async function () {
    const calls = [];
    function hook(updateType, dbName, tblName, rowid) {
      calls.push([updateType, dbName, tblName, rowid]);
    }
    sqlite3.update_hook(db, hook);

    // insert some rows
    // last row's row id is max safe integer * 10
    await sqlite3.exec(
      db,
      `
      CREATE TABLE foo (i integer primary key, x);
      INSERT INTO foo VALUES (1, 'foo'), (2, 'bar'), (90071992547409910, 'baz');
    `
    );
    expect(calls).toEqual([
      [18, "main", "foo", 1n],
      [18, "main", "foo", 2n],
      [18, "main", "foo", 90071992547409910n],
    ]);
    calls.length = 0;
    await sqlite3.exec(db, `DELETE FROM foo WHERE i = 2`);
    expect(calls).toEqual([[9, "main", "foo", 2n]]);
    calls.length = 0;
    await sqlite3.exec(db, `UPDATE foo SET x = 'bar' WHERE i = 1`);
    expect(calls).toEqual([[23, "main", "foo", 1n]]);
  });
}

describe('sqlite-api', function () {
  const sqlite3Ready = getSQLite();
  shared(sqlite3Ready);
});

describe('sqlite-api async', function () {
  const sqlite3Ready = getSQLiteAsync();
  shared(sqlite3Ready);
});