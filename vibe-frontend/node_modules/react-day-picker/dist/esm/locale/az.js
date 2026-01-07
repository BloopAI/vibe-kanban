import { az as dateFnsAz } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Azerbaijani locale extended with DayPicker-specific translations. */
export const az = {
    ...dateFnsAz,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Bu gün, ${label}`;
            if (modifiers.selected)
                label = `${label}, seçilmiş`;
            return label;
        },
        labelMonthDropdown: "Ayı seçin",
        labelNext: "Növbəti aya keç",
        labelPrevious: "Əvvəlki aya keç",
        labelWeekNumber: (weekNumber) => `Həftə ${weekNumber}`,
        labelYearDropdown: "İli seçin",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Bu gün, ${label}`;
            }
            return label;
        },
        labelNav: "Naviqasiya paneli",
        labelWeekNumberHeader: "Həftə nömrəsi",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
