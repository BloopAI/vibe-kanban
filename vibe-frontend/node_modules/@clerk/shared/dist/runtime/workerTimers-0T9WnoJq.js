const require_noop = require('./noop-Bi5xtB31.js');

//#region src/workerTimers/workerTimers.built.ts
/**
*
* This is the minified string output of transforming workerTimers.worker.ts
* Once the tsdown docs are complete, we will write a similar plugin as the one below:
*
* (this was the previous esbuild plugin we were using)
* export const WebWorkerMinifyPlugin: Plugin = {
*  name: 'WebWorkerMinifyPlugin',
* setup(build) {
*   build.onLoad({ filter: /\.worker\.ts/ }, async args => {
*     console.log('aaaaaaaaaaaaa');
*     const f = await readFile(args.path);
*     const js = await esbuild.transform(f, { loader: 'ts', minify: true });
*     return { loader: 'text', contents: js.code };
*   });
* },
* };
*
*/
var workerTimers_built_default = "const respond=r=>{self.postMessage(r)},workerToTabIds={};self.addEventListener(\"message\",r=>{const e=r.data;switch(e.type){case\"setTimeout\":workerToTabIds[e.id]=setTimeout(()=>{respond({id:e.id}),delete workerToTabIds[e.id]},e.ms);break;case\"clearTimeout\":workerToTabIds[e.id]&&(clearTimeout(workerToTabIds[e.id]),delete workerToTabIds[e.id]);break;case\"setInterval\":workerToTabIds[e.id]=setInterval(()=>{respond({id:e.id})},e.ms);break;case\"clearInterval\":workerToTabIds[e.id]&&(clearInterval(workerToTabIds[e.id]),delete workerToTabIds[e.id]);break}});\n";

//#endregion
//#region src/workerTimers/createWorkerTimers.ts
const createWebWorker = (source, opts = {}) => {
	if (typeof Worker === "undefined") return null;
	try {
		const blob = new Blob([source], { type: "application/javascript; charset=utf-8" });
		const workerScript = globalThis.URL.createObjectURL(blob);
		return new Worker(workerScript, opts);
	} catch {
		console.warn("Clerk: Cannot create worker from blob. Consider adding worker-src blob:; to your CSP");
		return null;
	}
};
const fallbackTimers = () => {
	return {
		setTimeout: globalThis.setTimeout.bind(globalThis),
		setInterval: globalThis.setInterval.bind(globalThis),
		clearTimeout: globalThis.clearTimeout.bind(globalThis),
		clearInterval: globalThis.clearInterval.bind(globalThis),
		cleanup: require_noop.noop
	};
};
const createWorkerTimers = () => {
	let id = 0;
	const generateId = () => id++;
	const callbacks = /* @__PURE__ */ new Map();
	const post = (w, p) => w?.postMessage(p);
	const handleMessage = (e) => {
		callbacks.get(e.data.id)?.();
	};
	let worker = createWebWorker(workerTimers_built_default, { name: "clerk-timers" });
	worker?.addEventListener("message", handleMessage);
	if (!worker) return fallbackTimers();
	const init = () => {
		if (!worker) {
			worker = createWebWorker(workerTimers_built_default, { name: "clerk-timers" });
			worker?.addEventListener("message", handleMessage);
		}
	};
	const cleanup = () => {
		if (worker) {
			worker.terminate();
			worker = null;
			callbacks.clear();
		}
	};
	const setTimeout = (cb, ms) => {
		init();
		const id$1 = generateId();
		callbacks.set(id$1, () => {
			cb();
			callbacks.delete(id$1);
		});
		post(worker, {
			type: "setTimeout",
			id: id$1,
			ms
		});
		return id$1;
	};
	const setInterval = (cb, ms) => {
		init();
		const id$1 = generateId();
		callbacks.set(id$1, cb);
		post(worker, {
			type: "setInterval",
			id: id$1,
			ms
		});
		return id$1;
	};
	const clearTimeout = (id$1) => {
		init();
		callbacks.delete(id$1);
		post(worker, {
			type: "clearTimeout",
			id: id$1
		});
	};
	const clearInterval = (id$1) => {
		init();
		callbacks.delete(id$1);
		post(worker, {
			type: "clearInterval",
			id: id$1
		});
	};
	return {
		setTimeout,
		setInterval,
		clearTimeout,
		clearInterval,
		cleanup
	};
};

//#endregion
Object.defineProperty(exports, 'createWorkerTimers', {
  enumerable: true,
  get: function () {
    return createWorkerTimers;
  }
});
//# sourceMappingURL=workerTimers-0T9WnoJq.js.map