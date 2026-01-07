"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enUS = void 0;
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
/** English (United States) locale extended with DayPicker-specific translations. */
exports.enUS = {
    ...locale_1.enUS,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            let formatDate;
            if (dateLib && typeof dateLib.format === "function") {
                formatDate = dateLib.format.bind(dateLib);
            }
            else {
                formatDate = (d, pattern) => (0, date_fns_1.format)(d, pattern, { locale: locale_1.enUS, ...options });
            }
            let label = formatDate(date, "PPPP");
            if (modifiers.today)
                label = `Today, ${label}`;
            if (modifiers.selected)
                label = `${label}, selected`;
            return label;
        },
        labelMonthDropdown: "Choose the Month",
        labelNext: "Go to the Next Month",
        labelPrevious: "Go to the Previous Month",
        labelWeekNumber: (weekNumber) => `Week ${weekNumber}`,
        labelYearDropdown: "Choose the Year",
        labelGrid: (date, options, dateLib) => {
            let formatDate;
            if (dateLib && typeof dateLib.format === "function") {
                formatDate = dateLib.format.bind(dateLib);
            }
            else {
                formatDate = (d, pattern) => (0, date_fns_1.format)(d, pattern, { locale: locale_1.enUS, ...options });
            }
            return formatDate(date, "LLLL yyyy");
        },
        labelGridcell: (date, modifiers, options, dateLib) => {
            let formatDate;
            if (dateLib && typeof dateLib.format === "function") {
                formatDate = dateLib.format.bind(dateLib);
            }
            else {
                formatDate = (d, pattern) => (0, date_fns_1.format)(d, pattern, { locale: locale_1.enUS, ...options });
            }
            let label = formatDate(date, "PPPP");
            if (modifiers?.today) {
                label = `Today, ${label}`;
            }
            return label;
        },
        labelNav: "Navigation bar",
        labelWeekNumberHeader: "Week Number",
        labelWeekday: (date, options, dateLib) => {
            let formatDate;
            if (dateLib && typeof dateLib.format === "function") {
                formatDate = dateLib.format.bind(dateLib);
            }
            else {
                formatDate = (d, pattern) => (0, date_fns_1.format)(d, pattern, { locale: locale_1.enUS, ...options });
            }
            return formatDate(date, "cccc");
        },
    },
};
