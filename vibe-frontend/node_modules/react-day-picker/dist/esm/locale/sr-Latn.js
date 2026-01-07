import { srLatn as dateFnsSrLatn } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Serbian (Latin) locale extended with DayPicker-specific translations. */
export const srLatn = {
    ...dateFnsSrLatn,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Danas, ${label}`;
            if (modifiers.selected)
                label = `${label}, izabrano`;
            return label;
        },
        labelMonthDropdown: "Izaberite mesec",
        labelNext: "Idite na sledeći mesec",
        labelPrevious: "Idite na prethodni mesec",
        labelWeekNumber: (weekNumber) => `Nedelja ${weekNumber}`,
        labelYearDropdown: "Izaberite godinu",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Danas, ${label}`;
            }
            return label;
        },
        labelNav: "Navigaciona traka",
        labelWeekNumberHeader: "Broj nedelje",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
