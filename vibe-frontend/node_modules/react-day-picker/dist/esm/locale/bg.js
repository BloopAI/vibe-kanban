import { bg as dateFnsBg } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Bulgarian locale extended with DayPicker-specific translations. */
export const bg = {
    ...dateFnsBg,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Днес, ${label}`;
            if (modifiers.selected)
                label = `${label}, избрано`;
            return label;
        },
        labelMonthDropdown: "Изберете месец",
        labelNext: "Към следващия месец",
        labelPrevious: "Към предишния месец",
        labelWeekNumber: (weekNumber) => `Седмица ${weekNumber}`,
        labelYearDropdown: "Изберете година",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Днес, ${label}`;
            }
            return label;
        },
        labelNav: "Лента за навигация",
        labelWeekNumberHeader: "Номер на седмица",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
