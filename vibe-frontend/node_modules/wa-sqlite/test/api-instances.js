import SQLiteESMFactory from '../dist/wa-sqlite.mjs';
import SQLiteAsyncESMFactory from '../dist/wa-sqlite-async.mjs';
import * as SQLite from '../src/sqlite-api.js';

export const getSQLite = (function() {
  const sqlite3 = SQLiteESMFactory().then(module => {
    return SQLite.Factory(module);
  });
  return () => sqlite3;
})();

export const getSQLiteAsync = (function() {
  const sqlite3 = SQLiteAsyncESMFactory().then(module => {
    return SQLite.Factory(module);
  });
  return () => sqlite3;
})();