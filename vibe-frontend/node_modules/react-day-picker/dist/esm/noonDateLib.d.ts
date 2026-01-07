import type { Locale } from "date-fns";
import type { DateLib } from "./classes/DateLib.js";
export interface CreateNoonOverridesOptions {
    weekStartsOn?: number;
    locale?: Locale;
}
/**
 * Creates `dateLib` overrides that keep all calendar math at noon in the target
 * time zone. This avoids second-level offset changes (e.g., historical zones
 * with +03:41:12) from pushing dates backward across midnight.
 */
export declare function createNoonOverrides(timeZone: string, options?: CreateNoonOverridesOptions): Partial<typeof DateLib.prototype>;
