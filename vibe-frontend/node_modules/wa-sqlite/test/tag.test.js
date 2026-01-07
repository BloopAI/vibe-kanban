import { getSQLite } from './api-instances.js';
import { createTag } from '../src/examples/tag.js';

describe('tag', function() {
  /** @type {SQLiteAPI} */ let sqlite3;
  beforeAll(async function() {
    sqlite3 = await getSQLite();
  });

  let db;
  let sql;
  beforeEach(async function() {
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

    sql = createTag(sqlite3, db);
  });

  afterEach(async function() {
    await sqlite3.close(db);
  });

  it('returns rows', async function() {
    const result = await sql`
      DROP TABLE IF EXISTS abc;
      SELECT 6 * 7, 6 * 9;
      CREATE TABLE abc (x, y);
      INSERT INTO abc VALUES ('foo', 0.5), ('bar', NULL);
      SELECT * FROM abc;
    `;
    expect(result).toEqual([
      {
        "columns": ["6 * 7", "6 * 9"],
        "rows": [
          [42, 54]
        ]
      },
      {
        "columns": ["x", "y"],
        "rows": [
          ["foo", 0.5],
          ["bar", null]
        ]
      }
    ]);
  });
});