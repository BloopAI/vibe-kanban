import { Color, HslaColor, RgbaColor, TransparentColor } from "./index-kcd5CugB.js";

//#region src/color.d.ts
declare const isValidHexString: (s: string) => boolean;
declare const isValidRgbaString: (s: string) => boolean;
declare const isValidHslaString: (s: string) => boolean;
declare const isRGBColor: (c: Color) => c is RgbaColor;
declare const isHSLColor: (c: Color) => c is HslaColor;
declare const isTransparent: (c: Color) => c is TransparentColor;
declare const hasAlpha: (color: Color) => boolean;
declare const stringToHslaColor: (value: string) => HslaColor | null;
declare const stringToSameTypeColor: (value: string) => Color;
declare const colorToSameTypeString: (color: Color) => string | TransparentColor;
declare const hexStringToRgbaColor: (hex: string) => RgbaColor;
//#endregion
export { colorToSameTypeString, hasAlpha, hexStringToRgbaColor, isHSLColor, isRGBColor, isTransparent, isValidHexString, isValidHslaString, isValidRgbaString, stringToHslaColor, stringToSameTypeColor };
//# sourceMappingURL=color-DOtT8qir.d.ts.map