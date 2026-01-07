import { sk as dateFnsSk } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Slovak locale extended with DayPicker-specific translations. */
export const sk = {
    ...dateFnsSk,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Dnes, ${label}`;
            if (modifiers.selected)
                label = `${label}, vybraté`;
            return label;
        },
        labelMonthDropdown: "Vyberte mesiac",
        labelNext: "Prejsť na ďalší mesiac",
        labelPrevious: "Prejsť na predchádzajúci mesiac",
        labelWeekNumber: (weekNumber) => `Týždeň ${weekNumber}`,
        labelYearDropdown: "Vyberte rok",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Dnes, ${label}`;
            }
            return label;
        },
        labelNav: "Navigačný panel",
        labelWeekNumberHeader: "Číslo týždňa",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
