import { et as dateFnsEt } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Estonian locale extended with DayPicker-specific translations. */
export const et = {
    ...dateFnsEt,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Täna, ${label}`;
            if (modifiers.selected)
                label = `${label}, valitud`;
            return label;
        },
        labelMonthDropdown: "Vali kuu",
        labelNext: "Mine järgmisele kuule",
        labelPrevious: "Mine eelmisele kuule",
        labelWeekNumber: (weekNumber) => `Nädal ${weekNumber}`,
        labelYearDropdown: "Vali aasta",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Täna, ${label}`;
            }
            return label;
        },
        labelNav: "Navigeerimisriba",
        labelWeekNumberHeader: "Nädala number",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
