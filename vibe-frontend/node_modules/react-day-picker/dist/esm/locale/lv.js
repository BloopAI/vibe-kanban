import { lv as dateFnsLv } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Latvian locale extended with DayPicker-specific translations. */
export const lv = {
    ...dateFnsLv,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Šodien, ${label}`;
            if (modifiers.selected)
                label = `${label}, izvēlēts`;
            return label;
        },
        labelMonthDropdown: "Izvēlieties mēnesi",
        labelNext: "Uz nākamo mēnesi",
        labelPrevious: "Uz iepriekšējo mēnesi",
        labelWeekNumber: (weekNumber) => `Nedēļa ${weekNumber}`,
        labelYearDropdown: "Izvēlieties gadu",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Šodien, ${label}`;
            }
            return label;
        },
        labelNav: "Navigācijas josla",
        labelWeekNumberHeader: "Nedēļas numurs",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
