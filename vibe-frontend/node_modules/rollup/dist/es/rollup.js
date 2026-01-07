/*
  @license
	Rollup.js v4.55.1
	Mon, 05 Jan 2026 10:23:35 GMT - commit 299cc46f3059a72b1e37b80c688a6d88c6c5f3fd

	https://github.com/rollup/rollup

	Released under the MIT License.
*/
export { version as VERSION, defineConfig, rollup, watch } from './shared/node-entry.js';
import './shared/parseAst.js';
import '../native.js';
import 'node:path';
import 'path';
import 'node:process';
import 'node:perf_hooks';
import 'node:fs/promises';
