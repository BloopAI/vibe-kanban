import { mt as dateFnsMt } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Maltese locale extended with DayPicker-specific translations. */
export const mt = {
    ...dateFnsMt,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Illum, ${label}`;
            if (modifiers.selected)
                label = `${label}, magħżul`;
            return label;
        },
        labelMonthDropdown: "Agħżel ix-xahar",
        labelNext: "Mur għax-xahar li jmiss",
        labelPrevious: "Mur għax-xahar ta' qabel",
        labelWeekNumber: (weekNumber) => `Ġimgħa ${weekNumber}`,
        labelYearDropdown: "Agħżel is-sena",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Illum, ${label}`;
            }
            return label;
        },
        labelNav: "Bar tan-navigazzjoni",
        labelWeekNumberHeader: "Numru tal-ġimgħa",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
