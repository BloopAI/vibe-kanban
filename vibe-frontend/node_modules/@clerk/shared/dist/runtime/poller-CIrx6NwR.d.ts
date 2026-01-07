//#region src/poller.d.ts
type PollerStop = () => void;
type PollerCallback = (stop: PollerStop) => Promise<unknown>;
type PollerRun = (cb: PollerCallback) => Promise<void>;
type PollerOptions = {
  delayInMs: number;
};
type Poller = {
  run: PollerRun;
  stop: PollerStop;
};
declare function Poller({
  delayInMs
}?: PollerOptions): Poller;
//#endregion
export { Poller, PollerCallback, PollerRun, PollerStop };
//# sourceMappingURL=poller-CIrx6NwR.d.ts.map