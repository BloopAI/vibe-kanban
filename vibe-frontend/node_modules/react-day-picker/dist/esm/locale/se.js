import { se as dateFnsSe } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Northern Sami locale extended with DayPicker-specific translations. */
export const se = {
    ...dateFnsSe,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Ođđaid, ${label}`;
            if (modifiers.selected)
                label = `${label}, válljejuvvon`;
            return label;
        },
        labelMonthDropdown: "Vállje mánnu",
        labelNext: "Mana boahtte mánu",
        labelPrevious: "Mana ovddit mánu",
        labelWeekNumber: (weekNumber) => `Vahkku ${weekNumber}`,
        labelYearDropdown: "Vállje jahki",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Ođđaid, ${label}`;
            }
            return label;
        },
        labelNav: "Navigasuvnnabár",
        labelWeekNumberHeader: "Vahkku lohku",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
