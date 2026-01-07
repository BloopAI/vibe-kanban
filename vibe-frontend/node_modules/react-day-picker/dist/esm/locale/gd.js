import { gd as dateFnsGd } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Scottish Gaelic locale extended with DayPicker-specific translations. */
export const gd = {
    ...dateFnsGd,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `An-diugh, ${label}`;
            if (modifiers.selected)
                label = `${label}, air a thaghadh`;
            return label;
        },
        labelMonthDropdown: "Tagh am mìos",
        labelNext: "Rach gu mìos an ath mhìos",
        labelPrevious: "Rach gu mìos roimhe",
        labelWeekNumber: (weekNumber) => `Seachdain ${weekNumber}`,
        labelYearDropdown: "Tagh am bliadhna",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `An-diugh, ${label}`;
            }
            return label;
        },
        labelNav: "Bàr seòlaidh",
        labelWeekNumberHeader: "Àireamh seachdain",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
