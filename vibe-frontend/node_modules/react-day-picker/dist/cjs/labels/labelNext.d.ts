import type { DateLibOptions } from "../classes/DateLib.js";
/**
 * Generates the ARIA label for the "next month" button.
 *
 * @defaultValue `"Go to the Next Month"`
 * @param month - The date representing the next month, or `undefined` if there
 *   is no next month.
 * @returns The ARIA label for the "next month" button.
 * @group Labels
 * @see https://daypicker.dev/docs/translation#aria-labels
 */
export declare function labelNext(_month: Date | undefined, _options?: DateLibOptions): string;
