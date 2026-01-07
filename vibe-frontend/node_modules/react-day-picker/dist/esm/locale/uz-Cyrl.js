import { uzCyrl as dateFnsUzCyrl } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Uzbek (Cyrillic) locale extended with DayPicker-specific translations. */
export const uzCyrl = {
    ...dateFnsUzCyrl,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Бугун, ${label}`;
            if (modifiers.selected)
                label = `${label}, танланган`;
            return label;
        },
        labelMonthDropdown: "Ойни танланг",
        labelNext: "Кейинги ойга ўтинг",
        labelPrevious: "Олдинги ойга ўтинг",
        labelWeekNumber: (weekNumber) => `Ҳафта ${weekNumber}`,
        labelYearDropdown: "Йилни танланг",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Бугун, ${label}`;
            }
            return label;
        },
        labelNav: "Навигация панели",
        labelWeekNumberHeader: "Ҳафта рақами",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
