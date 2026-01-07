import { ptBR as dateFnsPtBR } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Portuguese (Brazil) locale extended with DayPicker-specific translations. */
export const ptBR = {
    ...dateFnsPtBR,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
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
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hoje, ${label}`;
            }
            return label;
        },
        labelNav: "Barra de navegação",
        labelWeekNumberHeader: "Número da semana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
