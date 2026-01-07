import { eo as dateFnsEo } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Esperanto locale extended with DayPicker-specific translations. */
export const eo = {
    ...dateFnsEo,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Hodiaŭ, ${label}`;
            if (modifiers.selected)
                label = `${label}, elektita`;
            return label;
        },
        labelMonthDropdown: "Elektu la monaton",
        labelNext: "Iru al la sekva monato",
        labelPrevious: "Iru al la antaŭa monato",
        labelWeekNumber: (weekNumber) => `Semajno ${weekNumber}`,
        labelYearDropdown: "Elektu la jaron",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hodiaŭ, ${label}`;
            }
            return label;
        },
        labelNav: "Naviga breto",
        labelWeekNumberHeader: "Semajna numero",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
