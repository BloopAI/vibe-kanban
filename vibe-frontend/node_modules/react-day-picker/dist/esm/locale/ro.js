import { ro as dateFnsRo } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Romanian locale extended with DayPicker-specific translations. */
export const ro = {
    ...dateFnsRo,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Astăzi, ${label}`;
            if (modifiers.selected)
                label = `${label}, selectat`;
            return label;
        },
        labelMonthDropdown: "Alege luna",
        labelNext: "Mergi la luna următoare",
        labelPrevious: "Mergi la luna anterioară",
        labelWeekNumber: (weekNumber) => `Săptămâna ${weekNumber}`,
        labelYearDropdown: "Alege anul",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Astăzi, ${label}`;
            }
            return label;
        },
        labelNav: "Bară de navigare",
        labelWeekNumberHeader: "Numărul săptămânii",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
