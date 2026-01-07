"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ta = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Tamil locale extended with DayPicker-specific translations. */
exports.ta = {
    ...locale_1.ta,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `இன்று, ${label}`;
            if (modifiers.selected)
                label = `${label}, தேர்ந்தெடுக்கப்பட்டது`;
            return label;
        },
        labelMonthDropdown: "மாதத்தை தேர்வு செய்யவும்",
        labelNext: "அடுத்த மாதத்துக்கு செல்லவும்",
        labelPrevious: "முந்தைய மாதத்துக்கு செல்லவும்",
        labelWeekNumber: (weekNumber) => `வாரம் ${weekNumber}`,
        labelYearDropdown: "ஆண்டை தேர்வு செய்யவும்",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `இன்று, ${label}`;
            }
            return label;
        },
        labelNav: "வழிசெலுத்தல் பட்டை",
        labelWeekNumberHeader: "வார எண்",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
