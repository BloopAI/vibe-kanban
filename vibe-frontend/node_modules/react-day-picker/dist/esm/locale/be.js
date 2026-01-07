import { be as dateFnsBe } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Belarusian locale extended with DayPicker-specific translations. */
export const be = {
    ...dateFnsBe,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Сёння, ${label}`;
            if (modifiers.selected)
                label = `${label}, абрана`;
            return label;
        },
        labelMonthDropdown: "Абярыце месяц",
        labelNext: "Перайсці да наступнага месяца",
        labelPrevious: "Перайсці да папярэдняга месяца",
        labelWeekNumber: (weekNumber) => `Тыдзень ${weekNumber}`,
        labelYearDropdown: "Абярыце год",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Сёння, ${label}`;
            }
            return label;
        },
        labelNav: "Панэль навігацыі",
        labelWeekNumberHeader: "Нумар тыдня",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
