import type { DateLib } from "./classes/DateLib.js";
import type { CreateNoonOverridesOptions } from "./noonDateLib.js";
/**
 * Jalali-aware version of {@link createNoonDateLibOverrides}.
 *
 * Keeps all calendar math at noon in the target time zone while deferring to
 * `date-fns-jalali` for calendar logic.
 */
export declare function createJalaliNoonOverrides(timeZone: string, options?: CreateNoonOverridesOptions): Partial<typeof DateLib.prototype>;
