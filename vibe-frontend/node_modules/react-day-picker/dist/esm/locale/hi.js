import { hi as dateFnsHi } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Hindi locale extended with DayPicker-specific translations. */
export const hi = {
    ...dateFnsHi,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `आज, ${label}`;
            if (modifiers.selected)
                label = `${label}, चयनित`;
            return label;
        },
        labelMonthDropdown: "महीना चुनें",
        labelNext: "अगले महीने पर जाएं",
        labelPrevious: "पिछले महीने पर जाएं",
        labelWeekNumber: (weekNumber) => `सप्ताह ${weekNumber}`,
        labelYearDropdown: "वर्ष चुनें",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `आज, ${label}`;
            }
            return label;
        },
        labelNav: "नेविगेशन बार",
        labelWeekNumberHeader: "सप्ताह संख्या",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
