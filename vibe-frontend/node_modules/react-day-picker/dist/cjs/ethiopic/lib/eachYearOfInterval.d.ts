import type { Interval } from "date-fns";
/**
 * Returns the start of each Ethiopic year included in the given interval.
 *
 * @param interval The interval whose years should be returned.
 */
export declare function eachYearOfInterval(interval: Interval): Date[];
