import { sl as dateFnsSl } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Slovene locale extended with DayPicker-specific translations. */
export const sl = {
    ...dateFnsSl,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Danes, ${label}`;
            if (modifiers.selected)
                label = `${label}, izbrano`;
            return label;
        },
        labelMonthDropdown: "Izberite mesec",
        labelNext: "Pojdi na naslednji mesec",
        labelPrevious: "Pojdi na prejšnji mesec",
        labelWeekNumber: (weekNumber) => `Teden ${weekNumber}`,
        labelYearDropdown: "Izberite leto",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Danes, ${label}`;
            }
            return label;
        },
        labelNav: "Navigacijska vrstica",
        labelWeekNumberHeader: "Številka tedna",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
