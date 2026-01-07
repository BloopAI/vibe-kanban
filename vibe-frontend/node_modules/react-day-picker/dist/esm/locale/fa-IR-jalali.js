import * as dateFnsJalali from "date-fns-jalali";
import { faIR as jalaliFaIR } from "date-fns-jalali/locale";
import { DateLib } from "../classes/DateLib.js";
/**
 * Persian (Iran) locale for the Jalali (Persian) calendar, extended with
 * DayPicker-specific translations.
 */
export const faIRJalali = {
    ...jalaliFaIR,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options, dateFnsJalali);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `امروز، ${label}`;
            if (modifiers.selected)
                label = `${label}، انتخاب شده`;
            return label;
        },
        labelMonthDropdown: "ماه را انتخاب کنید",
        labelNext: "رفتن به ماه بعد",
        labelPrevious: "رفتن به ماه قبل",
        labelWeekNumber: (weekNumber) => `هفته ${weekNumber}`,
        labelYearDropdown: "سال را انتخاب کنید",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options, dateFnsJalali)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options, dateFnsJalali);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `امروز، ${label}`;
            }
            return label;
        },
        labelNav: "نوار ناوبری",
        labelWeekNumberHeader: "شماره هفته",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options, dateFnsJalali)).format(date, "cccc"),
    },
};
