import { beTarask as dateFnsBeTarask } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/**
 * Belarusian (Taraskievica) locale extended with DayPicker-specific
 * translations.
 */
export const beTarask = {
    ...dateFnsBeTarask,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Сёньня, ${label}`;
            if (modifiers.selected)
                label = `${label}, абрана`;
            return label;
        },
        labelMonthDropdown: "Выберыце месяц",
        labelNext: "Перайсьці да наступнага месяца",
        labelPrevious: "Перайсьці да папярэдняга месяца",
        labelWeekNumber: (weekNumber) => `Тыдзень ${weekNumber}`,
        labelYearDropdown: "Выберыце год",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Сёньня, ${label}`;
            }
            return label;
        },
        labelNav: "Панэль навігацыі",
        labelWeekNumberHeader: "Нумар тыдня",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
