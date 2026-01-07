import { gu as dateFnsGu } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Gujarati locale extended with DayPicker-specific translations. */
export const gu = {
    ...dateFnsGu,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `આજે, ${label}`;
            if (modifiers.selected)
                label = `${label}, પસંદ કરાયેલ`;
            return label;
        },
        labelMonthDropdown: "મહિનો પસંદ કરો",
        labelNext: "આગલા મહિને જાઓ",
        labelPrevious: "પાછલા મહિને જાઓ",
        labelWeekNumber: (weekNumber) => `અઠવાડિયું ${weekNumber}`,
        labelYearDropdown: "વર્ષ પસંદ કરો",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `આજે, ${label}`;
            }
            return label;
        },
        labelNav: "નેવિગેશન બાર",
        labelWeekNumberHeader: "અઠવાડિયાનો નંબર",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
