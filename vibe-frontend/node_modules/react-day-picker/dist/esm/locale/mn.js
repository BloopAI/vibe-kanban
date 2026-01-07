import { mn as dateFnsMn } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Mongolian locale extended with DayPicker-specific translations. */
export const mn = {
    ...dateFnsMn,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Өнөөдөр, ${label}`;
            if (modifiers.selected)
                label = `${label}, сонгогдсон`;
            return label;
        },
        labelMonthDropdown: "Сараа сонгоно уу",
        labelNext: "Дараагийн сар руу очих",
        labelPrevious: "Өмнөх сар руу очих",
        labelWeekNumber: (weekNumber) => `Долоо хоног ${weekNumber}`,
        labelYearDropdown: "Жилээ сонгоно уу",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Өнөөдөр, ${label}`;
            }
            return label;
        },
        labelNav: "Навигацийн самбар",
        labelWeekNumberHeader: "Долоо хонгийн дугаар",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
