import { nn as dateFnsNn } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Norwegian Nynorsk locale extended with DayPicker-specific translations. */
export const nn = {
    ...dateFnsNn,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `I dag, ${label}`;
            if (modifiers.selected)
                label = `${label}, vald`;
            return label;
        },
        labelMonthDropdown: "Vel månad",
        labelNext: "Gå til neste månad",
        labelPrevious: "Gå til førre månad",
        labelWeekNumber: (weekNumber) => `Veke ${weekNumber}`,
        labelYearDropdown: "Vel år",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `I dag, ${label}`;
            }
            return label;
        },
        labelNav: "Navigasjonslinje",
        labelWeekNumberHeader: "Vekenummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
