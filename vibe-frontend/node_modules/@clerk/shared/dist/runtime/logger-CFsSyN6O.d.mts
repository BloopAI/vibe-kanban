//#region src/logger.d.ts
declare const logger: {
  /**
   * A custom logger that ensures messages are logged only once.
   * Reduces noise and duplicated messages when logs are in a hot codepath.
   */
  warnOnce: (msg: string) => void;
  logOnce: (msg: string) => void;
};
//#endregion
export { logger };
//# sourceMappingURL=logger-CFsSyN6O.d.mts.map