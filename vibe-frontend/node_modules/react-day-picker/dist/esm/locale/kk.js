import { kk as dateFnsKk } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Kazakh locale extended with DayPicker-specific translations. */
export const kk = {
    ...dateFnsKk,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Бүгін, ${label}`;
            if (modifiers.selected)
                label = `${label}, таңдалған`;
            return label;
        },
        labelMonthDropdown: "Айды таңдаңыз",
        labelNext: "Келесі айға өту",
        labelPrevious: "Алдыңғы айға өту",
        labelWeekNumber: (weekNumber) => `Апта ${weekNumber}`,
        labelYearDropdown: "Жылды таңдаңыз",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Бүгін, ${label}`;
            }
            return label;
        },
        labelNav: "Навигация жолағы",
        labelWeekNumberHeader: "Апта нөмірі",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
