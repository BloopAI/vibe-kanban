import * as dateFnsJalali from "date-fns-jalali";
import { enUS as jalaliEnUS } from "date-fns-jalali/locale";
import { DateLib } from "../classes/DateLib.js";
/**
 * English (United States) locale for the Jalali (Persian) calendar, extended
 * with DayPicker-specific translations.
 */
export const enUSJalali = {
    ...jalaliEnUS,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options, dateFnsJalali);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Today, ${label}`;
            if (modifiers.selected)
                label = `${label}, selected`;
            return label;
        },
        labelMonthDropdown: "Choose the Month",
        labelNext: "Go to the Next Month",
        labelPrevious: "Go to the Previous Month",
        labelWeekNumber: (weekNumber) => `Week ${weekNumber}`,
        labelYearDropdown: "Choose the Year",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options, dateFnsJalali)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options, dateFnsJalali);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Today, ${label}`;
            }
            return label;
        },
        labelNav: "Navigation bar",
        labelWeekNumberHeader: "Week Number",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options, dateFnsJalali)).format(date, "cccc"),
    },
};
