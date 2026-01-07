import { createWorkerTimers } from "./workerTimers-mT3yzhis.mjs";

//#region src/poller.ts
function Poller({ delayInMs } = { delayInMs: 1e3 }) {
	const workerTimers = createWorkerTimers();
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
export { Poller };
//# sourceMappingURL=poller-DA-neXTk.mjs.map