import { sr as dateFnsSr } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Serbian (Cyrillic) locale extended with DayPicker-specific translations. */
export const sr = {
    ...dateFnsSr,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Данас, ${label}`;
            if (modifiers.selected)
                label = `${label}, изабрано`;
            return label;
        },
        labelMonthDropdown: "Изаберите месец",
        labelNext: "Идите на следећи месец",
        labelPrevious: "Идите на претходни месец",
        labelWeekNumber: (weekNumber) => `Недеља ${weekNumber}`,
        labelYearDropdown: "Изаберите годину",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Данас, ${label}`;
            }
            return label;
        },
        labelNav: "Навигациона трака",
        labelWeekNumberHeader: "Број недеље",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
