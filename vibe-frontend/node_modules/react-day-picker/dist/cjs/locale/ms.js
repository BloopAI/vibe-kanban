"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ms = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Malay locale extended with DayPicker-specific translations. */
exports.ms = {
    ...locale_1.ms,
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
        labelNext: "Pergi ke bulan seterusnya",
        labelPrevious: "Pergi ke bulan sebelumnya",
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
        labelNav: "Bar navigasi",
        labelWeekNumberHeader: "Nombor minggu",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
