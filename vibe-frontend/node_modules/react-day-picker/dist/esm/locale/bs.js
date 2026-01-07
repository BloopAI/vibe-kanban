import { bs as dateFnsBs } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Bosnian locale extended with DayPicker-specific translations. */
export const bs = {
    ...dateFnsBs,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Danas, ${label}`;
            if (modifiers.selected)
                label = `${label}, odabrano`;
            return label;
        },
        labelMonthDropdown: "Odaberite mjesec",
        labelNext: "Idi na sljedeći mjesec",
        labelPrevious: "Idi na prethodni mjesec",
        labelWeekNumber: (weekNumber) => `Sedmica ${weekNumber}`,
        labelYearDropdown: "Odaberite godinu",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Danas, ${label}`;
            }
            return label;
        },
        labelNav: "Navigacijska traka",
        labelWeekNumberHeader: "Broj sedmice",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
