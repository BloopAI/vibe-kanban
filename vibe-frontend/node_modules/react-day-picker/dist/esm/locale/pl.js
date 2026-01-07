import { pl as dateFnsPl } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Polish locale extended with DayPicker-specific translations. */
export const pl = {
    ...dateFnsPl,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Dziś, ${label}`;
            if (modifiers.selected)
                label = `${label}, zaznaczony`;
            return label;
        },
        labelMonthDropdown: "Wybierz miesiąc",
        labelNext: "Przejdź do następnego miesiąca",
        labelPrevious: "Przejdź do poprzedniego miesiąca",
        labelWeekNumber: (weekNumber) => `Tydzień ${weekNumber}`,
        labelYearDropdown: "Wybierz rok",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Dziś, ${label}`;
            }
            return label;
        },
        labelNav: "Pasek nawigacyjny",
        labelWeekNumberHeader: "Numer tygodnia",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
