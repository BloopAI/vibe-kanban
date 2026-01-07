import { lt as dateFnsLt } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Lithuanian locale extended with DayPicker-specific translations. */
export const lt = {
    ...dateFnsLt,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Šiandien, ${label}`;
            if (modifiers.selected)
                label = `${label}, pasirinkta`;
            return label;
        },
        labelMonthDropdown: "Pasirinkite mėnesį",
        labelNext: "Pereiti į kitą mėnesį",
        labelPrevious: "Pereiti į ankstesnį mėnesį",
        labelWeekNumber: (weekNumber) => `Savaitė ${weekNumber}`,
        labelYearDropdown: "Pasirinkite metus",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Šiandien, ${label}`;
            }
            return label;
        },
        labelNav: "Naršymo juosta",
        labelWeekNumberHeader: "Savaitės numeris",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
