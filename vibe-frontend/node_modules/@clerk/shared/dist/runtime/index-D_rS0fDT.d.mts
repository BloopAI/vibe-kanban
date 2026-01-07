//#region src/workerTimers/workerTimers.types.d.ts
type WorkerTimerId = number;
type WorkerTimeoutCallback = () => void;
type WorkerSetTimeout = (cb: WorkerTimeoutCallback, ms: number) => WorkerTimerId;
type WorkerClearTimeout = (id: WorkerTimerId) => void;
//#endregion
//#region src/workerTimers/createWorkerTimers.d.ts
declare const createWorkerTimers: () => {
  setTimeout: WorkerSetTimeout;
  setInterval: WorkerSetTimeout;
  clearTimeout: WorkerClearTimeout;
  clearInterval: WorkerClearTimeout;
  cleanup: (..._args: any[]) => void;
};
//#endregion
export { createWorkerTimers };
//# sourceMappingURL=index-D_rS0fDT.d.mts.map