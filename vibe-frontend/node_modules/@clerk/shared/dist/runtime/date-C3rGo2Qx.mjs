//#region src/date.ts
const MILLISECONDS_IN_DAY = 864e5;
function dateTo12HourTime(date) {
	if (!date) return "";
	return date.toLocaleString("en-US", {
		hour: "2-digit",
		minute: "numeric",
		hour12: true
	});
}
function differenceInCalendarDays(a, b, { absolute = true } = {}) {
	if (!a || !b) return 0;
	const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
	const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
	const diff = Math.floor((utcB - utcA) / MILLISECONDS_IN_DAY);
	return absolute ? Math.abs(diff) : diff;
}
function normalizeDate(d) {
	try {
		return new Date(d || /* @__PURE__ */ new Date());
	} catch {
		return /* @__PURE__ */ new Date();
	}
}
function formatRelative(props) {
	const { date, relativeTo } = props;
	if (!date || !relativeTo) return null;
	const a = normalizeDate(date);
	const differenceInDays = differenceInCalendarDays(normalizeDate(relativeTo), a, { absolute: false });
	if (differenceInDays < -6) return {
		relativeDateCase: "other",
		date: a
	};
	if (differenceInDays < -1) return {
		relativeDateCase: "previous6Days",
		date: a
	};
	if (differenceInDays === -1) return {
		relativeDateCase: "lastDay",
		date: a
	};
	if (differenceInDays === 0) return {
		relativeDateCase: "sameDay",
		date: a
	};
	if (differenceInDays === 1) return {
		relativeDateCase: "nextDay",
		date: a
	};
	if (differenceInDays < 7) return {
		relativeDateCase: "next6Days",
		date: a
	};
	return {
		relativeDateCase: "other",
		date: a
	};
}
function addYears(initialDate, yearsToAdd) {
	const date = normalizeDate(initialDate);
	date.setFullYear(date.getFullYear() + yearsToAdd);
	return date;
}

//#endregion
export { addYears, dateTo12HourTime, differenceInCalendarDays, formatRelative, normalizeDate };
//# sourceMappingURL=date-C3rGo2Qx.mjs.map