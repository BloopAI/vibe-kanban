import { ru as dateFnsRu } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Russian locale extended with DayPicker-specific translations. */
export const ru = {
    ...dateFnsRu,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Сегодня, ${label}`;
            if (modifiers.selected)
                label = `${label}, выбрано`;
            return label;
        },
        labelMonthDropdown: "Выберите месяц",
        labelNext: "Перейти к следующему месяцу",
        labelPrevious: "Перейти к предыдущему месяцу",
        labelWeekNumber: (weekNumber) => `Неделя ${weekNumber}`,
        labelYearDropdown: "Выберите год",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Сегодня, ${label}`;
            }
            return label;
        },
        labelNav: "Панель навигации",
        labelWeekNumberHeader: "Номер недели",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
