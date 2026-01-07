//#region src/color.ts
const IS_HEX_COLOR_REGEX = /^#?([A-F0-9]{6}|[A-F0-9]{3})$/i;
const IS_RGB_COLOR_REGEX = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i;
const IS_RGBA_COLOR_REGEX = /^rgba\((\d+),\s*(\d+),\s*(\d+)(,\s*\d+(\.\d+)?)\)$/i;
const IS_HSL_COLOR_REGEX = /^hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)$/i;
const IS_HSLA_COLOR_REGEX = /^hsla\((\d+),\s*([\d.]+)%,\s*([\d.]+)%(,\s*\d+(\.\d+)?)*\)$/i;
const isValidHexString = (s) => {
	return !!s.match(IS_HEX_COLOR_REGEX);
};
const isValidRgbaString = (s) => {
	return !!(s.match(IS_RGB_COLOR_REGEX) || s.match(IS_RGBA_COLOR_REGEX));
};
const isValidHslaString = (s) => {
	return !!s.match(IS_HSL_COLOR_REGEX) || !!s.match(IS_HSLA_COLOR_REGEX);
};
const isRGBColor = (c) => {
	return typeof c !== "string" && "r" in c;
};
const isHSLColor = (c) => {
	return typeof c !== "string" && "h" in c;
};
const isTransparent = (c) => {
	return c === "transparent";
};
const hasAlpha = (color) => {
	return typeof color !== "string" && color.a != void 0 && color.a < 1;
};
const CLEAN_HSLA_REGEX = /[hsla()]/g;
const CLEAN_RGBA_REGEX = /[rgba()]/g;
const stringToHslaColor = (value) => {
	if (value === "transparent") return {
		h: 0,
		s: 0,
		l: 0,
		a: 0
	};
	if (isValidHexString(value)) return hexStringToHslaColor(value);
	if (isValidHslaString(value)) return parseHslaString(value);
	if (isValidRgbaString(value)) return rgbaStringToHslaColor(value);
	return null;
};
const stringToSameTypeColor = (value) => {
	value = value.trim();
	if (isValidHexString(value)) return value.startsWith("#") ? value : `#${value}`;
	if (isValidRgbaString(value)) return parseRgbaString(value);
	if (isValidHslaString(value)) return parseHslaString(value);
	if (isTransparent(value)) return value;
	return "";
};
const colorToSameTypeString = (color) => {
	if (typeof color === "string" && (isValidHexString(color) || isTransparent(color))) return color;
	if (isRGBColor(color)) return rgbaColorToRgbaString(color);
	if (isHSLColor(color)) return hslaColorToHslaString(color);
	return "";
};
const hexStringToRgbaColor = (hex) => {
	hex = hex.replace("#", "");
	return {
		r: parseInt(hex.substring(0, 2), 16),
		g: parseInt(hex.substring(2, 4), 16),
		b: parseInt(hex.substring(4, 6), 16)
	};
};
const rgbaColorToRgbaString = (color) => {
	const { a, b, g, r } = color;
	return color.a === 0 ? "transparent" : color.a != void 0 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
};
const hslaColorToHslaString = (color) => {
	const { h, s, l, a } = color;
	const sPerc = Math.round(s * 100);
	const lPerc = Math.round(l * 100);
	return color.a === 0 ? "transparent" : color.a != void 0 ? `hsla(${h},${sPerc}%,${lPerc}%,${a})` : `hsl(${h},${sPerc}%,${lPerc}%)`;
};
const hexStringToHslaColor = (hex) => {
	return rgbaStringToHslaColor(colorToSameTypeString(hexStringToRgbaColor(hex)));
};
const rgbaStringToHslaColor = (rgba) => {
	const rgbaColor = parseRgbaString(rgba);
	const r = rgbaColor.r / 255;
	const g = rgbaColor.g / 255;
	const b = rgbaColor.b / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	let h, s;
	const l = (max + min) / 2;
	if (max == min) h = s = 0;
	else {
		const d = max - min;
		s = l >= .5 ? d / (2 - (max + min)) : d / (max + min);
		switch (max) {
			case r:
				h = (g - b) / d * 60;
				break;
			case g:
				h = ((b - r) / d + 2) * 60;
				break;
			default:
				h = ((r - g) / d + 4) * 60;
				break;
		}
	}
	const res = {
		h: Math.round(h),
		s,
		l
	};
	const a = rgbaColor.a;
	if (a != void 0) res.a = a;
	return res;
};
const parseRgbaString = (str) => {
	const [r, g, b, a] = str.replace(CLEAN_RGBA_REGEX, "").split(",").map((c) => Number.parseFloat(c));
	return {
		r,
		g,
		b,
		a
	};
};
const parseHslaString = (str) => {
	const [h, s, l, a] = str.replace(CLEAN_HSLA_REGEX, "").split(",").map((c) => Number.parseFloat(c));
	return {
		h,
		s: s / 100,
		l: l / 100,
		a
	};
};

//#endregion
export { colorToSameTypeString, hasAlpha, hexStringToRgbaColor, isHSLColor, isRGBColor, isTransparent, isValidHexString, isValidHslaString, isValidRgbaString, stringToHslaColor, stringToSameTypeColor };
//# sourceMappingURL=color-ClT_EEI3.mjs.map