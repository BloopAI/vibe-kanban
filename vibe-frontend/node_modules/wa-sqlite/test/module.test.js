import { getSQLite, getSQLiteAsync } from './api-instances.js';
import { ArrayModule } from '../src/examples/ArrayModule.js';
import { ArrayAsyncModule } from '../src/examples/ArrayAsyncModule.js';
import GOOG from './GOOG.js';

function common(ModuleClass, setup) {
  it('create/read', async function() {
    /** @type {SQLiteAPI} */ const sqlite3 = setup.sqlite3;
    const db = setup.db;

    const module = new ModuleClass(
      sqlite3, db,
      GOOG.rows, GOOG.columns.map(column => column.toString()));
    sqlite3.create_module(db, 'GOOG', module);

    const results = [];
    await sqlite3.exec(db, `
      CREATE VIRTUAL TABLE vt USING GOOG;
      SELECT COUNT(*), AVG(Volume) FROM vt WHERE Close > Open;
      DROP TABLE vt;
    `, function(row) { results.push(row); });
    expect(results[0][0]).toBeGreaterThan(0);
    expect(results[0][1]).toBeGreaterThan(0);
  });

  it('mutate', async function() {
    /** @type {SQLiteAPI} */ const sqlite3 = setup.sqlite3;
    const db = setup.db;
    
    const array = [['existing', Math.PI]];
    const module = new ModuleClass(
      sqlite3, db,
      array, ['x', 'y']);
    sqlite3.create_module(db, 'imod', module);

    const results = [];
    await sqlite3.exec(db, `
      CREATE VIRTUAL TABLE xvt USING imod;
      INSERT INTO xvt VALUES ('foo', 42), ('bar', NULL);
      SELECT * FROM xvt;
    `, function(row) { results.push(row); });
    expect(array.length).toBe(3);
    expect(array[1]).toEqual(['foo', 42]);
    expect(array[2]).toEqual(['bar', null]);
    expect(results).toEqual(array);

    results.splice(0, results.length);
    await sqlite3.exec(db, `
      DELETE FROM xvt WHERE x = 'foo';
      SELECT * FROM xvt;
      DROP TABLE xvt
    `, function(row) { results.push(row); });
    expect(array.length).toBe(3);
    expect(array[1]).toBe(null);
  });
}

describe('ArrayModule', function() {
  const setup = {};
  beforeAll(async function() {
    setup.sqlite3 = await getSQLite();
  });

  beforeEach(async function() {
    setup.db = await setup.sqlite3.open_v2('module');
  });

  afterEach(async function() {
    await setup.sqlite3.close(setup.db);
  });

  common(ArrayModule, setup);
});

describe('ArrayAsyncModule', function() {
  const setup = {};
  beforeAll(async function() {
    setup.sqlite3 = await getSQLiteAsync();
  });

  beforeEach(async function() {
    setup.db = await setup.sqlite3.open_v2('module');
  });

  afterEach(async function() {
    await setup.sqlite3.close(setup.db);
  });

  common(ArrayAsyncModule, setup);
});