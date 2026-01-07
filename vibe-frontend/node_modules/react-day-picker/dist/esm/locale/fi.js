import { fi as dateFnsFi } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Finnish locale extended with DayPicker-specific translations. */
export const fi = {
    ...dateFnsFi,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Tänään, ${label}`;
            if (modifiers.selected)
                label = `${label}, valittu`;
            return label;
        },
        labelMonthDropdown: "Valitse kuukausi",
        labelNext: "Siirry seuraavaan kuukauteen",
        labelPrevious: "Siirry edelliseen kuukauteen",
        labelWeekNumber: (weekNumber) => `Viikko ${weekNumber}`,
        labelYearDropdown: "Valitse vuosi",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Tänään, ${label}`;
            }
            return label;
        },
        labelNav: "Navigointipalkki",
        labelWeekNumberHeader: "Viikkonumero",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
