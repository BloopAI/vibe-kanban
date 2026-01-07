import { uk as dateFnsUk } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Ukrainian locale extended with DayPicker-specific translations. */
export const uk = {
    ...dateFnsUk,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Сьогодні, ${label}`;
            if (modifiers.selected)
                label = `${label}, вибрано`;
            return label;
        },
        labelMonthDropdown: "Виберіть місяць",
        labelNext: "Перейти до наступного місяця",
        labelPrevious: "Перейти до попереднього місяця",
        labelWeekNumber: (weekNumber) => `Тиждень ${weekNumber}`,
        labelYearDropdown: "Виберіть рік",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Сьогодні, ${label}`;
            }
            return label;
        },
        labelNav: "Панель навігації",
        labelWeekNumberHeader: "Номер тижня",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
