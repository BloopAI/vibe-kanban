"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.te = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Telugu locale extended with DayPicker-specific translations. */
exports.te = {
    ...locale_1.te,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `ఈ రోజు, ${label}`;
            if (modifiers.selected)
                label = `${label}, ఎంచుకోబడింది`;
            return label;
        },
        labelMonthDropdown: "నెలను ఎంచుకోండి",
        labelNext: "తదుపరి నెలకు వెళ్లండి",
        labelPrevious: "మునుపటి నెలకు వెళ్లండి",
        labelWeekNumber: (weekNumber) => `వారం ${weekNumber}`,
        labelYearDropdown: "సంవత్సరాన్ని ఎంచుకోండి",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `ఈ రోజు, ${label}`;
            }
            return label;
        },
        labelNav: "నావిగేషన్ పట్టీ",
        labelWeekNumberHeader: "వారం సంఖ్య",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
