import { uz as dateFnsUz } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Uzbek (Latin) locale extended with DayPicker-specific translations. */
export const uz = {
    ...dateFnsUz,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Bugun, ${label}`;
            if (modifiers.selected)
                label = `${label}, tanlangan`;
            return label;
        },
        labelMonthDropdown: "Oyni tanlang",
        labelNext: "Keyingi oyga o'ting",
        labelPrevious: "Oldingi oyga o'ting",
        labelWeekNumber: (weekNumber) => `Hafta ${weekNumber}`,
        labelYearDropdown: "Yilni tanlang",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Bugun, ${label}`;
            }
            return label;
        },
        labelNav: "Navigatsiya paneli",
        labelWeekNumberHeader: "Hafta raqami",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
