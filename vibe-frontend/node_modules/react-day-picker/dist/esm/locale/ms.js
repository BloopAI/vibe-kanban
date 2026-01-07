import { ms as dateFnsMs } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Malay locale extended with DayPicker-specific translations. */
export const ms = {
    ...dateFnsMs,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Hari ini, ${label}`;
            if (modifiers.selected)
                label = `${label}, dipilih`;
            return label;
        },
        labelMonthDropdown: "Pilih bulan",
        labelNext: "Pergi ke bulan seterusnya",
        labelPrevious: "Pergi ke bulan sebelumnya",
        labelWeekNumber: (weekNumber) => `Minggu ${weekNumber}`,
        labelYearDropdown: "Pilih tahun",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hari ini, ${label}`;
            }
            return label;
        },
        labelNav: "Bar navigasi",
        labelWeekNumberHeader: "Nombor minggu",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
