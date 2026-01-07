import type { Locale } from "date-fns";
import React from "react";
import { DateLib, type DateLibOptions } from "../index.js";
import type { DayPickerProps } from "../types/props.js";
export declare const th: import("../index.js").DayPickerLocale;
export declare const enUS: import("../index.js").DayPickerLocale;
/**
 * Render the Buddhist (Thai) calendar.
 *
 * Months/weeks are Gregorian; displayed year is Buddhist Era (BE = CE + 543).
 * Thai digits are used by default.
 *
 * Defaults:
 *
 * - `locale`: `th`
 * - `dir`: `ltr`
 * - `numerals`: `thai`
 */
export declare function DayPicker(props: DayPickerProps & {
    locale?: Locale;
    dir?: DayPickerProps["dir"];
    numerals?: DayPickerProps["numerals"];
    dateLib?: DayPickerProps["dateLib"];
}): React.JSX.Element;
/** Returns the date library used in the Buddhist calendar. */
export declare const getDateLib: (options?: DateLibOptions) => DateLib;
