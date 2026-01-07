import { faIR as dateFnsFaIR } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Persian (Iran) locale extended with DayPicker-specific translations. */
export const faIR = {
    ...dateFnsFaIR,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
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
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `امروز، ${label}`;
            }
            return label;
        },
        labelNav: "نوار ناوبری",
        labelWeekNumberHeader: "شماره هفته",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
