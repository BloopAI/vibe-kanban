import { tr as dateFnsTr } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Turkish locale extended with DayPicker-specific translations. */
export const tr = {
    ...dateFnsTr,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Bugün, ${label}`;
            if (modifiers.selected)
                label = `${label}, seçili`;
            return label;
        },
        labelMonthDropdown: "Ayı seçin",
        labelNext: "Sonraki aya git",
        labelPrevious: "Önceki aya git",
        labelWeekNumber: (weekNumber) => `Hafta ${weekNumber}`,
        labelYearDropdown: "Yılı seçin",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Bugün, ${label}`;
            }
            return label;
        },
        labelNav: "Gezinme çubuğu",
        labelWeekNumberHeader: "Hafta numarası",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
