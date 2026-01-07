const require_workerTimers = require('./workerTimers-0T9WnoJq.js');

//#region src/poller.ts
function Poller({ delayInMs } = { delayInMs: 1e3 }) {
	const workerTimers = require_workerTimers.createWorkerTimers();
	let timerId;
	let stopped = false;
	const stop = () => {
		if (timerId) {
			workerTimers.clearTimeout(timerId);
			workerTimers.cleanup();
		}
		stopped = true;
	};
	const run = async (cb) => {
		stopped = false;
		await cb(stop);
		if (stopped) return;
		timerId = workerTimers.setTimeout(() => {
			run(cb);
		}, delayInMs);
	};
	return {
		run,
		stop
	};
}

//#endregion
Object.defineProperty(exports, 'Poller', {
  enumerable: true,
  get: function () {
    return Poller;
  }
});
//# sourceMappingURL=poller-CVTUNwuX.js.map