import { hr as dateFnsHr } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Croatian locale extended with DayPicker-specific translations. */
export const hr = {
    ...dateFnsHr,
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
        labelNext: "Prijeđi na sljedeći mjesec",
        labelPrevious: "Prijeđi na prethodni mjesec",
        labelWeekNumber: (weekNumber) => `Tjedan ${weekNumber}`,
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
        labelWeekNumberHeader: "Broj tjedna",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
