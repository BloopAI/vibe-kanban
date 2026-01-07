export class ColorConverters {
    static CMYK_G([c, y, m, k]: [any, any, any, any]): (string | number)[];
    static G_CMYK([g]: [any]): (string | number)[];
    static G_RGB([g]: [any]): any[];
    static G_HTML([g]: [any]): string;
    static RGB_G([r, g, b]: [any, any, any]): (string | number)[];
    static RGB_HTML([r, g, b]: [any, any, any]): string;
    static T_HTML(): string;
    static CMYK_RGB([c, y, m, k]: [any, any, any, any]): (string | number)[];
    static CMYK_HTML(components: any): string;
    static RGB_CMYK([r, g, b]: [any, any, any]): (string | number)[];
}
