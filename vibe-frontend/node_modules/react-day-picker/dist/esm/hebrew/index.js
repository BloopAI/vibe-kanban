import React from "react";
import { DateLib, DayPicker as DayPickerComponent, } from "../index.js";
import { he } from "../locale/he.js";
import * as hebrewDateLib from "./lib/index.js";
/**
 * Render the Hebrew (lunisolar) calendar.
 *
 * Months follow the Hebrew lunisolar cycle with leap years containing Adar I
 * and Adar II. Weeks remain Sunday–Saturday.
 *
 * Defaults:
 *
 * - `locale`: `he`
 * - `dir`: `rtl`
 * - `numerals`: `latn`
 */
export function DayPicker(props) {
    const dateLib = getDateLib({
        locale: props.locale,
        weekStartsOn: props.broadcastCalendar ? 1 : props.weekStartsOn,
        firstWeekContainsDate: props.firstWeekContainsDate,
        useAdditionalWeekYearTokens: props.useAdditionalWeekYearTokens,
        useAdditionalDayOfYearTokens: props.useAdditionalDayOfYearTokens,
        timeZone: props.timeZone,
    });
    return (React.createElement(DayPickerComponent, { ...props, locale: props.locale ?? he, numerals: props.numerals ?? "latn", dir: props.dir ?? "rtl", dateLib: dateLib }));
}
/** Returns the date library used in the Hebrew calendar. */
export const getDateLib = (options) => {
    return new DateLib(options, hebrewDateLib);
};
export { enUS } from "../locale/en-US.js";
export { he } from "../locale/he.js";
