import { he as dateFnsHe } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Hebrew locale extended with DayPicker-specific translations. */
export const he = {
    ...dateFnsHe,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `היום, ${label}`;
            if (modifiers.selected)
                label = `${label}, נבחר`;
            return label;
        },
        labelMonthDropdown: "בחר את החודש",
        labelNext: "עבור לחודש הבא",
        labelPrevious: "עבור לחודש הקודם",
        labelWeekNumber: (weekNumber) => `שבוע ${weekNumber}`,
        labelYearDropdown: "בחר את השנה",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `היום, ${label}`;
            }
            return label;
        },
        labelNav: "סרגל ניווט",
        labelWeekNumberHeader: "מספר שבוע",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
