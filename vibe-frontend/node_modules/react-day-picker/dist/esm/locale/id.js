import { id as dateFnsId } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Indonesian locale extended with DayPicker-specific translations. */
export const id = {
    ...dateFnsId,
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
        labelNext: "Ke bulan berikutnya",
        labelPrevious: "Ke bulan sebelumnya",
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
        labelNav: "Bilah navigasi",
        labelWeekNumberHeader: "Nomor minggu",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
