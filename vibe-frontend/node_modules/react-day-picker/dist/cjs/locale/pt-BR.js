"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ptBR = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Portuguese (Brazil) locale extended with DayPicker-specific translations. */
exports.ptBR = {
    ...locale_1.ptBR,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Hoje, ${label}`;
            if (modifiers.selected)
                label = `${label}, selecionado`;
            return label;
        },
        labelMonthDropdown: "Escolha o mês",
        labelNext: "Ir para o próximo mês",
        labelPrevious: "Ir para o mês anterior",
        labelWeekNumber: (weekNumber) => `Semana ${weekNumber}`,
        labelYearDropdown: "Escolha o ano",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hoje, ${label}`;
            }
            return label;
        },
        labelNav: "Barra de navegação",
        labelWeekNumberHeader: "Número da semana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
