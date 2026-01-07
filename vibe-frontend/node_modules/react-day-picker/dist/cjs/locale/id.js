"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.id = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Indonesian locale extended with DayPicker-specific translations. */
exports.id = {
    ...locale_1.id,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
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
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hari ini, ${label}`;
            }
            return label;
        },
        labelNav: "Bilah navigasi",
        labelWeekNumberHeader: "Nomor minggu",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
