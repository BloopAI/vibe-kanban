"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tr = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Turkish locale extended with DayPicker-specific translations. */
exports.tr = {
    ...locale_1.tr,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
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
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Bugün, ${label}`;
            }
            return label;
        },
        labelNav: "Gezinme çubuğu",
        labelWeekNumberHeader: "Hafta numarası",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
