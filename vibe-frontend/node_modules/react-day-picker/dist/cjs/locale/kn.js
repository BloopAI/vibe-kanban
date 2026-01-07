"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kn = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Kannada locale extended with DayPicker-specific translations. */
exports.kn = {
    ...locale_1.kn,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `ಇಂದು, ${label}`;
            if (modifiers.selected)
                label = `${label}, ಆಯ್ಕೆ ಮಾಡಿದ`;
            return label;
        },
        labelMonthDropdown: "ತಿಂಗಳ ಆಯ್ಕೆ",
        labelNext: "ಮುಂದಿನ ತಿಂಗಳಿಗೆ ಹೋಗಿ",
        labelPrevious: "ಹಿಂದಿನ ತಿಂಗಳಿಗೆ ಹೋಗಿ",
        labelWeekNumber: (weekNumber) => `ವಾರ ${weekNumber}`,
        labelYearDropdown: "ವರ್ಷ ಆಯ್ಕೆಮಾಡಿ",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `ಇಂದು, ${label}`;
            }
            return label;
        },
        labelNav: "ನವಿಗೇಶನ್ ಪಟ್ಟೆ",
        labelWeekNumberHeader: "ವಾರ ಸಂಖ್ಯೆ",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
