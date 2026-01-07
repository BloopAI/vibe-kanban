"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.th = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Thai locale extended with DayPicker-specific translations. */
exports.th = {
    ...locale_1.th,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `วันนี้, ${label}`;
            if (modifiers.selected)
                label = `${label}, เลือกแล้ว`;
            return label;
        },
        labelMonthDropdown: "เลือกเดือน",
        labelNext: "ไปเดือนถัดไป",
        labelPrevious: "ไปเดือนก่อนหน้า",
        labelWeekNumber: (weekNumber) => `สัปดาห์ ${weekNumber}`,
        labelYearDropdown: "เลือกปี",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `วันนี้, ${label}`;
            }
            return label;
        },
        labelNav: "แถบนำทาง",
        labelWeekNumberHeader: "หมายเลขสัปดาห์",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
