"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jaHira = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Japanese (Hiragana) locale extended with DayPicker-specific translations. */
exports.jaHira = {
    ...locale_1.jaHira,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `きょう、${label}`;
            if (modifiers.selected)
                label = `${label}、せんたくずみ`;
            return label;
        },
        labelMonthDropdown: "つきをえらぶ",
        labelNext: "つぎのつきへ",
        labelPrevious: "まえのつきへ",
        labelWeekNumber: (weekNumber) => `しゅう ${weekNumber}`,
        labelYearDropdown: "としをえらぶ",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `きょう、${label}`;
            }
            return label;
        },
        labelNav: "ナビゲーションバー",
        labelWeekNumberHeader: "しゅうばんごう",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
